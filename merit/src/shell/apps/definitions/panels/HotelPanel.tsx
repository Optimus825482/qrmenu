"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { FieldErrors } from "@/lib/result";
import { listHotelsAction, updateHotelAction } from "@/modules/core/server/admin/actions/hotels";
import type { HotelRow } from "@/modules/core/server/admin/hotels";
import { Field } from "@/shell/ui/Field";
import { FieldErrorsContext } from "@/shell/ui/formContext";
import { useLiveList } from "@/shell/ui/useLiveList";

type Props = { hotelId: string; setStatus(text: string): void };

const EMAIL_FLAGS = [
  ["emailNotifyEnabled", "Bildirim e-postaları"],
  ["emailAlertEnabled", "Uyarı e-postaları"],
  ["emailReportEnabled", "Rapor e-postaları"],
  ["emailSystemEnabled", "Sistem e-postaları"],
] as const;

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
  // Remounted whenever the stored values change, so the fields always start from them.
  return (
    <>
      <HotelForm
        key={JSON.stringify(hotel)}
        hotel={hotel}
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
    </>
  );
}

function HotelForm({
  hotel,
  onSaved,
  onEdit,
}: {
  hotel: HotelRow;
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
    busy.current = true;
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    onEdit();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const flag = (name: string) => form.get(name) === "on";
    try {
      const result = await updateHotelAction({
        id: hotel.id,
        data: {
          name: text("name"),
          address: text("address"),
          phone: text("phone"),
          logoUrl: text("logoUrl"),
          // A disabled checkbox is not submitted: the system hotel always stays active.
          isActive: hotel.isSystemDefault ? true : flag("isActive"),
          emailNotifyEnabled: flag("emailNotifyEnabled"),
          emailAlertEnabled: flag("emailAlertEnabled"),
          emailReportEnabled: flag("emailReportEnabled"),
          emailSystemEnabled: flag("emailSystemEnabled"),
        },
      });
      if (result.ok) {
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
          <Field name="code" label="Otel kodu">
            <input type="text" defaultValue={hotel.code} readOnly />
          </Field>
          <Field name="name" label="Otel adı">
            <input type="text" defaultValue={hotel.name} maxLength={120} />
          </Field>
          <Field name="address" label="Adres">
            <input type="text" defaultValue={hotel.address ?? ""} maxLength={300} />
          </Field>
          <Field name="phone" label="Telefon">
            <input type="text" defaultValue={hotel.phone ?? ""} maxLength={40} />
          </Field>
          <Field name="logoUrl" label="Logo adresi">
            <input type="text" defaultValue={hotel.logoUrl ?? ""} maxLength={500} />
          </Field>
          <Field name="isActive" label="Aktif">
            <input
              type="checkbox"
              defaultChecked={hotel.isActive}
              disabled={hotel.isSystemDefault}
            />
          </Field>
          {hotel.isSystemDefault ? (
            <p className="xp-defs-note">Sistem oteli pasife alınamaz ve silinemez.</p>
          ) : null}
          <fieldset className="xp-group">
            <legend>E-posta bildirimleri</legend>
            {EMAIL_FLAGS.map(([name, label]) => (
              <Field key={name} name={name} label={label}>
                <input type="checkbox" defaultChecked={hotel[name]} />
              </Field>
            ))}
          </fieldset>
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
