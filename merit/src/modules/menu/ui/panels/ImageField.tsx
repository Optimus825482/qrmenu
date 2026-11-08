"use client";

import { useRef, useState } from "react";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import {
  removeMenuImageAction,
  reorderMenuImagesAction,
  setPrimaryMenuImageAction,
  uploadMenuImagesAction,
} from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";
import { ImageStudioModal } from "./ImageStudioModal";
import { Icon } from "@/components/icons/Icon";

type Props = { node: MenuTreeNode; canEdit: boolean; onChanged(): void };

/**
 * High-res client-side pre-optimizer:
 * If a user selects a >1.85 MB camera photo, downscale it on an offscreen canvas
 * so it never exceeds the 2 MB server upload validation limit.
 */
async function optimizeFileIfLarge(file: File): Promise<File> {
  const SAFE_LIMIT = Math.floor(1.85 * 1024 * 1024);
  if (file.size <= SAFE_LIMIT) return file;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1500;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
        },
        "image/webp",
        0.86,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

/**
 * Item photos: multi-image gallery, drag-and-drop & multi-file upload, automatic WebP format conversion,
 * auto-enhancement, full-featured Image Studio (interactive crop, background removal & studio backdrop,
 * temperature, shadows/highlights, gourmet filters, badges, undo/redo), gallery reordering, and cover selection.
 */
export function ImageField({ node, canEdit, onChanged }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advanced Image Studio Modal State
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTargetUrl, setStudioTargetUrl] = useState<string | null>(null);

  // Collect all images ensuring backwards compatibility
  const images: string[] = [];
  if (node.imageUrl) images.push(node.imageUrl);
  for (const url of node.imageUrls ?? []) {
    if (!images.includes(url)) images.push(url);
  }

  const primaryImage = images[0] ?? node.imageUrl;

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.set("nodeId", node.id);
    for (let i = 0; i < files.length; i++) {
      const optimized = await optimizeFileIfLarge(files[i]);
      form.append("files", optimized);
    }

    try {
      const result = await uploadMenuImagesAction(form);
      if (!result.ok) {
        setError(result.error.message);
      } else {
        const uploadedUrl = result.data.imageUrl ?? primaryImage;
        onChanged();

        // Prompt user: ask if they want to open the image editing studio
        const openStudio = await confirm({
          danger: true,
          confirmLabel: "Stüdyoyu aç",
          cancelLabel: "Şimdi değil",
          title: "Yükleme Tamamlandı",
          message: `“${node.name}” görseli otomatik optimize edilerek kaydedildi.\n\nGörsel İşleme Stüdyosu açılsın mı? (Kırpma, arka plan kaldırma, renk sıcaklığı, parlaklık vb.)`,
        });

        if (openStudio && uploadedUrl) {
          openStudioFor(uploadedUrl);
        }
      }
    } catch {
      setError("Görseller yüklenemedi");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const openStudioFor = (url: string) => {
    setStudioTargetUrl(url);
    setStudioOpen(true);
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= images.length) return;
    const nextOrder = [...images];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIdx, 0, moved);

    setBusy(true);
    setError(null);
    try {
      const result = await reorderMenuImagesAction({ nodeId: node.id, orderedUrls: nextOrder });
      if (!result.ok) {
        setError(result.error.message);
      } else {
        onChanged();
      }
    } catch {
      setError("Görsel sırası değiştirilemedi");
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (imageUrl: string) => {
    const isPrimary = imageUrl === primaryImage;
    const approved = await confirm({
      title: "Görseli Kaldır",
      message: isPrimary && images.length > 1
        ? `Bu görsel ana kapak görselidir. Silinsin mi? (Bir sonraki görsel otomatik kapak yapılacaktır.)`
        : `Seçili görsel silinsin mi?`,
      danger: true, confirmLabel: "Kaldır",
    });
    if (!approved) return;

    setBusy(true);
    setError(null);
    try {
      const result = await removeMenuImageAction({ nodeId: node.id, imageUrl });
      if (!result.ok) {
        setError(result.error.message);
      } else {
        onChanged();
      }
    } catch {
      setError("Görsel silinemedi");
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    const approved = await confirm({
      title: "Tüm Görselleri Kaldır",
      message: `“${node.name}” öğesine ait tüm görseller silinsin mi?`,
      danger: true, confirmLabel: "Kaldır",
    });
    if (!approved) return;

    setBusy(true);
    setError(null);
    try {
      const result = await removeMenuImageAction({ nodeId: node.id });
      if (!result.ok) {
        setError(result.error.message);
      } else {
        notify.success(`“${node.name}” öğesinin tüm görselleri silindi.`);
        onChanged();
      }
    } catch {
      setError("Görseller silinemedi");
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (imageUrl: string) => {
    if (imageUrl === primaryImage) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setPrimaryMenuImageAction({ nodeId: node.id, imageUrl });
      if (!result.ok) {
        setError(result.error.message);
      } else {
        onChanged();
      }
    } catch {
      setError("Kapak görseli ayarlanamadı");
    } finally {
      setBusy(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit || busy) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canEdit || busy) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="xp-mm-image-section"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="xp-mm-image-header">
        <span>Fotoğraf Galerisi {images.length > 0 ? `(${images.length})` : ""}</span>
        {images.length > 0 && primaryImage ? (
          <span className="xp-badge" style={{ background: "#0055ea", color: "#fff" }}>
            1 Kapak Görseli Belirlendi
          </span>
        ) : null}
      </div>

      {/* Gallery thumbnail area */}
      <div
        className="xp-mm-gallery-grid"
        role="region"
        aria-label="Yüklenmiş Görseller"
        style={
          dragActive
            ? {
                outline: "2px dashed #0055ea",
                background: "#eef5ff",
              }
            : undefined
        }
      >
        {images.length === 0 ? (
          <div className="xp-mm-empty-gallery">
            {dragActive
              ? "Yüklemek için görselleri buraya bırakın..."
              : "Henüz görsel yüklenmedi. Görsel eklemek için aşağıdaki butonu kullanın veya dosyaları buraya sürükleyin."}
          </div>
        ) : (
          images.map((url, idx) => {
            const isPrimary = url === primaryImage;
            return (
              <div
                key={url}
                className={`xp-mm-thumb-card ${isPrimary ? "is-primary" : ""}`}
                title={isPrimary ? "Ana Kapak Görseli" : `Görsel ${idx + 1}`}
              >
                <div
                  className="xp-mm-thumb-img-wrap"
                  style={{ cursor: canEdit ? "pointer" : "default" }}
                  onClick={() => canEdit && openStudioFor(url)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${node.name} - ${idx + 1}`}
                    className="xp-mm-thumb-img"
                    loading="lazy"
                  />
                  {isPrimary ? <span className="xp-mm-primary-tag"><Icon name="star" size={16} /> Kapak</span> : null}
                </div>
                {canEdit ? (
                  <div className="xp-mm-thumb-actions" style={{ flexDirection: "column", gap: 2 }}>
                    <button
                      type="button"
                      className="xp-button xp-mm-thumb-btn xp-studio-btn-primary"
                      style={{ width: "100%", padding: "2px 0", fontSize: 10 }}
                      disabled={busy}
                      onClick={() => openStudioFor(url)}
                      title="Kırpma, Arka Plan Kaldırma, Renk Sıcaklığı ve Gurme Filtreleri Stüdyosu"
                    >
                      <Icon name="palette" size={16} /> Stüdyo & Kırp
                    </button>

                    <div style={{ display: "flex", gap: 2, width: "100%" }}>
                      {images.length > 1 && idx > 0 ? (
                        <button
                          type="button"
                          className="xp-button xp-mm-thumb-btn"
                          style={{ flex: "0 0 20px", padding: "1px 0" }}
                          disabled={busy}
                          onClick={() => void moveImage(idx, -1)}
                          title="Sola taşı"
                        >
                          ←
                        </button>
                      ) : null}
                      {!isPrimary ? (
                        <button
                          type="button"
                          className="xp-button xp-mm-thumb-btn"
                          disabled={busy}
                          onClick={() => void makePrimary(url)}
                          title="Bu görseli ana kapak görseli yap"
                        >
                          Kapak Yap
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="xp-button xp-mm-thumb-btn"
                        disabled={busy}
                        onClick={() => void removeOne(url)}
                        title="Bu görseli sil"
                      >
                        Sil
                      </button>
                      {images.length > 1 && idx < images.length - 1 ? (
                        <button
                          type="button"
                          className="xp-button xp-mm-thumb-btn"
                          style={{ flex: "0 0 20px", padding: "1px 0" }}
                          disabled={busy}
                          onClick={() => void moveImage(idx, 1)}
                          title="Sağa taşı"
                        >
                          →
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Action controls */}
      {canEdit ? (
        <div className="xp-mm-controls">
          <input
            id={`img-picker-${node.id}`}
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => void handleFiles(e.target.files)}
          />

          <button
            type="button"
            className="xp-button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "Yükleniyor..." : "Görsel(ler) Seç / Yükle..."}
          </button>

          {primaryImage ? (
            <button
              type="button"
              className="xp-button xp-studio-btn-primary"
              disabled={busy}
              onClick={() => openStudioFor(primaryImage)}
              title="Kapak görselini Profesyonel Görsel Stüdyosunda düzenle"
            >
              <Icon name="wand" size={16} /> Stüdyoyu Aç
            </button>
          ) : null}

          {images.length > 0 ? (
            <button
              type="button"
              className="xp-button"
              disabled={busy}
              onClick={() => void removeAll()}
            >
              Tümünü Kaldır
            </button>
          ) : null}
        </div>
      ) : null}

      <span className="xp-mm-hint">
        JPEG, PNG veya WebP · Sürükle-bırak veya çoklu seçim desteklenir · Yüksek çözünürlüklü fotoğraflar otomatik optimize edilir
      </span>

      {error ? (
        <p role="alert" className="xp-field-error">
          {error}
        </p>
      ) : null}

      {/* Advanced Image Studio Modal (İnteraktif Kırpma, Arka Plan Kaldırma, Renk Sıcaklığı, Gurme Filtreleri) */}
      {studioOpen && studioTargetUrl && (
        <ImageStudioModal
          isOpen={studioOpen}
          nodeId={node.id}
          nodeName={node.name}
          initialImageUrl={studioTargetUrl}
          onClose={() => setStudioOpen(false)}
          onSaved={() => onChanged()}
        />
      )}
    </div>
  );
}
