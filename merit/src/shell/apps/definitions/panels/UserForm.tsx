"use client";

import { useState } from "react";
import type { UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { groupJobTitleChoices, jobTitleOptionLabel } from "@/modules/core/jobTitles";
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
  const initialJobTitle = editing?.jobTitle ?? "";
  const tree = options?.jobTitleTree ?? [];
  const roles = options?.roles ?? [];
  const [jobTitleVal, setJobTitleVal] = useState(initialJobTitle);
  // undefined = untouched: the saved role (the options arrive after the dialog opens).
  const [pickedRole, setPickedRole] = useState<string | undefined>(undefined);
  const roleId = pickedRole ?? editing?.roleId ?? "";
  // A title from before the catalogue (free text) stays selectable until it is changed.
  const legacyTitle = initialJobTitle !== "" && !tree.some((title) => title.name === initialJobTitle) ? initialJobTitle : null;
  const suggested = roles.find((role) => role.id === tree.find((title) => title.name === jobTitleVal)?.defaultRoleId);

  return (
    <>
      <Field name="username" label="Kullanıcı adı">
        <input type="text" defaultValue={editing?.username ?? ""} maxLength={40} autoComplete="off" />
      </Field>
      <Field name="fullName" label="Ad soyad">
        <input type="text" defaultValue={editing?.fullName ?? ""} maxLength={100} />
      </Field>
      <Field name="jobTitle" label="Görev (resmi unvan)">
        <select
          value={jobTitleVal}
          onChange={(e) => {
            const next = e.target.value;
            setJobTitleVal(next);
            // A new user takes the role the görev suggests; an existing user's role changes only on request.
            const role = tree.find((title) => title.name === next)?.defaultRoleId;
            if (!editing && role && roles.some((item) => item.id === role)) setPickedRole(role);
          }}
        >
          <option value="">Görev seçin</option>
          {legacyTitle ? <option value={legacyTitle}>{legacyTitle} (katalogda yok)</option> : null}
          {groupJobTitleChoices(tree).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((title) => (
                <option key={title.id} value={title.name}>
                  {jobTitleOptionLabel(title)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field name="email" label="E-posta (isteğe bağlı)">
        <input type="text" defaultValue={editing?.email ?? ""} maxLength={120} placeholder="ornek@merithotels.com (isteğe bağlı)" />
      </Field>
      <Field name="emailOptIn" label="Rapor/uyarı e-postaları al">
        <input type="checkbox" defaultChecked={editing?.emailOptIn ?? false} />
      </Field>
      <Field name="phone" label="Telefon">
        <input type="text" defaultValue={editing?.phone ?? ""} maxLength={30} />
      </Field>
      <Field name="roleId" label="Rol (yetki ve ekranlar)">
        <select value={roleId} onChange={(e) => setPickedRole(e.target.value)}>
          <option value="">Rol seçin</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.code})
            </option>
          ))}
        </select>
      </Field>
      <p className="xp-defs-note">
        Görev kişinin resmi unvanıdır; neleri görüp yapabileceğini rol belirler.
        {suggested && suggested.id !== roleId ? (
          <>
            {" "}Bu görev için önerilen rol: <strong>{suggested.name}</strong>.{" "}
            <button type="button" className="xp-button" onClick={() => setPickedRole(suggested.id)}>
              Önerileni uygula
            </button>
          </>
        ) : null}
      </p>
      <Field name="hotelId" label="Ana otel">
        <select key={hotels.length} defaultValue={primary}>
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
          <p className="xp-defs-note">En az 6 karakter; büyük harf, küçük harf ve rakam içermeli.</p>
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
    jobTitle: values.jobTitle ?? "",
    email: values.email ? values.email.trim() : undefined,
    emailOptIn: values.emailOptIn !== undefined,
    phone: values.phone ? values.phone.trim() : undefined,
    roleId: values.roleId ?? "",
    hotelId,
    hotelIds,
    ...(includePassword ? { password: values.password ?? "" } : {}),
  };
}
