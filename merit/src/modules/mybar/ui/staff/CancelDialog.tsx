"use client";

import { useState } from "react";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { useBackCloses } from "@/shell/useBackCloses";
import { cancelMybarAction } from "../../server/actions/requests";
import type { MybarRow } from "../../server/requests";

const CANCEL_REASONS = [
  "Misafir talebinden vazgeçti",
  "Ürünler odaya zaten eklenmişti",
  "Mükerrer talep gönderilmişti",
  "Ürünler stokta bulunmuyor",
] as const;

type Props = {
  row: MybarRow;
  onCancel(): void;
  onCancelled(): void;
};

/**
 * Cancel with a reason (MB-PERS `A`). Rendered by the host only when the session may cancel: the floor
 * attendant never sees it. A rejected reason (the 3-word rule) stays on screen with the server message.
 */
export function CancelDialog({ row, onCancel, onCancelled }: Props) {
  const [error, setError] = useState<string | null>(null);
  // The phone's back closes the dialog instead of leaving the page (D6).
  useBackCloses(true, onCancel);
  return (
    <ReasonDialog
      open
      danger
      title={`Oda ${row.roomNumber} talebini iptal et`}
      message={error ?? "Bu talep iptal edilir ve misafirin o günkü hakkı serbest kalır. Sebebi yazın."}
      reasons={CANCEL_REASONS}
      minLength={10}
      confirmLabel="Talebi iptal et"
      onCancel={onCancel}
      onConfirm={async (reason) => {
        setError(null);
        try {
          const res = await cancelMybarAction(row.id, { reason });
          if (!res.ok) {
            setError(res.error.fieldErrors?.reason?.[0] ?? res.error.message);
            return;
          }
          onCancelled();
        } catch {
          setError("İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
        }
      }}
    />
  );
}
