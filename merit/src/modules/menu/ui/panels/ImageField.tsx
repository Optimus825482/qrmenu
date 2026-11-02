"use client";

import { useRef, useState } from "react";
import { alertDialog, confirm } from "@/shell/confirm";
import {
  removeMenuImageAction,
  setPrimaryMenuImageAction,
  uploadMenuImagesAction,
} from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";
import { ImageStudioModal } from "./ImageStudioModal";

type Props = { node: MenuTreeNode; canEdit: boolean; onChanged(): void };

/**
 * Item photos: multi-image gallery, multi-file upload, automatic WebP format conversion,
 * auto-enhancement, full-featured Image Studio (interactive crop, background removal,
 * temperature, color adjustment), and primary cover photo selection.
 */
export function ImageField({ node, canEdit, onChanged }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
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

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.set("nodeId", node.id);
    for (let i = 0; i < files.length; i++) {
      form.append("files", files[i]);
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

  const removeOne = async (imageUrl: string) => {
    const isPrimary = imageUrl === primaryImage;
    const approved = await confirm({
      title: "Görseli Kaldır",
      message: isPrimary && images.length > 1
        ? `Bu görsel ana kapak görselidir. Silinsin mi? (Bir sonraki görsel otomatik kapak yapılacaktır.)`
        : `Seçili görsel silinsin mi?`,
      danger: true,
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
      danger: true,
    });
    if (!approved) return;

    setBusy(true);
    setError(null);
    try {
      const result = await removeMenuImageAction({ nodeId: node.id });
      if (!result.ok) {
        setError(result.error.message);
      } else {
        await alertDialog({
          title: "İşlem Tamamlandı",
          message: `“${node.name}” öğesinin tüm görselleri silindi.`,
        });
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

  return (
    <div className="xp-mm-image-section">
      <div className="xp-mm-image-header">
        <span>Fotoğraf Galerisi {images.length > 0 ? `(${images.length})` : ""}</span>
        {images.length > 0 && primaryImage ? (
          <span className="xp-badge" style={{ background: "#0055ea", color: "#fff" }}>
            1 Kapak Görseli Belirlendi
          </span>
        ) : null}
      </div>

      {/* Gallery thumbnail area */}
      <div className="xp-mm-gallery-grid" role="region" aria-label="Yüklenmiş Görseller">
        {images.length === 0 ? (
          <div className="xp-mm-empty-gallery">
            Henüz görsel yüklenmedi. Görsel eklemek için aşağıdaki butonu kullanın.
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
                <div className="xp-mm-thumb-img-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${node.name} - ${idx + 1}`}
                    className="xp-mm-thumb-img"
                    loading="lazy"
                  />
                  {isPrimary ? <span className="xp-mm-primary-tag">★ Kapak</span> : null}
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
                      🎨 Stüdyo & Kırp
                    </button>

                    <div style={{ display: "flex", gap: 2, width: "100%" }}>
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
            {busy ? "Yükleniyor..." : "📁 Görsel(ler) Seç / Yükle..."}
          </button>

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
        JPEG, PNG veya WebP · Birden fazla dosya seçebilirsiniz · Otomatik WebP dönüştürme ve renk optimizasyonu uygulanır
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
