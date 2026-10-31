"use client";

import { useRef, useState } from "react";
import { removeMenuImageAction, uploadMenuImageAction } from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";

type Props = { node: MenuTreeNode; canEdit: boolean; onChanged(): void };

/** Item photo: preview, upload (JPEG/PNG/WebP up to 2 MB, converted server-side) and remove. */
export function ImageField({ node, canEdit, onChanged }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("nodeId", node.id);
    form.set("file", file);
    try {
      const result = await uploadMenuImageAction(form);
      if (!result.ok) setError(result.error.message);
      else onChanged();
    } catch {
      setError("Görsel yüklenemedi");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const result = await removeMenuImageAction({ nodeId: node.id });
    setBusy(false);
    if (!result.ok) setError(result.error.message);
    else onChanged();
  };

  return (
    <div className="xp-mm-image">
      {node.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={node.imageUrl} alt={`${node.name} görseli`} className="xp-mm-preview" />
      ) : (
        <span className="xp-badge xp-mm-noimage">Fotoğraf yok</span>
      )}
      {canEdit ? (
        <div className="xp-mm-image-actions">
          <label className="xp-field-label" htmlFor={`img-${node.id}`}>
            Görsel yükle
          </label>
          <input
            id={`img-${node.id}`}
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          {node.imageUrl ? (
            <button type="button" className="xp-button" disabled={busy} onClick={() => void remove()}>
              Görseli kaldır
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="xp-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
