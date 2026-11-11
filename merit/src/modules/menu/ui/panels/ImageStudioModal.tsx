"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { notify } from "@/shell/notify";
import { replaceMenuImageAction, uploadMenuImagesAction } from "../../server/actions/menuTree";
import { Icon } from "@/components/icons/Icon";

type Props = {
  isOpen: boolean;
  nodeId: string;
  nodeName: string;
  initialImageUrl: string;
  onClose(): void;
  onSaved(newImageUrl: string): void;
};

type CropAspect = "free" | "1:1" | "4:3" | "3:2" | "4:5" | "16:9";
type BgTool = "none" | "eyedropper" | "eraser" | "restore";
type BgFillMode = "transparent" | "white" | "ivory" | "obsidian" | "marble" | "amber" | "custom";
type FrameStyle = "none" | "rounded" | "circle" | "goldFrame" | "polaroid";
type BadgePreset = "none" | "chef" | "signature" | "new" | "royal" | "fresh";

type StudioSnapshot = {
  baseDataUrl: string;
  maskDataUrl: string;
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  highlights: number;
  shadows: number;
  vignette: number;
  straightenAngle: number;
  sharpen: boolean;
  removeWhiteBg: boolean;
  bgTolerance: number;
  bgFeather: number;
  eyedropperColor: [number, number, number] | null;
  bgFillMode: BgFillMode;
  bgCustomColor: string;
  dropShadow: boolean;
  frameStyle: FrameStyle;
  badgePreset: BadgePreset;
};

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
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // Interactive Zoom level for canvas viewport (0.5 to 2.5)
  const [zoom, setZoom] = useState(1);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<StudioSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // ─── 1. Kırpma (Crop) & Çerçeve State ───
  const [isCropping, setIsCropping] = useState(false);
  const [cropAspect, setCropAspect] = useState<CropAspect>("1:1");
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [cropDrag, setCropDrag] = useState<{
    type: "move" | "tl" | "tc" | "tr" | "rc" | "br" | "bc" | "bl" | "lc";
    startX: number;
    startY: number;
    startBox: { x: number; y: number; width: number; height: number };
    scaleX: number;
    scaleY: number;
  } | null>(null);

  // ─── 2. Döndürme, Hassas Açı & Çerçeve Stili ───
  const [straightenAngle, setStraightenAngle] = useState(0); // -45 to +45 degrees
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("none");

  // ─── 3. Renk, Işık, Gölgeler & Vinyet Ayarları ───
  const [brightness, setBrightness] = useState(0); // -100 to 100
  const [contrast, setContrast] = useState(0); // -100 to 100
  const [saturation, setSaturation] = useState(0); // -100 to 100
  const [temperature, setTemperature] = useState(0); // -100 (cool) to 100 (warm)
  const [highlights, setHighlights] = useState(0); // -100 to 100
  const [shadows, setShadows] = useState(0); // -100 to 100
  const [vignette, setVignette] = useState(0); // -100 (white) to +100 (dark)
  const [sharpen, setSharpen] = useState(false);

  // ─── 4. Arka Plan Kaldırma & Stüdyo Zemin Dolgusu ───
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(25); // 5 to 65
  const [bgFeather, setBgFeather] = useState(2); // 0 to 5
  const [bgTool, setBgTool] = useState<BgTool>("none");
  const [brushSize, setBrushSize] = useState(30); // 5 to 100
  const [isBrushing, setIsBrushing] = useState(false);
  const [eyedropperColor, setEyedropperColor] = useState<[number, number, number] | null>(null);
  const [bgFillMode, setBgFillMode] = useState<BgFillMode>("transparent");
  const [bgCustomColor, setBgCustomColor] = useState("#f8f4ec");
  const [dropShadow, setDropShadow] = useState(false);

  // ─── 5. Gurme Rozet / Damga (Badge Overlay) ───
  const [badgePreset, setBadgePreset] = useState<BadgePreset>("none");

  // Helper to capture a snapshot into Undo/Redo stack
  const pushSnapshot = useCallback(
    (overrides?: Partial<StudioSnapshot>) => {
      const base = baseCanvasRef.current;
      const mask = maskCanvasRef.current;
      if (!base || !mask) return;

      const snap: StudioSnapshot = {
        baseDataUrl: base.toDataURL("image/png"),
        maskDataUrl: mask.toDataURL("image/png"),
        width: base.width,
        height: base.height,
        brightness,
        contrast,
        saturation,
        temperature,
        highlights,
        shadows,
        vignette,
        straightenAngle,
        sharpen,
        removeWhiteBg,
        bgTolerance,
        bgFeather,
        eyedropperColor,
        bgFillMode,
        bgCustomColor,
        dropShadow,
        frameStyle,
        badgePreset,
        ...overrides,
      };

      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const next = [...sliced, snap];
        return next.length > 20 ? next.slice(next.length - 20) : next;
      });
      setHistoryIndex((prev) => Math.min(19, prev + 1));
    },
    [
      badgePreset,
      bgCustomColor,
      bgFeather,
      bgFillMode,
      bgTolerance,
      brightness,
      contrast,
      dropShadow,
      eyedropperColor,
      frameStyle,
      highlights,
      historyIndex,
      removeWhiteBg,
      saturation,
      shadows,
      sharpen,
      straightenAngle,
      temperature,
      vignette,
    ],
  );

  // Restore a snapshot from Undo/Redo
  const restoreSnapshot = useCallback((snap: StudioSnapshot) => {
    const loadCanvas = (dataUrl: string, w: number, h: number): Promise<HTMLCanvasElement> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          if (ctx) ctx.drawImage(img, 0, 0);
          resolve(c);
        };
        img.src = dataUrl;
      });

    void Promise.all([
      loadCanvas(snap.baseDataUrl, snap.width, snap.height),
      loadCanvas(snap.maskDataUrl, snap.width, snap.height),
    ]).then(([newBase, newMask]) => {
      baseCanvasRef.current = newBase;
      maskCanvasRef.current = newMask;
      setBrightness(snap.brightness);
      setContrast(snap.contrast);
      setSaturation(snap.saturation);
      setTemperature(snap.temperature);
      setHighlights(snap.highlights);
      setShadows(snap.shadows);
      setVignette(snap.vignette);
      setStraightenAngle(snap.straightenAngle);
      setSharpen(snap.sharpen);
      setRemoveWhiteBg(snap.removeWhiteBg);
      setBgTolerance(snap.bgTolerance);
      setBgFeather(snap.bgFeather);
      setEyedropperColor(snap.eyedropperColor);
      setBgFillMode(snap.bgFillMode);
      setBgCustomColor(snap.bgCustomColor);
      setDropShadow(snap.dropShadow);
      setFrameStyle(snap.frameStyle);
      setBadgePreset(snap.badgePreset);
      setIsCropping(false);
      setCanvasRevision((r) => r + 1);
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const targetIdx = historyIndex - 1;
    const snap = history[targetIdx];
    if (snap) {
      setHistoryIndex(targetIdx);
      restoreSnapshot(snap);
    }
  }, [history, historyIndex, restoreSnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const targetIdx = historyIndex + 1;
    const snap = history[targetIdx];
    if (snap) {
      setHistoryIndex(targetIdx);
      restoreSnapshot(snap);
    }
  }, [history, historyIndex, restoreSnapshot]);

  // Keyboard shortcuts for Ctrl+Z / Ctrl+Y
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleUndo, handleRedo]);

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

      // Initialize crop box to 85% centered square
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const initSize = Math.round(minDim * 0.85);
      setCropBox({
        x: Math.round((img.naturalWidth - initSize) / 2),
        y: Math.round((img.naturalHeight - initSize) / 2),
        width: initSize,
        height: initSize,
      });

      const initialSnap: StudioSnapshot = {
        baseDataUrl: base.toDataURL("image/png"),
        maskDataUrl: mask.toDataURL("image/png"),
        width: base.width,
        height: base.height,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        highlights: 0,
        shadows: 0,
        vignette: 0,
        straightenAngle: 0,
        sharpen: false,
        removeWhiteBg: false,
        bgTolerance: 25,
        bgFeather: 2,
        eyedropperColor: null,
        bgFillMode: "transparent",
        bgCustomColor: "#f8f4ec",
        dropShadow: false,
        frameStyle: "none",
        badgePreset: "none",
      };
      setHistory([initialSnap]);
      setHistoryIndex(0);
      setImgLoaded(true);
      setCanvasRevision((r) => r + 1);
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

    setStraightenAngle(0);
    setFrameStyle("none");
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setTemperature(0);
    setHighlights(0);
    setShadows(0);
    setVignette(0);
    setSharpen(false);
    setRemoveWhiteBg(false);
    setBgTolerance(25);
    setBgFeather(2);
    setEyedropperColor(null);
    setBgFillMode("transparent");
    setDropShadow(false);
    setBadgePreset("none");
    setBgTool("none");
    setIsCropping(false);
    setZoom(1);
    setCanvasRevision((r) => r + 1);
  }, []);

  // Bake 90° Rotation or Horizontal/Vertical Flip directly into baseCanvas & maskCanvas
  // so crop coordinates and brush coordinates always match 100%!
  const bakeTransform = (mode: "rotLeft" | "rotRight" | "flipH" | "flipV") => {
    const base = baseCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!base || !mask) return;

    const transformCanvas = (src: HTMLCanvasElement): HTMLCanvasElement => {
      const dst = document.createElement("canvas");
      const isRot = mode === "rotLeft" || mode === "rotRight";
      dst.width = isRot ? src.height : src.width;
      dst.height = isRot ? src.width : src.height;
      const ctx = dst.getContext("2d");
      if (!ctx) return src;

      ctx.save();
      ctx.translate(dst.width / 2, dst.height / 2);
      if (mode === "rotLeft") ctx.rotate(-Math.PI / 2);
      if (mode === "rotRight") ctx.rotate(Math.PI / 2);
      if (mode === "flipH") ctx.scale(-1, 1);
      if (mode === "flipV") ctx.scale(1, -1);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      ctx.restore();
      return dst;
    };

    const nextBase = transformCanvas(base);
    const nextMask = transformCanvas(mask);
    baseCanvasRef.current = nextBase;
    maskCanvasRef.current = nextMask;

    const minDim = Math.min(nextBase.width, nextBase.height);
    const boxSize = Math.round(minDim * 0.85);
    setCropBox({
      x: Math.round((nextBase.width - boxSize) / 2),
      y: Math.round((nextBase.height - boxSize) / 2),
      width: boxSize,
      height: boxSize,
    });

    setCanvasRevision((r) => r + 1);
    pushSnapshot({
      baseDataUrl: nextBase.toDataURL("image/png"),
      maskDataUrl: nextMask.toDataURL("image/png"),
      width: nextBase.width,
      height: nextBase.height,
    });
  };

  // AI Auto-Enhance: Analyzes image luminance & saturation histogram and applies optimal settings
  const handleAutoEnhance = () => {
    const base = baseCanvasRef.current;
    if (!base) return;
    const ctx = base.getContext("2d");
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, base.width, base.height).data;
    let totalLum = 0;
    let totalSat = 0;
    let minLum = 255;
    let maxLum = 0;
    let count = 0;

    // Sample every 16th pixel for speed
    for (let i = 0; i < imgData.length; i += 64) {
      if (imgData[i + 3] < 128) continue;
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

      totalLum += lum;
      totalSat += sat;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      count++;
    }

    if (count === 0) return;
    const avgLum = totalLum / count;
    const avgSat = totalSat / count;
    const dynamicRange = maxLum - minLum;

    // Compute smart corrections
    const nextBrightness = Math.max(-25, Math.min(28, Math.round(((136 - avgLum) / 255) * 85)));
    const nextContrast = dynamicRange < 200 ? Math.min(28, Math.round((220 - dynamicRange) * 0.22) + 12) : 14;
    const nextSaturation = avgSat < 0.35 ? Math.min(32, Math.round((0.42 - avgSat) * 80) + 12) : 16;
    const nextTemp = 8; // Appetizing subtle warm boost
    const nextShadows = avgLum < 115 ? 22 : 10;
    const nextHighlights = maxLum > 245 ? -15 : 6;

    setBrightness(nextBrightness);
    setContrast(nextContrast);
    setSaturation(nextSaturation);
    setTemperature(nextTemp);
    setShadows(nextShadows);
    setHighlights(nextHighlights);
    setSharpen(true);

    pushSnapshot({
      brightness: nextBrightness,
      contrast: nextContrast,
      saturation: nextSaturation,
      temperature: nextTemp,
      shadows: nextShadows,
      highlights: nextHighlights,
      sharpen: true,
    });
    notify.success("Görsel histogramı analiz edildi ve otomatik gurme optimizasyonu uygulandı.");
  };

  // Smart Corner-Sampling Background Detector
  const handleSmartCornerBgRemove = () => {
    const base = baseCanvasRef.current;
    if (!base) return;
    const ctx = base.getContext("2d");
    if (!ctx) return;

    const w = base.width;
    const h = base.height;
    const pad = Math.max(4, Math.round(Math.min(w, h) * 0.03));
    const points = [
      [pad, pad],
      [w - pad, pad],
      [pad, h - pad],
      [w - pad, h - pad],
    ];

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (const [px, py] of points) {
      const p = ctx.getImageData(px, py, 1, 1).data;
      rSum += p[0];
      gSum += p[1];
      bSum += p[2];
    }

    const avgColor: [number, number, number] = [
      Math.round(rSum / 4),
      Math.round(gSum / 4),
      Math.round(bSum / 4),
    ];
    setEyedropperColor(avgColor);
    setBgTolerance(28);
    setBgFeather(2);
    pushSnapshot({
      eyedropperColor: avgColor,
      bgTolerance: 28,
      bgFeather: 2,
    });
  };

  // Quick Gourmet Presets
  const applyPreset = (
    preset:
      | "default"
      | "gourmet"
      | "warm"
      | "crisp"
      | "fineDining"
      | "mediterranean"
      | "patisserie"
      | "steakhouse"
      | "lounge"
      | "bw",
  ) => {
    let b = 0;
    let c = 0;
    let s = 0;
    let t = 0;
    let hi = 0;
    let sh = 0;
    let vig = 0;
    let shp = false;

    if (preset === "gourmet") {
      b = 6; c = 18; s = 26; t = 14; sh = 12; shp = true;
    } else if (preset === "warm") {
      b = 5; c = 12; s = 16; t = 28; sh = 10;
    } else if (preset === "crisp") {
      c = 26; s = 12; hi = 8; sh = 14; shp = true;
    } else if (preset === "fineDining") {
      b = -4; c = 22; s = 14; t = 8; sh = -8; vig = 22; shp = true;
    } else if (preset === "mediterranean") {
      b = 12; c = 10; s = 20; t = 6; hi = 10; sh = 24; shp = true;
    } else if (preset === "patisserie") {
      b = 10; c = 6; s = 14; t = 12; hi = 12; sh = 18; vig = -18;
    } else if (preset === "steakhouse") {
      b = -6; c = 28; s = 18; t = 18; sh = -12; vig = 32; shp = true;
    } else if (preset === "lounge") {
      b = -4; c = 24; s = 30; t = -14; hi = 14; vig = 28; shp = true;
    } else if (preset === "bw") {
      s = -100; c = 24; vig = 15; shp = true;
    }

    setBrightness(b);
    setContrast(c);
    setSaturation(s);
    setTemperature(t);
    setHighlights(hi);
    setShadows(sh);
    setVignette(vig);
    setSharpen(shp);

    pushSnapshot({
      brightness: b,
      contrast: c,
      saturation: s,
      temperature: t,
      highlights: hi,
      shadows: sh,
      vignette: vig,
      sharpen: shp,
    });
  };

  // Execute Crop on base canvas
  const applyCrop = () => {
    const base = baseCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!base || !mask) return;

    const x = Math.max(0, Math.round(cropBox.x));
    const y = Math.max(0, Math.round(cropBox.y));
    const width = Math.min(base.width - x, Math.round(cropBox.width));
    const height = Math.min(base.height - y, Math.round(cropBox.height));
    if (width <= 10 || height <= 10) return;

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

    setCanvasRevision((r) => r + 1);
    pushSnapshot({
      baseDataUrl: croppedBase.toDataURL("image/png"),
      maskDataUrl: croppedMask.toDataURL("image/png"),
      width,
      height,
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
    } else if (aspect === "3:2") {
      targetW = Math.min(bW * 0.85, (bH * 0.85 * 3) / 2);
      targetH = (targetW * 2) / 3;
    } else if (aspect === "4:5") {
      targetH = Math.min(bH * 0.85, (bW * 0.85 * 5) / 4);
      targetW = (targetH * 4) / 5;
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

  // Render Pipeline: Composites base image, mask, adjustments, background fill, frame & badge onto visible canvas
  useEffect(() => {
    const base = baseCanvasRef.current;
    const mask = maskCanvasRef.current;
    const canvas = canvasRef.current;
    if (!base || !mask || !canvas || !imgLoaded) return;

    if (showOriginal && originalImgRef.current) {
      canvas.width = originalImgRef.current.naturalWidth;
      canvas.height = originalImgRef.current.naturalHeight;
      setCanvasSize({ width: canvas.width, height: canvas.height });
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(originalImgRef.current, 0, 0);
      return;
    }

    const w = base.width;
    const h = base.height;
    canvas.width = w;
    canvas.height = h;
    setCanvasSize({ width: w, height: h });

    // Step 1: Draw foreground layer onto an offscreen canvas (with straighten angle compensation)
    const fgCanvas = document.createElement("canvas");
    fgCanvas.width = w;
    fgCanvas.height = h;
    const fgCtx = fgCanvas.getContext("2d", { willReadFrequently: true });
    if (!fgCtx) return;

    fgCtx.save();
    fgCtx.clearRect(0, 0, w, h);
    fgCtx.translate(w / 2, h / 2);
    if (straightenAngle !== 0) {
      const rad = (straightenAngle * Math.PI) / 180;
      // Auto-scale slightly when straightening so corners stay inside frame
      const autoScale = 1 + Math.abs(Math.sin(rad)) * 0.32;
      fgCtx.rotate(rad);
      fgCtx.scale(autoScale, autoScale);
    }
    fgCtx.drawImage(base, -w / 2, -h / 2);
    fgCtx.restore();

    // Step 2: Pixel Processing (Mask + Background Removal + Feather + Color/Light + Vignette)
    const imgData = fgCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const len = data.length;

    const mCtx = mask.getContext("2d");
    const maskData = mCtx ? mCtx.getImageData(0, 0, mask.width, mask.height).data : null;

    const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const sat = (saturation + 100) / 100;
    const bFactor = (brightness * 255) / 100;
    const tempR = temperature > 0 ? (temperature * 28) / 100 : 0;
    const tempB = temperature < 0 ? (-temperature * 28) / 100 : 0;

    const whiteThreshold = 255 - (bgTolerance * 255) / 100;
    const eyedropThreshold = ((bgTolerance * 255) / 100) * 1.5;
    const featherBand = Math.max(1, bgFeather * 12);

    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      let a = data[i + 3];

      if (a === 0) continue;

      // 1. Manual brush mask
      if (maskData && maskData[i] < 128) {
        data[i + 3] = 0;
        continue;
      }

      // 2. White / Light background removal with soft feather transition
      if (removeWhiteBg) {
        const minC = Math.min(r, g, b);
        const maxC = Math.max(r, g, b);
        if (maxC - minC < 34) {
          if (minC > whiteThreshold) {
            data[i + 3] = 0;
            continue;
          } else if (bgFeather > 0 && minC > whiteThreshold - featherBand) {
            const ratio = (whiteThreshold - minC) / featherBand;
            a = Math.round(a * Math.max(0, Math.min(1, ratio)));
          }
        }
      }

      // 3. Eyedropper selected background color removal with soft feather transition
      if (eyedropperColor) {
        const [er, eg, eb] = eyedropperColor;
        const dist = Math.sqrt((r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2);
        if (dist < eyedropThreshold) {
          data[i + 3] = 0;
          continue;
        } else if (bgFeather > 0 && dist < eyedropThreshold + featherBand) {
          const ratio = (dist - eyedropThreshold) / featherBand;
          a = Math.round(a * Math.max(0, Math.min(1, ratio)));
        }
      }

      // 4. Brightness, Contrast, Temperature
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

      // 5. Shadows & Highlights recovery
      if (shadows !== 0 || highlights !== 0) {
        const lumNorm = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (shadows !== 0) {
          const shadowWeight = (1 - lumNorm) * (1 - lumNorm);
          const sDelta = shadows * 0.65 * shadowWeight;
          r += sDelta;
          g += sDelta;
          b += sDelta;
        }
        if (highlights !== 0) {
          const hiWeight = lumNorm * lumNorm;
          const hDelta = highlights * 0.65 * hiWeight;
          r += hDelta;
          g += hDelta;
          b += hDelta;
        }
      }

      // 6. Saturation
      if (saturation !== 0) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * sat;
        g = lum + (g - lum) * sat;
        b = lum + (b - lum) * sat;
      }

      // 7. Vignette (Edge darkening or brightening)
      if (vignette !== 0) {
        const pxIdx = i / 4;
        const py = Math.floor(pxIdx / w);
        const px = pxIdx - py * w;
        const dNorm = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) / maxDist;
        if (dNorm > 0.35) {
          const vFactor = ((dNorm - 0.35) / 0.65) ** 1.8;
          const vDelta = -vignette * 1.15 * vFactor;
          r += vDelta;
          g += vDelta;
          b += vDelta;
        }
      }

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = a;
    }

    // 8. Sharpen Convolution Filter
    if (sharpen) {
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

    fgCtx.putImageData(imgData, 0, 0);

    // Step 3: Composite Background Fill + Drop Shadow + Foreground + Frame + Badge onto final canvas
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Apply Frame Clip Mask if selected
    if (frameStyle === "rounded" || frameStyle === "goldFrame") {
      const r = Math.round(Math.min(w, h) * 0.08);
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, r);
      ctx.clip();
    } else if (frameStyle === "circle") {
      const rad = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
      ctx.clip();
    }

    // Draw Studio Background Fill if not transparent
    if (bgFillMode !== "transparent") {
      if (bgFillMode === "white") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      } else if (bgFillMode === "ivory") {
        ctx.fillStyle = "#faf6ee";
        ctx.fillRect(0, 0, w, h);
      } else if (bgFillMode === "obsidian") {
        const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.05, w / 2, h / 2, w * 0.75);
        grad.addColorStop(0, "#252936");
        grad.addColorStop(1, "#0f1117");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      } else if (bgFillMode === "marble") {
        const grad = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.05, w / 2, h / 2, w * 0.75);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.65, "#f1ede4");
        grad.addColorStop(1, "#ddd6c7");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      } else if (bgFillMode === "amber") {
        const grad = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.05, w / 2, h / 2, w * 0.75);
        grad.addColorStop(0, "#4a321f");
        grad.addColorStop(1, "#1c120b");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      } else if (bgFillMode === "custom") {
        ctx.fillStyle = bgCustomColor;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Draw Foreground with optional Drop Shadow
    ctx.save();
    if (dropShadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
      ctx.shadowBlur = Math.round(Math.min(w, h) * 0.045);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(Math.min(w, h) * 0.025);
    }
    if (frameStyle === "polaroid") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const pad = Math.round(Math.min(w, h) * 0.055);
      const bottomPad = Math.round(Math.min(w, h) * 0.13);
      ctx.drawImage(fgCanvas, pad, pad, w - pad * 2, h - pad - bottomPad);
    } else {
      ctx.drawImage(fgCanvas, 0, 0);
    }
    ctx.restore();

    // Draw Luxury Gold Frame border if selected
    if (frameStyle === "goldFrame") {
      const pad = Math.max(6, Math.round(Math.min(w, h) * 0.022));
      const r = Math.round(Math.min(w, h) * 0.065);
      ctx.strokeStyle = "#d4af37";
      ctx.lineWidth = Math.max(3, Math.round(Math.min(w, h) * 0.008));
      ctx.beginPath();
      ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, r);
      ctx.stroke();
    } else if (frameStyle === "circle") {
      const rad = Math.min(w, h) / 2 - Math.max(3, Math.round(Math.min(w, h) * 0.006));
      ctx.strokeStyle = "#d4af37";
      ctx.lineWidth = Math.max(3, Math.round(Math.min(w, h) * 0.008));
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw Gourmet Corner Badge Overlay if selected
    if (badgePreset !== "none") {
      const labels: Record<Exclude<BadgePreset, "none">, { text: string; bg: string; fg: string; border: string }> = {
        chef: { text: "ŞEFİN SEÇİMİ", bg: "rgba(18, 20, 28, 0.88)", fg: "#f3d27a", border: "#d4af37" },
        signature: { text: "İMZA LEZZET", bg: "rgba(110, 22, 32, 0.90)", fg: "#fff7e6", border: "#e6b85c" },
        new: { text: "● YENİ LEZZET", bg: "rgba(15, 98, 72, 0.90)", fg: "#ffffff", border: "#6ee7b7" },
        royal: { text: "MERİT ROYAL ÖZEL", bg: "rgba(22, 30, 52, 0.92)", fg: "#f5d77f", border: "#d4af37" },
        fresh: { text: "GÜNLÜK & TAZE", bg: "rgba(32, 82, 48, 0.90)", fg: "#f0fdf4", border: "#86efac" },
      };
      const badge = labels[badgePreset];
      const fontSize = Math.max(13, Math.round(Math.min(w, h) * 0.032));
      ctx.font = `700 ${fontSize}px "Segoe UI", Tahoma, sans-serif`;
      const metrics = ctx.measureText(badge.text);
      const padX = Math.round(fontSize * 0.85);
      const padY = Math.round(fontSize * 0.52);
      const bw = metrics.width + padX * 2;
      const bh = fontSize + padY * 2;
      const margin = Math.round(Math.min(w, h) * 0.04);
      const bx = w - bw - margin;
      const by = margin;

      ctx.save();
      ctx.fillStyle = badge.bg;
      ctx.strokeStyle = badge.border;
      ctx.lineWidth = Math.max(1.5, fontSize * 0.08);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = badge.fg;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(badge.text, bx + bw / 2, by + bh / 2 + 1);
      ctx.restore();
    }

    ctx.restore();
  }, [
    imgLoaded,
    canvasRevision,
    showOriginal,
    straightenAngle,
    frameStyle,
    brightness,
    contrast,
    saturation,
    temperature,
    highlights,
    shadows,
    vignette,
    sharpen,
    removeWhiteBg,
    bgTolerance,
    bgFeather,
    eyedropperColor,
    bgFillMode,
    bgCustomColor,
    dropShadow,
    badgePreset,
  ]);

  // Handle Canvas Click for Eyedropper & Manual Brush Mask
  const handleCanvasMouseDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const mask = maskCanvasRef.current;
    if (!canvas || !mask) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    if (bgTool === "eyedropper") {
      const base = baseCanvasRef.current;
      const ctx = (base ?? canvas).getContext("2d");
      if (ctx) {
        const pixel = ctx.getImageData(
          Math.max(0, Math.min(canvas.width - 1, x)),
          Math.max(0, Math.min(canvas.height - 1, y)),
          1,
          1,
        ).data;
        const picked: [number, number, number] = [pixel[0], pixel[1], pixel[2]];
        setEyedropperColor(picked);
        setBgTool("none");
        pushSnapshot({ eyedropperColor: picked });
      }
      return;
    }

    if (bgTool === "eraser" || bgTool === "restore") {
      setIsBrushing(true);
      applyBrushToMask(x, y);
    }
  };

  const handleCanvasMouseMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (isBrushing) {
      setIsBrushing(false);
      pushSnapshot();
    }
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

    setCanvasRevision((r) => r + 1);
  };

  // ─── Crop Box Dragging & Resizing Handlers (Fixed for CSS-scaled canvas!) ───
  const handleCropMouseDown = (e: React.PointerEvent, type: NonNullable<typeof cropDrag>["type"]) => {
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const scaleX = canvas && rect && rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = canvas && rect && rect.height > 0 ? canvas.height / rect.height : 1;

    setCropDrag({
      type,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...cropBox },
      scaleX,
      scaleY,
    });
  };

  useEffect(() => {
    if (!cropDrag) return;

    const getAspectRatio = (aspect: CropAspect): number | null => {
      if (aspect === "1:1") return 1;
      if (aspect === "4:3") return 4 / 3;
      if (aspect === "3:2") return 3 / 2;
      if (aspect === "4:5") return 4 / 5;
      if (aspect === "16:9") return 16 / 9;
      return null;
    };

    const onMouseMove = (e: MouseEvent) => {
      const base = baseCanvasRef.current;
      if (!base) return;

      const dx = (e.clientX - cropDrag.startX) * cropDrag.scaleX;
      const dy = (e.clientY - cropDrag.startY) * cropDrag.scaleY;
      const { startBox, type } = cropDrag;
      const ratio = getAspectRatio(cropAspect);

      const next = { ...startBox };

      if (type === "move") {
        next.x = Math.max(0, Math.min(base.width - next.width, startBox.x + dx));
        next.y = Math.max(0, Math.min(base.height - next.height, startBox.y + dy));
      } else if (type === "br" || type === "rc" || type === "bc") {
        const rawW = type === "bc" ? startBox.width : Math.max(40, Math.min(base.width - startBox.x, startBox.width + dx));
        const rawH = type === "rc" ? startBox.height : Math.max(40, Math.min(base.height - startBox.y, startBox.height + dy));
        if (ratio) {
          next.width = rawW;
          next.height = Math.round(rawW / ratio);
          if (startBox.y + next.height > base.height) {
            next.height = base.height - startBox.y;
            next.width = Math.round(next.height * ratio);
          }
        } else {
          next.width = rawW;
          next.height = rawH;
        }
      } else if (type === "tl" || type === "lc" || type === "tc") {
        const nw = type === "tc" ? startBox.width : Math.max(40, Math.min(startBox.x + startBox.width, startBox.width - dx));
        const nh = ratio
          ? Math.round(nw / ratio)
          : type === "lc"
          ? startBox.height
          : Math.max(40, Math.min(startBox.y + startBox.height, startBox.height - dy));
        next.x = Math.max(0, startBox.x + (startBox.width - nw));
        next.y = Math.max(0, startBox.y + (startBox.height - nh));
        next.width = nw;
        next.height = nh;
      } else if (type === "tr") {
        const nw = Math.max(40, Math.min(base.width - startBox.x, startBox.width + dx));
        const nh = ratio ? Math.round(nw / ratio) : Math.max(40, Math.min(startBox.y + startBox.height, startBox.height - dy));
        next.y = Math.max(0, startBox.y + (startBox.height - nh));
        next.width = nw;
        next.height = nh;
      } else if (type === "bl") {
        const nw = Math.max(40, Math.min(startBox.x + startBox.width, startBox.width - dx));
        const nh = ratio ? Math.round(nw / ratio) : Math.max(40, Math.min(base.height - startBox.y, startBox.height + dy));
        next.x = Math.max(0, startBox.x + (startBox.width - nw));
        next.width = nw;
        next.height = nh;
      }

      setCropBox({
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: Math.round(next.width),
        height: Math.round(next.height),
      });
    };

    const onMouseUp = () => setCropDrag(null);

    // Pointer events: the same drag works with a mouse, a finger and a pen.
    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerup", onMouseUp);
    window.addEventListener("pointercancel", onMouseUp);
    return () => {
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);
      window.removeEventListener("pointercancel", onMouseUp);
    };
  }, [cropDrag, cropAspect]);

  // Convert canvas to File object (ensuring <= 2MB limit via adaptive quality/resolution)
  const getCanvasFile = async (): Promise<File | null> => {
    const srcCanvas = canvasRef.current;
    if (!srcCanvas) return null;

    // Cap export dimensions to 1400x1400 so WebP is always crisp and well under 2 MB
    const maxDim = 1400;
    let exportCanvas = srcCanvas;
    if (srcCanvas.width > maxDim || srcCanvas.height > maxDim) {
      const scale = Math.min(maxDim / srcCanvas.width, maxDim / srcCanvas.height);
      exportCanvas = document.createElement("canvas");
      exportCanvas.width = Math.round(srcCanvas.width * scale);
      exportCanvas.height = Math.round(srcCanvas.height * scale);
      const eCtx = exportCanvas.getContext("2d");
      if (eCtx) eCtx.drawImage(srcCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
    }

    const toWebpBlob = (q: number) =>
      new Promise<Blob | null>((resolve) => exportCanvas.toBlob((b) => resolve(b), "image/webp", q));

    let blob = await toWebpBlob(0.9);
    if (blob && blob.size > 1.9 * 1024 * 1024) {
      blob = await toWebpBlob(0.76);
    }
    if (!blob) return null;

    return new File([blob], `studio-${Date.now()}.webp`, {
      type: "image/webp",
    });
  };

  // Direct Download edited WebP to user's computer
  const handleDownloadWebp = async () => {
    const file = await getCanvasFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    const safeName = nodeName.toLowerCase().replace(/[^a-z0-9ğüşıöç]+/gi, "-").replace(/^-|-$/g, "") || "urun";
    a.download = `${safeName}-studyo.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success("Düzenlenen görsel WebP formatında indirildi.");
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
        notify.success(`“${nodeName}” görseli stüdyo düzenlemeleriyle kaydedildi.`);
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
        notify.success(`Düzenlenen görsel “${nodeName}” galerisine eklendi.`);
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
          <span><Icon name="image" size={16} /> Profesyonel Görsel Stüdyosu — {nodeName}</span>
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
                <Icon name="scissors" size={16} /> Kırp & Çevir
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "bg"}
                className={`xp-studio-tab-btn ${activeTab === "bg" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("bg"); setIsCropping(false); }}
              >
                <Icon name="wand" size={16} /> Arka Plan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "adjust"}
                className={`xp-studio-tab-btn ${activeTab === "adjust" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("adjust"); setBgTool("none"); setIsCropping(false); }}
              >
                <Icon name="palette" size={16} /> Işık & Sıcaklık
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "presets"}
                className={`xp-studio-tab-btn ${activeTab === "presets" ? "is-active" : ""}`}
                onClick={() => { setActiveTab("presets"); setBgTool("none"); setIsCropping(false); }}
              >
                <Icon name="sparkles" size={16} /> Gurme Filtre
              </button>
            </div>

            <div className="xp-studio-tab-content">
              {/* TAB 1: Kırpma, Geometri & Çerçeve */}
              {activeTab === "crop" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>İnteraktif Kırpma Aracı</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>En/Boy Oranı:</span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(
                        [
                          { id: "free", label: "Serbest" },
                          { id: "1:1", label: "1:1 Kare (Önerilen)" },
                          { id: "4:3", label: "4:3 Yatay" },
                          { id: "3:2", label: "3:2 Klasik" },
                          { id: "4:5", label: "4:5 Dikey Kart" },
                          { id: "16:9", label: "16:9 Geniş" },
                        ] as { id: CropAspect; label: string }[]
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`xp-button ${cropAspect === item.id && isCropping ? "xp-studio-btn-primary" : ""}`}
                          onClick={() => handleSetAspect(item.id)}
                        >
                          {item.label}
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
                        <Icon name="check" size={16} /> Kırpmayı Onayla ({cropBox.width}×{cropBox.height})
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
                      <Icon name="scissors" size={16} /> Kırpma Çerçevesini Aç
                    </button>
                  )}

                  <div className="xp-studio-group-title" style={{ marginTop: 12 }}>
                    <span>Döndürme ve Ayna</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => bakeTransform("rotLeft")}
                    >
                      ↺ 90° Sola
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => bakeTransform("rotRight")}
                    >
                      ↻ 90° Sağa
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => bakeTransform("flipH")}
                    >
                      ⇄ Yatay Çevir
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => bakeTransform("flipV")}
                    >
                      ⇅ Dikey Çevir
                    </button>
                  </div>

                  {/* Fine Straightening Slider */}
                  <div className="xp-studio-slider-row" style={{ marginTop: 10 }}>
                    <div className="xp-studio-slider-header">
                      <span>Hassas Açı Düzeltme (Ufuk / Tabak Hizalama)</span>
                      <strong>{straightenAngle > 0 ? `+${straightenAngle}°` : `${straightenAngle}°`}</strong>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      step="1"
                      value={straightenAngle}
                      className="xp-studio-slider"
                      onChange={(e) => setStraightenAngle(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                    {straightenAngle !== 0 && (
                      <button
                        type="button"
                        className="xp-button"
                        style={{ fontSize: 9, alignSelf: "flex-end", padding: "1px 6px" }}
                        onClick={() => {
                          setStraightenAngle(0);
                          pushSnapshot({ straightenAngle: 0 });
                        }}
                      >
                        Açıyı Sıfırla (0°)
                      </button>
                    )}
                  </div>

                  {/* Frame / Shape Mask */}
                  <div className="xp-studio-group-title" style={{ marginTop: 12 }}>
                    <span>Çerçeve & Kesim Stili</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(
                      [
                        { id: "none", label: "Tam Kare" },
                        { id: "rounded", label: "Yumuşak Köşe" },
                        { id: "circle", label: "Daire Madalyon" },
                        { id: "goldFrame", label: "Altın Lüks Çerçeve" },
                        { id: "polaroid", label: "Beyaz Paspartu" },
                      ] as { id: FrameStyle; label: string }[]
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`xp-button ${frameStyle === f.id ? "xp-studio-btn-primary" : ""}`}
                        onClick={() => {
                          setFrameStyle(f.id);
                          pushSnapshot({ frameStyle: f.id });
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: Arka Plan Kaldırma & Stüdyo Zemin Dolgusu */}
              {activeTab === "bg" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>Arka Planı Kaldır (Transparan Yap)</span>
                  </div>

                  {/* Smart 1-click corner background detector */}
                  <button
                    type="button"
                    className="xp-button xp-studio-btn-primary"
                    style={{ width: "100%", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={handleSmartCornerBgRemove}
                  >
                    <Icon name="wand" size={16} /> Akıllı Köşe Analizi ile Arka Planı Sil
                  </button>

                  {/* One-click white / light background removal */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={removeWhiteBg}
                      onChange={(e) => {
                        setRemoveWhiteBg(e.target.checked);
                        pushSnapshot({ removeWhiteBg: e.target.checked });
                      }}
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
                      <Icon name="search" size={16} /> Damlalık: Görseldeki Renge Tıkla ve Sil
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
                          onClick={() => {
                            setEyedropperColor(null);
                            pushSnapshot({ eyedropperColor: null });
                          }}
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
                      <Icon name="eraser" size={16} /> Silgi Fırçası (Arka Plan Sil)
                    </button>
                    <button
                      type="button"
                      className={`xp-studio-tool-btn ${bgTool === "restore" ? "is-active" : ""}`}
                      onClick={() => setBgTool(bgTool === "restore" ? "none" : "restore")}
                    >
                      <Icon name="brush" size={16} /> Geri Getir Fırçası
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
                        max="100"
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
                      max="65"
                      value={bgTolerance}
                      className="xp-studio-slider"
                      onChange={(e) => setBgTolerance(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Feathering Slider */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Kenar Yumuşatma (Feather / Anti-Alias)</span>
                      <strong>{bgFeather} px</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={bgFeather}
                      className="xp-studio-slider"
                      onChange={(e) => setBgFeather(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Studio Backdrop Replacement */}
                  <div className="xp-studio-group-title" style={{ marginTop: 10 }}>
                    <span>Stüdyo Zemin Dolgusu & Tabak Gölgesi</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                    {(
                      [
                        { id: "transparent", label: "Şeffaf" },
                        { id: "white", label: "Saf Beyaz" },
                        { id: "ivory", label: "Merit Fildişi" },
                        { id: "marble", label: "Açık Mermer Spot" },
                        { id: "obsidian", label: "Koyu Obsidyen" },
                        { id: "amber", label: "Sıcak Kehribar" },
                        { id: "custom", label: "Özel Renk" },
                      ] as { id: BgFillMode; label: string }[]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`xp-button ${bgFillMode === m.id ? "xp-studio-btn-primary" : ""}`}
                        onClick={() => {
                          setBgFillMode(m.id);
                          pushSnapshot({ bgFillMode: m.id });
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {bgFillMode === "custom" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 10 }}>Arka Plan Rengi:</span>
                      <input
                        type="color"
                        value={bgCustomColor}
                        onChange={(e) => setBgCustomColor(e.target.value)}
                      />
                    </div>
                  )}

                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={dropShadow}
                      onChange={(e) => {
                        setDropShadow(e.target.checked);
                        pushSnapshot({ dropShadow: e.target.checked });
                      }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>
                      Gerçekçi Tabak / Ürün Alt Gölgesi Ekle
                    </span>
                  </label>
                </div>
              )}

              {/* TAB 3: Işık, Renk Sıcaklığı, Gölgeler & Vinyet */}
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
                        setHighlights(0);
                        setShadows(0);
                        setVignette(0);
                        setSharpen(false);
                        pushSnapshot({
                          brightness: 0,
                          contrast: 0,
                          saturation: 0,
                          temperature: 0,
                          highlights: 0,
                          shadows: 0,
                          vignette: 0,
                          sharpen: false,
                        });
                      }}
                    >
                      Sıfırla
                    </button>
                  </div>

                  {/* AI Auto Enhance Button */}
                  <button
                    type="button"
                    className="xp-button xp-studio-btn-primary"
                    style={{ width: "100%", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    onClick={handleAutoEnhance}
                  >
                    <Icon name="sparkles" size={16} /> Otomatik İyileştir (Akıllı Işık & Canlılık)
                  </button>

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
                      onPointerUp={() => pushSnapshot()}
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
                      onPointerUp={() => pushSnapshot()}
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
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Temperature */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Renk Sıcaklığı (Soğuk ← → Sıcak Altın)</span>
                      <strong>{temperature > 0 ? `+${temperature}` : temperature}</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={temperature}
                      className="xp-studio-slider"
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Shadows */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Gölgeler (Koyu Detayları Aydınlat)</span>
                      <strong>{shadows > 0 ? `+${shadows}` : shadows}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={shadows}
                      className="xp-studio-slider"
                      onChange={(e) => setShadows(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Highlights */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Parlak Alanlar (Yansımaları Dengele)</span>
                      <strong>{highlights > 0 ? `+${highlights}` : highlights}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={highlights}
                      className="xp-studio-slider"
                      onChange={(e) => setHighlights(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Vignette */}
                  <div className="xp-studio-slider-row">
                    <div className="xp-studio-slider-header">
                      <span>Vinyet (Beyaz Çerçeve ← → Koyu Odak)</span>
                      <strong>{vignette > 0 ? `+${vignette}` : vignette}%</strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={vignette}
                      className="xp-studio-slider"
                      onChange={(e) => setVignette(Number(e.target.value))}
                      onPointerUp={() => pushSnapshot()}
                    />
                  </div>

                  {/* Sharpen Checkbox */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={sharpen}
                      onChange={(e) => {
                        setSharpen(e.target.checked);
                        pushSnapshot({ sharpen: e.target.checked });
                      }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>Netlik & Detay Keskinleştirme</span>
                  </label>
                </div>
              )}

              {/* TAB 4: Gurme Filtreler & Şef Rozet Damgası */}
              {activeTab === "presets" && (
                <div className="xp-studio-group">
                  <div className="xp-studio-group-title">
                    <span>Tek Tıkla Gurme Şablonları</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                      <Icon name="utensils" size={16} /> Gurme Canlı (İştah Açıcı Renkler)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("mediterranean")}
                    >
                      <Icon name="sparkles" size={16} /> Akdeniz Gün Işığı (Aydınlık & Ferah)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("patisserie")}
                    >
                      <Icon name="coffee" size={16} /> Pastel Patisserie & Cafe
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("warm")}
                    >
                      <Icon name="utensils" size={16} /> Sıcak Restoran (Sıcak samimi ışık)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("crisp")}
                    >
                      <Icon name="zap" size={16} /> Net & Çıtır (Detaylı doku & kontrast)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("fineDining")}
                    >
                      <Icon name="wine" size={16} /> Lüks Fine-Dining (Zengin derin tonlar)
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("steakhouse")}
                    >
                      <Icon name="flame" size={16} /> Steakhouse Köz & Duman
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("lounge")}
                    >
                      <Icon name="wine" size={16} /> Kokteyl & Gece Lounge
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      onClick={() => applyPreset("bw")}
                    >
                      <Icon name="camera" size={16} /> Artisan Siyah & Beyaz
                    </button>
                  </div>

                  {/* Gourmet Badge Overlay */}
                  <div className="xp-studio-group-title" style={{ marginTop: 12 }}>
                    <span>Görsel Üzeri Gurme Rozet / Damga</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(
                      [
                        { id: "none", label: "Rozet Yok" },
                        { id: "chef", label: "Şefin Seçimi" },
                        { id: "signature", label: "İmza Lezzet" },
                        { id: "new", label: "● Yeni Lezzet" },
                        { id: "royal", label: "Merit Royal Özel" },
                        { id: "fresh", label: "Günlük & Taze" },
                      ] as { id: BadgePreset; label: string }[]
                    ).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`xp-button ${badgePreset === b.id ? "xp-studio-btn-primary" : ""}`}
                        onClick={() => {
                          setBadgePreset(b.id);
                          pushSnapshot({ badgePreset: b.id });
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Area: Interactive Canvas Viewport */}
          <div className="xp-studio-canvas-area" ref={containerRef}>
            <div className="xp-studio-canvas-toolbar">
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>Önizleme Tuvali</span>

                {/* Undo / Redo Buttons */}
                <button
                  type="button"
                  className="xp-button"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                  disabled={historyIndex <= 0}
                  onClick={handleUndo}
                  title="Geri Al (Ctrl+Z)"
                >
                  <Icon name="undo" size={14} /> Geri Al
                </button>
                <button
                  type="button"
                  className="xp-button"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                  disabled={historyIndex >= history.length - 1}
                  onClick={handleRedo}
                  title="İleri Al (Ctrl+Y)"
                >
                  ↷ İleri Al
                </button>

                {/* Zoom Controls */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
                  <button
                    type="button"
                    className="xp-button"
                    style={{ fontSize: 10, padding: "1px 6px" }}
                    onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                    title="Uzaklaştır"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="xp-button"
                    style={{ fontSize: 10, padding: "1px 6px" }}
                    onClick={() => setZoom(1)}
                    title="Ekrana Sığdır (%100)"
                  >
                    %{Math.round(zoom * 100)}
                  </button>
                  <button
                    type="button"
                    className="xp-button"
                    style={{ fontSize: 10, padding: "1px 6px" }}
                    onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                    title="Yakınlaştır"
                  >
                    +
                  </button>
                </div>

                <span style={{ fontSize: 10, color: "#004080", fontWeight: 600 }}>
                  {bgTool === "eyedropper"
                    ? "Silmek istediğiniz arka plan rengine tıklayın"
                    : bgTool === "eraser"
                    ? "Silmek için fırçayla sürükleyin"
                    : bgTool === "restore"
                    ? "Geri boyamak için sürükleyin"
                    : ""}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Hold to Compare */}
                <button
                  type="button"
                  className="xp-button"
                  style={{ fontSize: 10, padding: "2px 8px" }}
                  onPointerDown={() => setShowOriginal(true)}
                  onPointerUp={() => setShowOriginal(false)}
                  onPointerLeave={() => setShowOriginal(false)}
                  onPointerCancel={() => setShowOriginal(false)}
                  onTouchStart={() => setShowOriginal(true)}
                  onTouchEnd={() => setShowOriginal(false)}
                  title="Basılı tutarak orijinal halini görün"
                >
                  <Icon name="eye" size={16} /> Orijinali Gör
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
                  transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                  transformOrigin: "center center",
                  transition: "transform 0.12s ease-out",
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
                  // While a brush or the eyedropper is active a finger draws instead of scrolling the picture.
                  style={{ touchAction: bgTool === "eyedropper" || bgTool === "eraser" || bgTool === "restore" ? "none" : undefined }}
                  onPointerDown={handleCanvasMouseDown}
                  onPointerMove={handleCanvasMouseMove}
                  onPointerUp={handleCanvasMouseUp}
                  onPointerLeave={handleCanvasMouseUp}
                  onPointerCancel={handleCanvasMouseUp}
                />

                {/* Interactive Crop Box Overlay (Percentage-scaled so it matches any CSS canvas size!) */}
                {isCropping && canvasSize && canvasSize.width > 0 && canvasSize.height > 0 && (
                  <div
                    className="xp-crop-box"
                    style={{
                      left: `${(cropBox.x / canvasSize.width) * 100}%`,
                      top: `${(cropBox.y / canvasSize.height) * 100}%`,
                      width: `${(cropBox.width / canvasSize.width) * 100}%`,
                      height: `${(cropBox.height / canvasSize.height) * 100}%`,
                    }}
                    onPointerDown={(e) => handleCropMouseDown(e, "move")}
                  >
                    {/* Rule of Thirds Lines */}
                    <div className="xp-crop-grid-line-h1" />
                    <div className="xp-crop-grid-line-h2" />
                    <div className="xp-crop-grid-line-v1" />
                    <div className="xp-crop-grid-line-v2" />

                    {/* 8 Resize Handles (Corners + Edges) */}
                    <div className="xp-crop-handle tl" onPointerDown={(e) => handleCropMouseDown(e, "tl")} />
                    <div className="xp-crop-handle tc" onPointerDown={(e) => handleCropMouseDown(e, "tc")} />
                    <div className="xp-crop-handle tr" onPointerDown={(e) => handleCropMouseDown(e, "tr")} />
                    <div className="xp-crop-handle rc" onPointerDown={(e) => handleCropMouseDown(e, "rc")} />
                    <div className="xp-crop-handle br" onPointerDown={(e) => handleCropMouseDown(e, "br")} />
                    <div className="xp-crop-handle bc" onPointerDown={(e) => handleCropMouseDown(e, "bc")} />
                    <div className="xp-crop-handle bl" onPointerDown={(e) => handleCropMouseDown(e, "bl")} />
                    <div className="xp-crop-handle lc" onPointerDown={(e) => handleCropMouseDown(e, "lc")} />
                  </div>
                )}
              </div>
            </div>

            {/* Status bar */}
            <div className="xp-studio-statusbar">
              <span>
                {canvasSize
                  ? `Çözünürlük: ${canvasSize.width} × ${canvasSize.height} px`
                  : "Yükleniyor..."}
                {isCropping ? ` · Seçili Kırpma: ${cropBox.width} × ${cropBox.height} px` : ""}
              </span>
              <span>
                {removeWhiteBg || eyedropperColor ? "Arka Plan Temizlendi" : "Standart"} ·
                Zemin: {bgFillMode === "transparent" ? "Şeffaf WebP" : bgFillMode.toUpperCase()} ·
                Açı: {straightenAngle}°
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
            onClick={() => void handleDownloadWebp()}
            style={{ marginRight: "auto" }}
            title="Düzenlenmiş görseli WebP olarak bilgisayarınıza indirir"
          >
            <Icon name="download" size={16} /> Bilgisayara İndir (.webp)
          </button>

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
            {busy ? "İşleniyor..." : "Mevcut Görseli Güncelle"}
          </button>
        </div>
      </div>
    </div>
  );
}
