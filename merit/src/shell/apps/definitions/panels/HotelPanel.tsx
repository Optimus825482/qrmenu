"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { FieldErrors } from "@/lib/result";
import { listHotelsAction, updateHotelAction } from "@/modules/core/server/admin/actions/hotels";
import type { HotelRow } from "@/modules/core/server/admin/hotels";
import { alertDialog, confirm } from "@/shell/confirm";
import { Field } from "@/shell/ui/Field";
import { FieldErrorsContext } from "@/shell/ui/formContext";
import { useLiveList } from "@/shell/ui/useLiveList";
import { HotelLogo } from "@/components/HotelLogo";
import { HotelModules } from "./HotelModules";

type Props = { hotelId: string; setStatus(text: string): void };

function displayHotelCode(hotel: HotelRow): string {
  const code = hotel.code.trim().toUpperCase();
  if (["ROYAL", "DIAMOND", "PREMIUM"].includes(code)) return code;
  const name = hotel.name.toLocaleLowerCase("tr-TR");
  if (name.includes("diamond")) return "DIAMOND";
  if (name.includes("premium")) return "PREMIUM";
  if (name.includes("royal")) return "ROYAL";
  return hotel.code;
}

/** Otel: edit form of the window's hotel (the code is fixed; the system hotel stays active). */
export function HotelPanel({ hotelId, setStatus }: Props) {
  const list = useLiveList<HotelRow>((query) => listHotelsAction({ query, hotelId }), {
    hotelId,
    entities: ["hotel"],
  });
  const hotel = list.rows[0];
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (hotel) setStatus(`${hotel.name} (${hotel.code})`);
  }, [hotel, setStatus]);

  if (!hotel) {
    return list.error ? (
      <p role="alert" className="xp-defs-error">
        {list.error}
      </p>
    ) : (
      <p className="xp-defs-note">{list.loading ? "Yükleniyor…" : "Otel bulunamadı."}</p>
    );
  }
  const code = displayHotelCode(hotel);
  // Remounted whenever the stored values change, so the fields always start from them.
  return (
    <>
      <HotelForm
        key={JSON.stringify(hotel)}
        hotel={hotel}
        hotelCode={code}
        onSaved={() => {
          setSaved(true);
          list.reload();
        }}
        onEdit={() => setSaved(false)}
      />
      {saved ? (
        <p role="status" className="xp-defs-note">
          Otel bilgileri kaydedildi
        </p>
      ) : null}
      <HotelModules hotelId={hotelId} />
    </>
  );
}

function HotelForm({
  hotel,
  hotelCode,
  onSaved,
  onEdit,
}: {
  hotel: HotelRow;
  hotelCode: string;
  onSaved: () => void;
  onEdit: () => void;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    const approved = await confirm({
      title: "Otel bilgilerini güncelle",
      message: `“${hotel.name}” otelindeki değişiklikler kaydedilsin mi?`,
      danger: true,
    });
    if (!approved) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    onEdit();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    try {
      const result = await updateHotelAction({
        id: hotel.id,
        data: {
          name: text("name"),
        },
      });
      if (result.ok) {
        await alertDialog({ title: "İşlem tamamlandı", message: `“${hotel.name}” otel bilgileri güncellendi.` });
        onSaved();
      } else {
        setMessage(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    } catch {
      setMessage("Beklenmeyen bir hata oluştu");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <form className="xp-hotel-form" noValidate onSubmit={submit} aria-label="Otel bilgileri">
      <FieldErrorsContext.Provider value={fieldErrors}>
        <div className="xp-form-fields">
          <div className="xp-hotel-branding" aria-label={`${hotel.name} logosu`}>
            <HotelLogo hotelCode={hotelCode} size={144} />
          </div>
          <Field name="code" label="Otel kodu">
            <input type="text" value={hotelCode} readOnly />
          </Field>
          <Field name="name" label="Otel adı">
            <input type="text" defaultValue={hotel.name} maxLength={120} />
          </Field>
        </div>
      </FieldErrorsContext.Provider>
      <div className="xp-dialog-actions">
        {message ? (
          <p role="alert" className="xp-form-banner">
            {message}
          </p>
        ) : null}
        <button type="submit" className="xp-button" aria-busy={pending || undefined}>
          Kaydet
        </button>
      </div>
    </form>
  );
}
