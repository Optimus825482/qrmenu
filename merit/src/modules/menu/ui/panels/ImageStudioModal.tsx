"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { alertDialog } from "@/shell/confirm";
import { replaceMenuImageAction, uploadMenuImagesAction } from "../../server/actions/menuTree";

type Props = {
  isOpen: boolean;
  nodeId: string;
  nodeName: string;
  initialImageUrl: string;
  onClose(): void;
  onSaved(newImageUrl: string): void;
};

type CropAspect = "free" | "1:1" | "4:3" | "16:9";
type BgTool = "none" | "eyedropper" | "eraser" | "restore";

export function ImageStudioModal({
  isOpen,
  nodeId,
  nodeName,
  initialImageUrl,
  onClose,
  onSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);

  // Layer tracking: base canvas holds current cropped/transformed pixels
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Alpha mask canvas tracks transparency modifications (manual eraser/magic wand)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTab, setActiveTab] = useState<"crop" | "bg" | "adjust" | "presets">("crop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // Zoom level for canvas viewport
  const [zoom, setZoom] = useState(1);

  // ─── 1. Kırpma (Crop) State ───
  const [isCropping, setIsCropping] = useState(false);
  const [cropAspect, setCropAspect] = useState<CropAspect>("1:1");
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [cropDrag, setCropDrag] = useState<{
    type: "move" | "tl" | "tc" | "tr" | "rc" | "br" | "bc" | "bl" | "lc";
    startX: number;
    startY: number;
    startBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // ─── 2. Döndürme & Geometri ───
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // ─── 3. Renk & Işık Ayarları ───
  const [brightness, setBrightness] = useState(0); // -100 to 100
  const [contrast, setContrast] = useState(0); // -100 to 100
  const [saturation, setSaturation] = useState(0); // -100 to 100
  const [temperature, setTemperature] = useState(0); // -100 (cool) to 100 (warm)
  const [sharpen, setSharpen] = useState(false);

  // ─── 4. Arka Plan Kaldırma ───
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(25); // 5 to 60
  const [bgFeather, setBgFeather] = useState(1); // 0 to 4
  const [bgTool, setBgTool] = useState<BgTool>("none");
  const [brushSize, setBrushSize] = useState(30); // 5 to 100
  const [isBrushing, setIsBrushing] = useState(false);
  const [eyedropperColor, setEyedropperColor] = useState<[number, number, number] | null>(null);

  // Load Image and initialize offscreen base canvas
  useEffect(() => {
    if (!isOpen || !initialImageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = initialImageUrl;
    img.onload = () => {
      originalImgRef.current = img;

      const base = document.createElement("canvas");
      base.width = img.naturalWidth;
      base.height = img.naturalHeight;
      const bCtx = base.getContext("2d");
      if (bCtx) bCtx.drawImage(img, 0, 0);
      baseCanvasRef.current = base;

      const mask = document.createElement("canvas");
      mask.width = img.naturalWidth;
      mask.height = img.naturalHeight;
      const mCtx = mask.getContext("2d");
      if (mCtx) {
        mCtx.fillStyle = "#ffffff";
        mCtx.fillRect(0, 0, mask.width, mask.height);
      }
      maskCanvasRef.current = mask;

      // Initialize crop box to 80% centered square
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const initSize = Math.round(minDim * 0.85);
      setCropBox({
        x: Math.round((img.naturalWidth - initSize) / 2),
        y: Math.round((img.naturalHeight - initSize) / 2),
        width: initSize,
        height: initSize,
      });

      setImgLoaded(true);
    };
    img.onerror = () => {
      setError("Görsel yüklenemedi");
    };
  }, [isOpen, initialImageUrl]);

  // Full Reset to Original
  const handleResetAll = useCallback(() => {
    const img = originalImgRef.current;
    if (!img) return;

    const base = baseCanvasRef.current;
    if (base) {
      base.width = img.naturalWidth;
      base.height = img.naturalHeight;
      const bCtx = base.getContext("2d");
      if (bCtx) bCtx.drawImage(img, 0, 0);
    }

    const mask = maskCanvasRef.current;
    if (mask) {
      mask.width = img.naturalWidth;
      mask.height = img.naturalHeight;
      const mCtx = mask.getContext("2d");
      if (mCtx) {
        mCtx.fillStyle = "#ffffff";
        mCtx.fillRect(0, 0, mask.width, mask.height);
      }
    }

    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setTemperature(0);
    setSharpen(false);
    setRemoveWhiteBg(false);
    setBgTolerance(25);
    setBgFeather(1);
    setEyedropperColor(null);
    setBgTool("none");
    setIsCropping(false);
  }, []);

  // Quick Presets
  const applyPreset = (preset: "default" | "gourmet" | "warm" | "crisp" | "fineDining" | "bw") => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setTemperature(0);
    setSharpen(false);

    if (preset === "gourmet") {
      setBrightness(6);
      setContrast(18);
      setSaturation(26);
      setTemperature(14);
      setSharpen(true);
    } else if (preset === "warm") {
      setBrightness(5);
      setContrast(12);
      setSaturation(16);
      setTemperature(28);
    } else if (preset === "crisp") {
      setContrast(26);
      setSaturation(12);
      setSharpen(true);
    } else if (preset === "fineDining") {
      setBrightness(-4);
      setContrast(22);
      setSaturation(14);
      setTemperature(6);
      setSharpen(true);
    } else if (preset === "bw") {
      setSaturation(-100);
      setContrast(22);
    }
  };

  // Execute Crop on base canvas
  const applyCrop = () => {
    const base = baseCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!base || !mask) return;

    const { x, y, width, height } = cropBox;
    if (width <= 0 || height <= 0) return;

    // Crop base image
    const croppedBase = document.createElement("canvas");
    croppedBase.width = width;
    croppedBase.height = height;
    const cbCtx = croppedBase.getContext("2d");
    if (cbCtx) cbCtx.drawImage(base, x, y, width, height, 0, 0, width, height);

    // Crop mask
    const croppedMask = document.createElement("canvas");
    croppedMask.width = width;
    croppedMask.height = height;
    const cmCtx = croppedMask.getContext("2d");
    if (cmCtx) cmCtx.drawImage(mask, x, y, width, height, 0, 0, width, height);

    baseCanvasRef.current = croppedBase;
    maskCanvasRef.current = croppedMask;

    setIsCropping(false);

    // Reset crop box for newly sized canvas
    const minDim = Math.min(width, height);
    const newBoxSize = Math.round(minDim * 0.85);
    setCropBox({
      x: Math.round((width - newBoxSize) / 2),
      y: Math.round((height - newBoxSize) / 2),
      width: newBoxSize,
      height: newBoxSize,
    });
  };

  // Change Crop Aspect Ratio Box
  const handleSetAspect = (aspect: CropAspect) => {
    setCropAspect(aspect);
    setIsCropping(true);
    const base = baseCanvasRef.current;
    if (!base) return;

    const bW = base.width;
    const bH = base.height;

    let targetW = bW * 0.85;
    let targetH = bH * 0.85;

    if (aspect === "1:1") {
      const minDim = Math.min(bW, bH) * 0.85;
      targetW = minDim;
      targetH = minDim;
    } else if (aspect === "4:3") {
      targetW = Math.min(bW * 0.85, (bH * 0.85 * 4) / 3);
      targetH = (targetW * 3) / 4;
    } else if (aspect === "16:9") {
      targetW = Math.min(bW * 0.85, (bH * 0.85 * 16) / 9);
      targetH = (targetW * 9) / 16;
    }

    setCropBox({
      x: Math.round((bW - targetW) / 2),
      y: Math.round((bH - targetH) / 2),
      width: Math.round(targetW),
      height: Math.round(targetH),
    });
  };

  // Render Pipeline: Composites base image, mask, adjustments and filters onto visible canvas
  useEffect(() => {
    const base = baseCanvasRef.current;
    const mask = maskCanvasRef.current;
    const canvas = canvasRef.current;
    if (!base || !mask || !canvas || !imgLoaded) return;

    if (showOriginal && originalImgRef.current) {
      canvas.width = originalImgRef.current.naturalWidth;
      canvas.height = originalImgRef.current.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(originalImgRef.current, 0, 0);
      return;
    }

    const isSideways = rotation === 90 || rotation === 270;
    canvas.width = isSideways ? base.height : base.width;
    canvas.height = isSideways ? base.width : base.height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply rotation & flip
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(base, -base.width / 2, -base.height / 2);
    ctx.restore();

    // Pixel Processing
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const len = data.length;

    // Mask image data
    const mCtx = mask.getContext("2d");
    const maskData = mCtx ? mCtx.getImageData(0, 0, mask.width, mask.height).data : null;

    // Contrast factor
    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    // Saturation factor
    const sat = (saturation + 100) / 100;
    // Brightness factor
    const bFactor = (brightness * 255) / 100;
    // Temperature shift
    const tempR = temperature > 0 ? (temperature * 28) / 100 : 0;
    const tempB = temperature < 0 ? (-temperature * 28) / 100 : 0;

    const whiteThreshold = 255 - (bgTolerance * 255) / 100;
    const eyedropThreshold = (bgTolerance * 255) / 100 * 1.5;

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      let a = data[i + 3];

      if (a === 0) continue;

      // 1. Manual brush mask (from maskCanvas)
      if (maskData) {
        const maskIdx = i;
        if (maskData[maskIdx] === 0) {
          data[i + 3] = 0;
          continue;
        }
      }

      // 2. White / Light background removal
      if (removeWhiteBg) {
        const minC = Math.min(r, g, b);
        const maxC = Math.max(r, g, b);
        if (minC > whiteThreshold && (maxC - minC) < 30) {
          data[i + 3] = 0;
          continue;
        }
      }

      // 3. Eyedropper selected background color removal
      if (eyedropperColor) {
        const [er, eg, eb] = eyedropperColor;
        const dist = Math.sqrt((r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2);
        if (dist < eyedropThreshold) {
          data[i + 3] = 0;
          continue;
        }
      }

      // 4. Color Adjustments
      if (brightness !== 0) {
        r += bFactor;
        g += bFactor;
        b += bFactor;
      }
      if (contrast !== 0) {
        r = cFactor * (r - 128) + 128;
        g = cFactor * (g - 128) + 128;
        b = cFactor * (b - 128) + 128;
      }
      if (temperature !== 0) {
        r += tempR;
        g += tempR * 0.45;
        b += tempB;
      }
      if (saturation !== 0) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * sat;
        g = lum + (g - lum) * sat;
        b = lum + (b - lum) * sat;
      }

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    // 5. Sharpen Filter
    if (sharpen) {
      const w = canvas.width;
      const h = canvas.height;
      const copy = new Uint8ClampedArray(data);
      const kernel = [0, -0.4, 0, -0.4, 2.6, -0.4, 0, -0.4, 0];

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const px = (y * w + x) * 4;
          if (data[px + 3] === 0) continue;

          let rK = 0, gK = 0, bK = 0;
          let ki = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const p = ((y + dy) * w + (x + dx)) * 4;
              const wgt = kernel[ki++];
              rK += copy[p] * wgt;
              gK += copy[p + 1] * wgt;
              bK += copy[p + 2] * wgt;
            }
          }
          data[px] = Math.max(0, Math.min(255, rK));
          data[px + 1] = Math.max(0, Math.min(255, gK));
          data[px + 2] = Math.max(0, Math.min(255, bK));
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [
    imgLoaded,
    showOriginal,
    rotation,
    flipH,
    flipV,
    brightness,
    contrast,
    saturation,
    temperature,
    sharpen,
    removeWhiteBg,
    bgTolerance,
    bgFeather,
    eyedropperColor,
  ]);

  // Handle Canvas Click for Eyedropper & Manual Brush Mask
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const mask = maskCanvasRef.current;
    if (!canvas || !mask) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    if (bgTool === "eyedropper") {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        setEyedropperColor([pixel[0], pixel[1], pixel[2]]);
        setBgTool("none");
      }
      return;
    }

    if (bgTool === "eraser" || bgTool === "restore") {
      setIsBrushing(true);
      applyBrushToMask(x, y);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isBrushing || (bgTool !== "eraser" && bgTool !== "restore")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    applyBrushToMask(x, y);
  };

  const handleCanvasMouseUp = () => {
    setIsBrushing(false);
  };

  const applyBrushToMask = (cx: number, cy: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(cx, cy, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = bgTool === "eraser" ? "#000000" : "#ffffff";
    ctx.fill();

    // Trigger re-render by touching a dummy state or brightness
    setBrightness((b) => (b === 0.0001 ? 0 : 0.0001));
  };

  // ─── Crop Box Dragging & Resizing Handlers ───
  const handleCropMouseDown = (e: React.MouseEvent, type: any) => {
    e.stopPropagation();
    e.preventDefault();
    setCropDrag({
      type,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...cropBox },
    });
  };

  useEffect(() => {
    if (!cropDrag) return;

    const onMouseMove = (e: MouseEvent) => {
      const base = baseCanvasRef.current;
      if (!base) return;

      const dx = (e.clientX - cropDrag.startX) / zoom;
      const dy = (e.clientY - cropDrag.startY) / zoom;
      const { startBox, type } = cropDrag;

      let next = { ...startBox };

      if (type === "move") {
        next.x = Math.max(0, Math.min(base.width - next.width, startBox.x + dx));
        next.y = Math.max(0, Math.min(base.height - next.height, startBox.y + dy));
      } else if (type === "br") {
        next.width = Math.max(40, startBox.width + dx);
        next.height = cropAspect === "1:1" ? next.width : Math.max(40, startBox.height + dy);
      } else if (type === "tl") {
        const nw = Math.max(40, startBox.width - dx);
        const nh = cropAspect === "1:1" ? nw : Math.max(40, startBox.height - dy);
        next.x = startBox.x + (startBox.width - nw);
        next.y = startBox.y + (startBox.height - nh);
        next.width = nw;
        next.height = nh;
      } else if (type === "tr") {
        next.width = Math.max(40, startBox.width + dx);
        const nh = cropAspect === "1:1" ? next.width : Math.max(40, startBox.height - dy);
        next.y = startBox.y + (startBox.height - nh);
        next.height = nh;
      } else if (type === "bl") {
        const nw = Math.max(40, startBox.width - dx);
        next.x = startBox.x + (startBox.width - nw);
        next.width = nw;
        next.height = cropAspect === "1:1" ? nw : Math.max(40, startBox.height + dy);
      }

      setCropBox(next);
    };

    const onMouseUp = () => setCropDrag(null);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [cropDrag, zoom, cropAspect]);

  // Convert canvas to File object
  const getCanvasFile = async (): Promise<File | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const file = new File([blob], `studio-${Date.now()}.webp`, {
            type: "image/webp",
          });
          resolve(file);
        },
        "image/webp",
        0.92,
      );
    });
  };

  // Save & Replace
  const handleSaveReplace = async () => {
    const file = await getCanvasFile();
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("nodeId", nodeId);
      form.set("oldImageUrl", initialImageUrl);
      form.set("file", file);

      const result = await replaceMenuImageAction(form);
      if (!result.ok) {
        setError(result.error.message);
      } else {
        await alertDialog({
          title: "Görsel Güncellendi",
          message: `“${nodeName}” görseli stüdyo düzenlemeleriyle kaydedildi.`,
        });
        onSaved(result.data.imageUrl);
        onClose();
      }
    } catch {
      setError("Düzenlenmiş görsel kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  // Save As New
  const handleSaveAsNew = async () => {
    const file = await getCanvasFile();
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("nodeId", nodeId);
      form.append("files", file);

      const result = await uploadMenuImagesAction(form);
      if (!result.ok) {
        setError(result.error.message);
      } else {
        await alertDialog({
          title: "Yeni Görsel Eklendi",
          message: `Düzenlenen görsel “${nodeName}” galerisine eklendi.`,
        });
        onSaved(result.data.imageUrl ?? initialImageUrl);
        onClose();
      }
    } catch {
      setError("Yeni görsel eklenemedi");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="xp-studio-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="xp-studio-window" onClick={(e) => e.stopPropagation()}>
        {/* Title Bar */}
        <div className="xp-studio-titlebar">
          <span>🖼️ Profesyonel Görsel Stüdyosu — {nodeName}</span>
          <button
            type="button"
            className="xp-studio-titlebar-btn"
            onClick={onClose}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        {/* Main Workspace */}
        <div className="xp-studio-body">
          {/* Left Sidebar */}
          <div className="xp-studio-sidebar">
            <div className="xp-studio-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "crop"}
                className={`xp-studio-tab-btn ${activeTab === "crop" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("crop"); setBgTool("none"); }}
              >
                ✂️ Kırp & Çevir
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "bg"}
                className={`xp-studio-tab-btn ${activeTab === "bg" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("bg"); setIsCropping(false); }}
              >
                🪄 Arka Plan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "adjust"}
                className={`xp-studio-tab-btn ${activeTab === "adjust" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("adjust"); setBgTool("none"); setIsCropping(false); }}
              >
                🎨 Işık & Sıcaklık
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "presets"}
                className={`xp-studio-tab-btn ${activeTab === "presets" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("presets"); setBgTool("none"); setIsCropping(false); }}
              >
                ✨ Gurme Filtre
              </button>
            </div>

            <div className="xp-studio-tab-content">
              {/* TAB 1: Kırpma & Geometri */}
              {activeTab === "crop" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>İnteraktif Kırpma Aracı</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>En/Boy Oranı:</span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(["free", "1:1", "4:3", "16:9"] as CropAspect[]).map((aspect) => (
                        <button
                          key={aspect}
                          type="button"
                          className={`xp-button ${cropAspect === aspect && isCropping ? "xp-studio-btn-primary" : ""}`}
                          onClick={() => handleSetAspect(aspect)}
                        >
                          {aspect === "free" ? "Serbest" : aspect === "1:1" ? "1:1 Kare (Önerilen)" : aspect}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isCropping ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button
                        type="button"
                        className="xp-button xp-studio-btn-primary"
                        style={{ flex: 1 }}
                        onClick={applyCrop}
                      >
                        ✓ Kırpmayı Onayla
                      </button>
                      <button
                        type="button"
                        className="xp-button"
                        onClick={() => setIsCropping(false)}
                      >
                        İptal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="xp-button"
                      style={{ width: "100%", fontWeight: 700 }}
                      onClick={() => handleSetAspect(cropAspect)}
                    >
                      ✂️ Kırpma Çerçevesini Aç
                    </button>
                  )}

                  <div className="xp-studio-group-title" style={{ marginTop: 12 }}>
                    <span>Döndürme ve Ayna</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => setRotation((r) => ((r + 270) % 360) as 0 | 90 | 180 | 270)}
                    >
                      ↺ 90° Sola
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
                    >
                      ↻ 90° Sağa
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => setFlipH((f) => !f)}
                    >
                      ⇄ Yatay Çevir
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => setFlipV((f) => !f)}
                    >
                      ⇅ Dikey Çevir
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: Arka Plan Kaldırma */}
              {activeTab === "bg" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>Arka Planı Kaldır (Transparan Yap)</span>
                  </div>

                  {/* One-click white / light background removal */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={removeWhiteBg}
                      onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                    />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#0055ea" }}>
                      Açık / Beyaz Masa & Tabak Arka Planını Sil
                    </span>
                  </label>

                  {/* Eyedropper tool */}
                  <div style={{ margin: "8px 0" }}>
                    <button
                      type="button"
                      className={`xp-button ${bgTool === "eyedropper" ? "xp-studio-btn-primary" : ""}`}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onClick={() => setBgTool(bgTool === "eyedropper" ? "none" : "eyedropper")}
                    >
                      🔍 Damlalık: Görseldeki Renge Tıkla ve Sil
                    </button>
                    {eyedropperColor && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 10 }}>Seçili Renk:</span>
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 3,
                            border: "1px solid #333",
                            background: `rgb(${eyedropperColor.join(",")})`,
                          }}
                        />
                        <button
                          type="button"
                          className="xp-button"
                          style={{ fontSize: 9, padding: "1px 4px" }}
                          onClick={() => setEyedropperColor(null)}
                        >
                          Temizle
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Manual Brush Tools */}
                  <div className="xp-studio-group-title" style={{ marginTop: 10 }}>
                    <span>Manuel Rötuş Fırçaları</span>
                  </div>
                  <div className="xp-studio-tool-bar">
                    <button
                      type="button"
                      className={`xp-studio-tool-btn ${bgTool === "eraser" ? "is-active" : ""}`}
                      onClick={() => setBgTool(bgTool === "eraser" ? "none" : "eraser")}
                    >
                      🧹 Silgi Fırçası (Arka Plan Sil)
                    </button>
                    <button
                      type="button"
                      className={`xp-studio-tool-btn ${bgTool === "restore" ? "is-active" : ""}`}
                      onClick={() => setBgTool(bgTool === "restore" ? "none" : "restore")}
                    >
                      🖌️ Geri Getir Fırçası
                    </button>
                  </div>

                  {(bgTool === "eraser" || bgTool === "restore") && (
                    <div className="xp-studio-slider-row">
                      <div className="xp-studio-slider-header">
                        <span>Fırça Boyutu</span>
                        <strong>{brushSize} px</strong>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="80"
                        value={brushSize}
                        className="xp-studio-slider"
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                      />
                    </div>
                  )}

                  {/* Tolerance Slider */}
                  <div className="xp-studio-slider-row" style={{ marginTop: 8 }}>
                    <div className="xp-studio-slider-header">
                      <span>Kaldırma Hassasiyeti / Tolerans</span>
                      <strong>%{bgTolerance}</strong>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={bgTolerance}
                      className="xp-studio-slider"
                      onChange={(e) => setBgTolerance(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: Işık & Renk Sıcaklığı */}
              {activeTab === "adjust" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>Renk, Parlaklık ve Sıcaklık</span>
                    <button
                      type="button"
                      className="xp-button"
                      style={{ fontSize: 9, padding: "1px 6px" }}
                      onClick={() => {
                        setBrightness(0);
                        setContrast(0);
                        setSaturation(0);
                        setTemperature(0);
                        setSharpen(false);
                      }}
                    >
                      Sıfırla
                    </button>
                  </div>

                  {/* Brightness */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Parlaklık</span>
                      <strong>{brightness > 0 ? `+${brightness}` : brightness}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={brightness}
                      className="xp-studio-slider"
                      onChange={(e) => setBrightness(Number(e.target.value))}
                    />
                  </div>

                  {/* Contrast */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Kontrast</span>
                      <strong>{contrast > 0 ? `+${contrast}` : contrast}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={contrast}
                      className="xp-studio-slider"
                      onChange={(e) => setContrast(Number(e.target.value))}
                    />
                  </div>

                  {/* Saturation */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Doygunluk / Canlılık</span>
                      <strong>{saturation > 0 ? `+${saturation}` : saturation}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={saturation}
                      className="xp-studio-slider"
                      onChange={(e) => setSaturation(Number(e.target.value))}
                    />
                  </div>

                  {/* Temperature */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Renk Sıcaklığı (Mavi Soğuk ← → Sıcak Sarı/Altın)</span>
                      <strong>{temperature > 0 ? `+${temperature}` : temperature}</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={temperature}
                      className="xp-studio-slider"
                      onChange={(e) => setTemperature(Number(e.target.value))}
                    />
                  </div>

                  {/* Sharpen Checkbox */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={sharpen}
                      onChange={(e) => setSharpen(e.target.checked)}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>Netlik & Detay Keskinleştirme</span>
                  </label>
                </div>
              )}

              {/* TAB 4: Presets */}
              {activeTab === "presets" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>Tek Tıkla Gurme Şablonları</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("default")}
                    >
                      Doğal Orijinal
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("gourmet")}
                    >
                      🍽️ Gurme Canlı (İştah Açıcı Renkler)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("warm")}
                    >
                      🍲 Sıcak Restoran (Sıcak samimi ışık)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("crisp")}
                    >
                      ⚡ Net & Çıtır (Detaylı doku & kontrast)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("fineDining")}
                    >
                      🍷 Lüks Fine-Dining (Zengin derin tonlar)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("bw")}
                    >
                      📷 Artisan Siyah & Beyaz
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Area: Interactive Canvas Viewport */}
          <div className="xp-studio-canvas-area" ref={containerRef}>
            <div className="xp-studio-canvas-toolbar">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>Önizleme Tuvali</span>
                <span style={{ fontSize: 10, color: "#555" }}>
                  {bgTool === "eyedropper"
                    ? "👉 Silmek istediğiniz arka plan rengine tıklayın"
                    : bgTool === "eraser"
                    ? "🖌️ Silmek için fırçayla sürükleyin"
                    : bgTool === "restore"
                    ? "🖌️ Geri boyamak için sürükleyin"
                    : ""}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Hold to Compare */}
                <button
                  type="button"
                  className="xp-button"
                  style={{ fontSize: 10, padding: "2px 8px" }}
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  onTouchStart={() => setShowOriginal(true)}
                  onTouchEnd={() => setShowOriginal(false)}
                  title="Basılı tutarak orijinal halini görün"
                >
                  👁️ Orijinali Gör
                </button>

                <button
                  type="button"
                  className="xp-button"
                  style={{ fontSize: 10, padding: "2px 8px" }}
                  onClick={handleResetAll}
                >
                  Tümünü Sıfırla
                </button>
              </div>
            </div>

            <div className="xp-studio-canvas-viewport">
              <div
                className="xp-studio-crop-container"
                style={{
                  cursor:
                    bgTool === "eyedropper"
                      ? "crosshair"
                      : bgTool === "eraser" || bgTool === "restore"
                      ? "cell"
                      : "default",
                }}
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                />

                {/* Interactive Crop Box Overlay */}
                {isCropping && canvasRef.current && (
                  <div
                    className="xp-crop-box"
                    style={{
                      left: `${cropBox.x}px`,
                      top: `${cropBox.y}px`,
                      width: `${cropBox.width}px`,
                      height: `${cropBox.height}px`,
                    }}
                    onMouseDown={(e) => handleCropMouseDown(e, "move")}
                  >
                    {/* Rule of Thirds Lines */}
                    <div className="xp-crop-grid-line-h1" />
                    <div className="xp-crop-grid-line-h2" />
                    <div className="xp-crop-grid-line-v1" />
                    <div className="xp-crop-grid-line-v2" />

                    {/* Resize Handles */}
                    <div className="xp-crop-handle tl" onMouseDown={(e) => handleCropMouseDown(e, "tl")} />
                    <div className="xp-crop-handle tr" onMouseDown={(e) => handleCropMouseDown(e, "tr")} />
                    <div className="xp-crop-handle br" onMouseDown={(e) => handleCropMouseDown(e, "br")} />
                    <div className="xp-crop-handle bl" onMouseDown={(e) => handleCropMouseDown(e, "bl")} />
                  </div>
                )}
              </div>
            </div>

            {/* Status bar */}
            <div className="xp-studio-statusbar">
              <span>
                {canvasRef.current
                  ? `Çözünürlük: ${canvasRef.current.width} × ${canvasRef.current.height} px`
                  : "Yükleniyor..."}
              </span>
              <span>
                {removeWhiteBg || eyedropperColor ? "Saydamlaştırıldı (Şeffaf PNG/WebP)" : "Standart"} ·
                Döndürme: {rotation}°
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="xp-studio-actions-footer">
          {error ? (
            <span role="alert" className="xp-field-error" style={{ marginRight: "auto" }}>
              {error}
            </span>
          ) : null}

          <button
            type="button"
            className="xp-button"
            disabled={busy}
            onClick={onClose}
          >
            Vazgeç
          </button>

          <button
            type="button"
            className="xp-button"
            disabled={busy}
            onClick={() => void handleSaveAsNew()}
            title="Orijinal görseli saklayarak yeni bir görsel olarak ekler"
          >
            {busy ? "Kaydediliyor..." : "+ Yeni Görsel Olarak Ekle"}
          </button>

          <button
            type="button"
            className="xp-button xp-studio-btn-primary"
            disabled={busy}
            onClick={() => void handleSaveReplace()}
            title="Mevcut fotoğrafı düzenlenmiş haliyle günceller"
          >
            {busy ? "İşleniyor..." : "✓ Mevcut Görseli Güncelle"}
          </button>
        </div>
      </div>
    </div>
  );
}
