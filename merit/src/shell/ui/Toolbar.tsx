"use client";

import type { ReactNode } from "react";

type Props = {
  onNew?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  newDisabled?: boolean;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  /** Optional tour target for the Yeni button (defaults to the definitions tour target). */
  newGuide?: string;
  /** Extra buttons placed after the standard ones. */
  children?: ReactNode;
};

/** The standard Yeni / Düzenle / Sil / Yenile row; a button shows only when its handler is given. */
export function Toolbar({
  onNew,
  onEdit,
  onDelete,
  onRefresh,
  newDisabled,
  editDisabled,
  deleteDisabled,
  newGuide,
  children,
}: Props) {
  return (
    <div role="toolbar" aria-label="Araçlar" className="xp-grid-toolbar">
      {onNew ? (
        <button type="button" className="xp-button" aria-label="Yeni kayıt" data-guide={newGuide ?? "tanim-ekle"} disabled={newDisabled} onClick={onNew}>
          Yeni
        </button>
      ) : null}
      {onEdit ? (
        <button type="button" className="xp-button" aria-label="Seçili kaydı düzenle" data-guide="tanim-duzenle" disabled={editDisabled} onClick={onEdit}>
          Düzenle
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="xp-button" aria-label="Seçili kaydı sil" disabled={deleteDisabled} onClick={onDelete}>
          Sil
        </button>
      ) : null}
      {onRefresh ? (
        <button type="button" className="xp-button" aria-label="Listeyi yenile" onClick={onRefresh}>
          Yenile
        </button>
      ) : null}
      {children}
    </div>
  );
}
