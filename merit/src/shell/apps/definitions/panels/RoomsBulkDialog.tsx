"use client";

import { useEffect, useState } from "react";
import {
  bulkCreateRoomsAction,
  previewBulkRoomsAction,
} from "@/modules/core/server/admin/actions/rooms";
import type { FloorRow } from "@/modules/core/server/admin/floors";
import type { RoomTypeRow } from "@/modules/core/server/admin/roomTypes";
import type { BulkResult } from "@/modules/core/server/admin/rooms";
import { fail, type Result } from "@/lib/result";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { numberOrUndefined } from "./values";

type Props = {
  hotelId: string;
  open: boolean;
  floors: FloorRow[];
  roomTypes: RoomTypeRow[];
  /** Floor the filter bar shows, preselected in the form. */
  defaultFloorId?: string;
  onClose: () => void;
  onDone: (result: BulkResult) => void;
};

const PREVIEW_DEBOUNCE_MS = 300;
const PREVIEW_SHOWN = 60;
const CONFLICTS_SHOWN = 10;
const SKIP_HELP = "Atlanacak numaraları virgülle ayırarak sayı olarak yazın (ör. 113, 213)";

/** "113, 213" gives [113, 213]; blank gives []; anything that is not a whole number gives undefined. */
function parseSkip(text: string): number[] | undefined {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const numbers = tokens.map((t) => (/^\d+$/.test(t) ? Number(t) : Number.NaN));
  return numbers.some((n) => !Number.isSafeInteger(n)) ? undefined : numbers;
}

/** What the server is sent for the typed values; text that is not a number goes through as text so the server names the field. */
function bulkData(values: Record<string, string>) {
  return {
    floorId: values.floorId ?? "",
    roomTypeId: values.roomTypeId || null,
    from: numberOrUndefined(values.from) ?? values.from,
    to: numberOrUndefined(values.to) ?? values.to,
    prefix: values.prefix ?? "",
    skip: parseSkip(values.skip ?? ""),
  };
}

type Preview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; numbers: string[]; conflicts: string[] }
  | { state: "error"; message: string };

/** Toplu Ekle: a number range on one floor, with a live preview and a warning for existing numbers. */
export function RoomsBulkDialog({
  hotelId,
  open,
  floors,
  roomTypes,
  defaultFloorId,
  onClose,
  onDone,
}: Props) {
  const submit = async (values: FormValues): Promise<Result<unknown>> => {
    const data = bulkData(values);
    if (data.skip === undefined) {
      return fail("VALIDATION", "Girilen bilgiler geçersiz", { fieldErrors: { skip: [SKIP_HELP] } });
    }
    const result = await bulkCreateRoomsAction({ hotelId, data });
    if (result.ok) onDone(result.data);
    return result;
  };

  return (
    <FormDialog title="Toplu oda ekle" open={open} onClose={onClose} onSubmit={submit} submitText="Ekle">
      <BulkFields
        hotelId={hotelId}
        floors={floors}
        roomTypes={roomTypes}
        defaultFloorId={defaultFloorId}
      />
    </FormDialog>
  );
}

function BulkFields({
  hotelId,
  floors,
  roomTypes,
  defaultFloorId,
}: Pick<Props, "hotelId" | "floors" | "roomTypes" | "defaultFloorId">) {
  const [values, setValues] = useState<Record<string, string>>({
    floorId: defaultFloorId ?? floors[0]?.id ?? "",
    roomTypeId: "",
    prefix: "",
    from: "",
    to: "",
    skip: "",
  });
  const [outcome, setOutcome] = useState<{ key: string; preview: Preview } | undefined>();

  const bind = (name: string) => ({
    value: values[name] ?? "",
    onChange: (e: { target: { value: string } }) => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [name]: value }));
    },
  });

  // Preview of the typed range: what would be created and which numbers already exist. The request
  // is identified by its input (`key`), so a stale answer is simply not the current one.
  const data = bulkData(values);
  const key =
    values.floorId && values.from.trim() && values.to.trim() && data.skip !== undefined
      ? JSON.stringify(data)
      : null;
  useEffect(() => {
    if (key === null) return;
    let current = true;
    const timer = setTimeout(async () => {
      let result: Result<{ numbers: string[]; conflicts: string[] }> | undefined;
      try {
        result = await previewBulkRoomsAction({ hotelId, data: JSON.parse(key) });
      } catch {
        result = undefined;
      }
      if (!current) return;
      let next: Preview;
      if (!result) {
        next = { state: "error", message: "Önizleme alınamadı" };
      } else if (!result.ok) {
        const detail = Object.values(result.error.fieldErrors ?? {})[0]?.[0];
        next = { state: "error", message: detail ?? result.error.message };
      } else {
        next = { state: "ok", ...result.data };
      }
      setOutcome({ key, preview: next });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [hotelId, key]);

  let preview: Preview = { state: "idle" };
  if (key !== null) preview = outcome?.key === key ? outcome.preview : { state: "loading" };

  return (
    <>
      <Field name="floorId" label="Kat">
        <select {...bind("floorId")}>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="roomTypeId" label="Oda tipi">
        <select {...bind("roomTypeId")}>
          <option value="">— Seçilmedi —</option>
          {roomTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="prefix" label="Ön ek (isteğe bağlı)">
        <input type="text" maxLength={10} placeholder="ör. A-" {...bind("prefix")} />
      </Field>
      <Field name="from" label="Başlangıç numarası">
        <input type="text" inputMode="numeric" {...bind("from")} />
      </Field>
      <Field name="to" label="Bitiş numarası">
        <input type="text" inputMode="numeric" {...bind("to")} />
      </Field>
      <Field name="skip" label="Atlanacak numaralar (isteğe bağlı)">
        <input type="text" placeholder="ör. 113, 213" {...bind("skip")} />
      </Field>
      <PreviewBox preview={preview} />
    </>
  );
}

function PreviewBox({ preview }: { preview: Preview }) {
  if (preview.state === "idle") {
    return <p className="xp-defs-note xp-bulk-note">Önizleme için kat ile numara aralığını girin.</p>;
  }
  if (preview.state === "loading") {
    return <p className="xp-defs-note xp-bulk-note">Önizleme hazırlanıyor…</p>;
  }
  if (preview.state === "error") {
    return (
      <p role="status" className="xp-bulk-warning">
        {preview.message}
      </p>
    );
  }
  const { numbers, conflicts } = preview;
  const more = numbers.length - PREVIEW_SHOWN;
  return (
    <div className="xp-bulk-preview-wrap" role="status" aria-label="Önizleme">
      <p className="xp-bulk-note">
        <strong>{numbers.length} oda</strong> eklenecek:
      </p>
      <p className="xp-bulk-preview">
        {numbers.slice(0, PREVIEW_SHOWN).join(", ")}
        {more > 0 ? ` … ve ${more} oda daha` : ""}
      </p>
      {conflicts.length > 0 ? (
        <p className="xp-bulk-warning">
          Uyarı: {conflicts.length} numara zaten kayıtlı ({conflicts.slice(0, CONFLICTS_SHOWN).join(", ")}
          {conflicts.length > CONFLICTS_SHOWN ? " …" : ""}). Hiçbiri eklenmez; aralığı değiştirin veya bu
          numaraları atlayın.
        </p>
      ) : null}
    </div>
  );
}
