"use client";

import type { UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { Field } from "@/shell/ui/Field";
import type { FormValues } from "@/shell/ui/FormDialog";

type Props = {
  options: UserOptions | null;
  /** The user being edited; undefined = new user. */
  editing?: UserRow;
  /** Primary hotel preselected for a new user (the window's hotel). */
  defaultHotelId: string;
};

const EXTRA_PREFIX = "extra:";

/** Fields of the "Yeni kullanıcı" / "Kullanıcıyı düzenle" dialog; the password exists only when creating. */
export function UserForm({ options, editing, defaultHotelId }: Props) {
  const hotels = options?.hotels ?? [];
  const primary = editing ? (editing.hotelId ?? "") : defaultHotelId;
  return (
    <>
      <Field name="username" label="Kullanıcı adı">
        <input type="text" defaultValue={editing?.username ?? ""} maxLength={40} autoComplete="off" />
      </Field>
      <Field name="fullName" label="Ad soyad">
        <input type="text" defaultValue={editing?.fullName ?? ""} maxLength={100} />
      </Field>
      <Field name="email" label="E-posta">
        <input type="text" defaultValue={editing?.email ?? ""} maxLength={120} />
      </Field>
      <Field name="phone" label="Telefon">
        <input type="text" defaultValue={editing?.phone ?? ""} maxLength={30} />
      </Field>
      <Field name="roleId" label="Rol">
        <select defaultValue={editing?.roleId ?? ""}>
          <option value="">Rol seçin</option>
          {(options?.roles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="hotelId" label="Ana otel">
        <select defaultValue={primary}>
          <option value="">Otelsiz (sistem)</option>
          {hotels.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </Field>
      {hotels.length > 1
        ? hotels.map((h) => (
            <Field key={h.id} name={`${EXTRA_PREFIX}${h.id}`} label={`Ek otel: ${h.name}`}>
              <input type="checkbox" defaultChecked={editing?.hotelIds.includes(h.id) ?? false} />
            </Field>
          ))
        : null}
      {editing ? null : (
        <>
          <Field name="password" label="Şifre">
            <input type="password" autoComplete="new-password" maxLength={128} />
          </Field>
          <p className="xp-defs-note">En az 10 karakter; büyük harf, küçük harf ve rakam içermeli.</p>
        </>
      )}
    </>
  );
}

/** Dialog values to the service input (extra hotels collected from the `extra:<id>` checkboxes). */
export function userInputFromValues(values: FormValues, includePassword: boolean) {
  const hotelId = values.hotelId || undefined;
  const hotelIds = Object.keys(values)
    .filter((k) => k.startsWith(EXTRA_PREFIX))
    .map((k) => k.slice(EXTRA_PREFIX.length))
    .filter((id) => id !== hotelId);
  return {
    username: values.username ?? "",
    fullName: values.fullName ?? "",
    email: values.email ?? "",
    phone: values.phone ?? "",
    roleId: values.roleId ?? "",
    hotelId,
    hotelIds,
    ...(includePassword ? { password: values.password ?? "" } : {}),
  };
}
