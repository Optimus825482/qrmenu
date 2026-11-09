"use client";

import { useState } from "react";
import type { UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { CUSTOM_JOB_TITLE, USER_JOB_TITLE_GROUPS } from "@/modules/core/jobTitles";
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
  const allStandardTitles: readonly string[] = USER_JOB_TITLE_GROUPS.flatMap((g) => g.options);
  const isCustomInitially = initialJobTitle !== "" && !allStandardTitles.includes(initialJobTitle);

  const [customJob, setCustomJob] = useState(isCustomInitially);
  const [jobTitleVal, setJobTitleVal] = useState(initialJobTitle);

  return (
    <>
      <Field name="username" label="Kullanıcı adı">
        <input type="text" defaultValue={editing?.username ?? ""} maxLength={40} autoComplete="off" />
      </Field>
      <Field name="fullName" label="Ad soyad">
        <input type="text" defaultValue={editing?.fullName ?? ""} maxLength={100} />
      </Field>
      <Field name="jobTitleSelect" label="Görev (F&B / Operasyon)">
        <select
          value={customJob ? CUSTOM_JOB_TITLE : jobTitleVal}
          onChange={(e) => {
            const isCust = e.target.value === CUSTOM_JOB_TITLE;
            setCustomJob(isCust);
            if (!isCust) setJobTitleVal(e.target.value);
          }}
        >
          <option value="">Görev seçin</option>
          {USER_JOB_TITLE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_JOB_TITLE}>Diğer (elle yaz)</option>
        </select>
      </Field>

      {/* Hidden input to pass jobTitle to form values if select is standard, or text input if custom */}
      <Field name="jobTitle" label={customJob ? "Özel görev unvanı" : "Seçili görev"}>
        <input
          type="text"
          value={jobTitleVal}
          readOnly={!customJob}
          maxLength={100}
          onChange={(e) => setJobTitleVal(e.target.value)}
          placeholder={customJob ? "Görev unvanını yazın..." : ""}
          style={!customJob ? { background: "var(--xp-body, #f8fafc)", color: "#475569" } : {}}
        />
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
      <Field name="roleId" label="Rol">
        {/* keyed by the option count: options arrive after the dialog opens, and an uncontrolled select ignores a later defaultValue */}
        <select key={options?.roles.length ?? 0} defaultValue={editing?.roleId ?? ""}>
          <option value="">Rol seçin</option>
          {(options?.roles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.code})
            </option>
          ))}
        </select>
      </Field>
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
