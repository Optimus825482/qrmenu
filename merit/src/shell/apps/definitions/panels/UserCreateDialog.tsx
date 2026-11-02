"use client";

import { useState, type FormEvent } from "react";
import { createUserOnboardingAction } from "@/modules/core/server/admin/actions/users";
import type { CreatedUserCredentials, UserOptions, UserRow } from "@/modules/core/server/admin/users";
import { CUSTOM_JOB_TITLE, USER_JOB_TITLE_GROUPS } from "@/modules/core/jobTitles";
import { suggestedUsername } from "@/modules/core/usernames";
import { Field } from "@/shell/ui/Field";

type Props = {
  open: boolean;
  options: UserOptions | null;
  initialHotelId?: string;
  initialRoleId?: string;
  lockHotel?: boolean;
  lockRole?: boolean;
  onClose(): void;
  onCreated(user: UserRow): void;
};

type Profile = { fullName: string; username: string; jobTitle: string; phone: string; email: string };
const emptyProfile = (): Profile => ({ fullName: "", username: "", jobTitle: "", phone: "", email: "" });

export function UserCreateDialog({
  open,
  options,
  initialHotelId = "",
  initialRoleId = "",
  lockHotel = false,
  lockRole = false,
  onClose,
  onCreated,
}: Props) {
  const [step, setStep] = useState<"profile" | "assignment" | "credentials">("profile");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [customJobTitle, setCustomJobTitle] = useState(false);
  const [roleId, setRoleId] = useState(initialRoleId);
  const [hotelId, setHotelId] = useState(initialHotelId);
  const [hotelIds, setHotelIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<CreatedUserCredentials | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;
  const selectedRole = options?.roles.find((role) => role.id === roleId);
  const requireHotel = selectedRole?.kind !== "SISTEM";

  const close = () => {
    if (pending) return;
    setStep("profile");
    setProfile(emptyProfile());
    setCustomJobTitle(false);
    setRoleId(initialRoleId);
    setHotelId(initialHotelId);
    setHotelIds([]);
    setCredentials(null);
    setError("");
    setCopied(false);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "profile") {
      if (!profile.fullName.trim() || !profile.jobTitle.trim() || !roleId) {
        setError("Ad soyad, görev ve rol alanları gerekli.");
        return;
      }
      setError("");
      setStep("assignment");
      return;
    }
    if (step !== "assignment") return;
    if (!roleId) { setError("Kullanıcı için bir rol seçin."); return; }
    if (requireHotel && !hotelId && hotelIds.length === 0) { setError("En az bir otel atayın."); return; }

    setPending(true);
    setError("");
    const result = await createUserOnboardingAction({
      data: {
        ...profile,
        fullName: profile.fullName.trim(),
        username: profile.username.trim() || suggestedUsername(profile.fullName),
        jobTitle: profile.jobTitle.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
        roleId,
        hotelId: hotelId || undefined,
        hotelIds: hotelIds.filter((id) => id !== hotelId),
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCredentials(result.data);
    setStep("credentials");
    onCreated(result.data.user);
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Kullanıcı adı: ${credentials.user.username}\nGeçici şifre: ${credentials.temporaryPassword}`);
      setCopied(true);
    } catch {
      setError("Kopyalama başarısız. Bilgileri seçip elle kopyalayın.");
    }
  };

  return (
    <div className="xp-form-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="user-create-title" className="xp-window xp-dialog xp-form-dialog" style={{ width: "min(760px, calc(100% - 24px))", maxHeight: "calc(100% - 16px)", overflow: step === "assignment" ? "auto" : "hidden" }}>
        <header className="xp-titlebar">
          <span id="user-create-title" className="xp-titlebar-text">{step === "profile" ? "Yeni kullanıcı · Kişi bilgileri" : step === "assignment" ? "Yeni kullanıcı · Otel ve rol ataması" : "Geçici giriş bilgileri"}</span>
          <button type="button" className="xp-title-button is-close" aria-label="Kapat" onClick={close}>×</button>
        </header>
        {step === "credentials" && credentials ? (
          <div className="xp-form-fields">
            <p><strong>{credentials.user.fullName}</strong> için hesap oluşturuldu.</p>
            <Field name="username" label="Sisteme giriş kullanıcı adı"><input readOnly value={credentials.user.username} /></Field>
            <Field name="temporaryPassword" label="Geçici şifre"><input readOnly value={credentials.temporaryPassword} /></Field>
            <p className="xp-defs-note">Bu şifre yalnızca şimdi gösterilir ve tekrar görüntülenemez. Bilgileri şimdi personele iletin; ilk girişte yeni bir şifre belirlemesi zorunludur.</p>
            {error ? <p role="alert" className="xp-form-banner">{error}</p> : null}
            <div className="xp-dialog-actions">
              <button type="button" className="xp-button" onClick={() => void copyCredentials()}>{copied ? "Kopyalandı" : "Bilgileri kopyala"}</button>
              <button type="button" className="xp-button" onClick={close}>Tamam</button>
            </div>
          </div>
        ) : (
          <form className="xp-form" onSubmit={(event) => void submit(event)}>
            <div className={step === "profile" ? "xp-form-fields xp-user-profile-fields" : "xp-form-fields"}>
              {error ? <p role="alert" className="xp-form-banner">{error}</p> : null}
              {step === "profile" ? (
                <>
                  <p className="xp-defs-note xp-user-profile-intro">Personelin kişi, görev ve rol bilgilerini girin. Otel ataması sonraki adımda yapılır.</p>
                  <Field name="fullName" label="Ad soyad"><input autoFocus required maxLength={100} value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} /></Field>
                  <Field name="jobTitle" label="Görev (F&B)">
                    <select required value={customJobTitle ? CUSTOM_JOB_TITLE : profile.jobTitle} onChange={(e) => {
                      const custom = e.target.value === CUSTOM_JOB_TITLE;
                      setCustomJobTitle(custom);
                      setProfile({ ...profile, jobTitle: custom ? "" : e.target.value });
                    }}>
                      <option value="">Görev seçin</option>
                      {USER_JOB_TITLE_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((title) => <option key={title} value={title}>{title}</option>)}</optgroup>)}
                      <option value={CUSTOM_JOB_TITLE}>Diğer (elle yaz)</option>
                    </select>
                  </Field>
                  {customJobTitle ? <Field name="customJobTitle" label="Görev unvanı"><input required maxLength={100} value={profile.jobTitle} onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })} /></Field> : null}
                  <Field name="roleId" label="Rol ve yetkiler">
                    <select required value={roleId} disabled={lockRole} onChange={(e) => setRoleId(e.target.value)}>
                      <option value="">Rol seçin</option>
                      {(options?.roles ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                  </Field>
                  {selectedRole ? <p className="xp-defs-note xp-user-role-note">Giriş sonrası açılış ekranı: <strong>{selectedRole.defaultScreenName ?? "Rol için ekran tanımlanmamış"}</strong>. Ekran yetkileri seçilen rolden alınır.</p> : null}
                  <Field name="phone" label="Telefon numarası (isteğe bağlı)"><input type="tel" maxLength={30} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
                  <Field name="email" label="E-posta adresi"><input required type="email" maxLength={120} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
                  <Field name="username" label="Sisteme giriş kullanıcı adı">
                    <input required autoComplete="off" maxLength={40} value={profile.username || suggestedUsername(profile.fullName)} onChange={(e) => {
                      setProfile({ ...profile, username: e.target.value });
                    }} />
                  </Field>
                  <p className="xp-defs-note xp-user-username-note">Kullanıcı adı ad.soyad biçiminde önerilir ve bu alandan değiştirilebilir. Önerilen ad kullanımda ise sonuna sayı eklenir.</p>
                </>
              ) : (
                <>
                  <p className="xp-defs-note">{profile.fullName} · {profile.jobTitle}</p>
                  <Field name="hotelId" label="Ana otel">
                    <select value={hotelId} disabled={lockHotel} onChange={(e) => setHotelId(e.target.value)}>
                      <option value="">{requireHotel ? "Otel seçin" : "Sistem kullanıcısı · otel ataması isteğe bağlı"}</option>
                      {(options?.hotels ?? []).map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
                    </select>
                  </Field>
                  {!lockHotel ? options?.hotels.filter((hotel) => hotel.id !== hotelId).map((hotel) => (
                    <Field key={hotel.id} name={`hotel:${hotel.id}`} label={`Ek otel · ${hotel.name}`}>
                      <input type="checkbox" checked={hotelIds.includes(hotel.id)} onChange={(e) => setHotelIds((current) => e.target.checked ? [...current, hotel.id] : current.filter((id) => id !== hotel.id))} />
                    </Field>
                  )) : null}
                </>
              )}
            </div>
            <div className="xp-dialog-actions">
              {step === "assignment" ? <button type="button" disabled={pending} className="xp-button" onClick={() => { setStep("profile"); setError(""); }}>Geri</button> : null}
              <button type="submit" disabled={pending} className="xp-button" aria-busy={pending || undefined}>{pending ? "Kaydediliyor…" : step === "profile" ? "İleri" : "Kullanıcıyı kaydet"}</button>
              <button type="button" disabled={pending} className="xp-button" onClick={close}>Vazgeç</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
