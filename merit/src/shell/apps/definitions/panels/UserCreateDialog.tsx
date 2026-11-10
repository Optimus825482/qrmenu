"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
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

export type UserCategory = "SISTEM" | "YONETICI" | "KULLANICI";

export function roleMatchesCategory(role: { code: string; kind: string }, cat: UserCategory): boolean {
  if (cat === "SISTEM") {
    return role.kind === "SISTEM" || role.code === "R-SYS" || role.code === "R-ITT";
  }
  if (cat === "YONETICI") {
    return (
      role.kind === "YONETIM" ||
      ["R-OTM", "R-FBM", "R-DEP", "R-HKS", "R-SGF", "R-MUS", "R-KAS", "R-OUY", "R-MUY"].includes(role.code)
    );
  }
  if (cat === "KULLANICI") {
    return (
      role.kind === "MINIBAR" ||
      role.kind === "OUTLET" ||
      role.kind === "MUTFAK" ||
      ["R-KAT", "R-GAR", "R-BAR", "R-BUT", "R-ODS", "R-MUP", "R-KDS", "R-OUT"].includes(role.code)
    );
  }
  return true;
}

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

  // Dialog dragging state
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // User type category: SISTEM, YONETICI, KULLANICI
  const detectCategory = (rId: string): UserCategory => {
    const r = options?.roles.find((item) => item.id === rId);
    if (!r) return "KULLANICI";
    if (roleMatchesCategory(r, "SISTEM")) return "SISTEM";
    if (roleMatchesCategory(r, "YONETICI")) return "YONETICI";
    return "KULLANICI";
  };

  const [category, setCategory] = useState<UserCategory>(() => detectCategory(initialRoleId));
  const [roleId, setRoleId] = useState(initialRoleId);
  const [hotelId, setHotelId] = useState(initialHotelId);
  const [hotelIds, setHotelIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<CreatedUserCredentials | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Opening the dialog (or new initial values / role options while open) re-applies the initial hotel and role:
  // state adjusted while rendering, no effect.
  const [seenInit, setSeenInit] = useState<{ open: boolean; initialHotelId?: string; initialRoleId?: string; options: typeof options } | null>(null);
  if (
    !seenInit ||
    seenInit.open !== open ||
    seenInit.initialHotelId !== initialHotelId ||
    seenInit.initialRoleId !== initialRoleId ||
    seenInit.options !== options
  ) {
    setSeenInit({ open, initialHotelId, initialRoleId, options });
    if (open) {
      if (initialHotelId) setHotelId(initialHotelId);
      if (initialRoleId) {
        setRoleId(initialRoleId);
        setCategory(detectCategory(initialRoleId));
      } else if (options?.roles && options.roles.length > 0) {
        const matching = options.roles.find((r) => roleMatchesCategory(r, category)) ?? options.roles[0];
        if (matching) setRoleId(matching.id);
      }
    }
  }

  if (!open) return null;

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, ...dragOffset.current };
    let next = { x: start.x, y: start.y };
    const onMove = (event: PointerEvent) => {
      const x = start.x + event.clientX - start.px;
      const y = start.y + event.clientY - start.py;
      next = { x, y };
      dialog.style.transform = `translate(${x}px, ${y}px)`;
    };
    const onUp = () => {
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      dragOffset.current = next;
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  };

  const allRoles = options?.roles ?? [];
  const categoryRoles = allRoles.filter((r) => roleMatchesCategory(r, category));
  const effectiveRoles = categoryRoles.length > 0 ? categoryRoles : allRoles;

  const handleCategoryChange = (newCat: UserCategory) => {
    setCategory(newCat);
    const matching = allRoles.filter((r) => roleMatchesCategory(r, newCat));
    if (matching.length > 0 && !matching.some((r) => r.id === roleId)) {
      setRoleId(matching[0].id);
    }
  };

  const selectedRole = allRoles.find((role) => role.id === roleId);
  const requireHotel = selectedRole?.kind !== "SISTEM";

  const close = () => {
    if (pending) return;
    setStep("profile");
    setProfile(emptyProfile());
    setCustomJobTitle(false);
    setCategory(detectCategory(initialRoleId));
    setRoleId(initialRoleId);
    setHotelId(initialHotelId);
    setHotelIds([]);
    setCredentials(null);
    setError("");
    setCopied(false);
    dragOffset.current = { x: 0, y: 0 };
    if (dialogRef.current) dialogRef.current.style.transform = "";
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
    if (!roleId) {
      setError("Kullanıcı için bir rol seçin.");
      return;
    }
    if (requireHotel && !hotelId && hotelIds.length === 0) {
      setError("En az bir otel atayın.");
      return;
    }

    setPending(true);
    setError("");
    const emailVal = profile.email.trim();
    const phoneVal = profile.phone.trim();
    const result = await createUserOnboardingAction({
      data: {
        ...profile,
        fullName: profile.fullName.trim(),
        username: profile.username.trim() || suggestedUsername(profile.fullName),
        jobTitle: profile.jobTitle.trim(),
        email: emailVal ? emailVal : undefined,
        phone: phoneVal ? phoneVal : undefined,
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
      await navigator.clipboard.writeText(
        `Kullanıcı adı: ${credentials.user.username}\nGeçici şifre: ${credentials.temporaryPassword}`,
      );
      setCopied(true);
    } catch {
      setError("Kopyalama başarısız. Bilgileri seçip elle kopyalayın.");
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const portalRoot = typeof document === "undefined" ? null : document.getElementById("xp-dialog-root");

  const dialogNode = (
    <div
      className="xp-form-backdrop"
      // preventDefault keeps focus inside the dialog when the backdrop is clicked.
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-create-title"
        className="xp-window xp-dialog xp-form-dialog"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          width: "min(760px, calc(100% - 24px))",
          maxHeight: "calc(100% - 16px)",
          overflow: step === "assignment" ? "auto" : "hidden",
        }}
      >
        <header
          className="xp-titlebar cursor-move"
          style={{ cursor: "move", userSelect: "none" }}
          onPointerDown={startDrag}
        >
          <span id="user-create-title" className="xp-titlebar-text">
            {step === "profile"
              ? "Yeni kullanıcı · Kişi bilgileri"
              : step === "assignment"
                ? "Yeni kullanıcı · Otel ve rol ataması"
                : "Geçici giriş bilgileri"}
          </span>
          <button type="button" className="xp-title-button is-close" aria-label="Kapat" onClick={close}>
            ×
          </button>
        </header>

        {step === "credentials" && credentials ? (
          <div className="xp-form-fields">
            <p>
              <strong>{credentials.user.fullName}</strong> için hesap oluşturuldu.
            </p>
            <Field name="username" label="Sisteme giriş kullanıcı adı">
              <input readOnly value={credentials.user.username} />
            </Field>
            <Field name="temporaryPassword" label="Geçici şifre">
              <input
                readOnly
                value={credentials.temporaryPassword}
                style={{ fontWeight: "bold", fontSize: "16px", letterSpacing: "2px", color: "var(--xp-accent, #0055ea)" }}
              />
            </Field>
            <p className="xp-defs-note">
              Personele geçici giriş şifresi olarak <strong>{credentials.temporaryPassword}</strong> atanmıştır. Bilgileri şimdi personele iletin; ilk girişte en az 6 haneli (büyük harf, küçük harf ve rakam içeren) kişisel şifresini belirlemesi zorunludur.
            </p>
            {error ? <p role="alert" className="xp-form-banner">{error}</p> : null}
            <div className="xp-dialog-actions">
              <button type="button" className="xp-button" onClick={() => void copyCredentials()}>
                {copied ? "Kopyalandı" : "Bilgileri kopyala"}
              </button>
              <button type="button" className="xp-button" onClick={close}>
                Tamam
              </button>
            </div>
          </div>
        ) : (
          <form className="xp-form" onSubmit={(event) => void submit(event)}>
            <div className={step === "profile" ? "xp-form-fields xp-user-profile-fields" : "xp-form-fields"}>
              {error ? <p role="alert" className="xp-form-banner">{error}</p> : null}
              {step === "profile" ? (
                <>
                  <p className="xp-defs-note xp-user-profile-intro">
                    Personelin kullanıcı tipini, görevini ve rolünü belirleyin. Otel ataması sonraki adımda yapılır.
                  </p>

                  {/* KULLANICI TİPİ SEÇİMİ */}
                  <div className="xp-user-category-box" style={{ marginBottom: "14px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "bold",
                        marginBottom: "6px",
                        color: "var(--xp-heading, #1e3a8a)",
                      }}
                    >
                      Kullanıcı Tipi
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                      <button
                        type="button"
                        className={`xp-button ${category === "SISTEM" ? "is-selected font-bold" : ""}`}
                        style={{
                          padding: "8px 6px",
                          fontWeight: category === "SISTEM" ? "bold" : "normal",
                          background: category === "SISTEM" ? "var(--xp-accent, #0055ea)" : undefined,
                          color: category === "SISTEM" ? "#fff" : undefined,
                        }}
                        onClick={() => handleCategoryChange("SISTEM")}
                      >
                        Sistem Yöneticisi
                      </button>
                      <button
                        type="button"
                        className={`xp-button ${category === "YONETICI" ? "is-selected font-bold" : ""}`}
                        style={{
                          padding: "8px 6px",
                          fontWeight: category === "YONETICI" ? "bold" : "normal",
                          background: category === "YONETICI" ? "var(--xp-accent, #0055ea)" : undefined,
                          color: category === "YONETICI" ? "#fff" : undefined,
                        }}
                        onClick={() => handleCategoryChange("YONETICI")}
                      >
                        Yönetici
                      </button>
                      <button
                        type="button"
                        className={`xp-button ${category === "KULLANICI" ? "is-selected font-bold" : ""}`}
                        style={{
                          padding: "8px 6px",
                          fontWeight: category === "KULLANICI" ? "bold" : "normal",
                          background: category === "KULLANICI" ? "var(--xp-accent, #0055ea)" : undefined,
                          color: category === "KULLANICI" ? "#fff" : undefined,
                        }}
                        onClick={() => handleCategoryChange("KULLANICI")}
                      >
                        Kullanıcı
                      </button>
                    </div>
                    <p
                      className="xp-defs-note"
                      style={{
                        marginTop: "5px",
                        fontSize: "11px",
                        lineHeight: "1.4",
                        color: "var(--xp-text-muted, #475569)",
                      }}
                    >
                      {category === "SISTEM" &&
                        "Sistem Yöneticisi: Tüm otellerde, minibar ve outlet operasyonlarında en üst düzey tam yetkiye sahiptir."}
                      {category === "YONETICI" &&
                        "Yönetici: Minibar takip sorumlusu, depo sorumlusu, outlet yöneticisi, outlet şefi, kasa yöneticisi veya mutfak şefi."}
                      {category === "KULLANICI" &&
                        "Operasyonel Kullanıcı: Minibar kat görevlisi, servis garsonu, barmen, komi veya mutfak personeli."}
                    </p>
                  </div>

                  <Field name="fullName" label="Ad soyad">
                    <input
                      autoFocus
                      required
                      maxLength={100}
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                    />
                  </Field>

                  <Field name="jobTitle" label="Görev (F&B / Operasyon)">
                    <select
                      required
                      value={customJobTitle ? CUSTOM_JOB_TITLE : profile.jobTitle}
                      onChange={(e) => {
                        const custom = e.target.value === CUSTOM_JOB_TITLE;
                        setCustomJobTitle(custom);
                        setProfile({ ...profile, jobTitle: custom ? "" : e.target.value });
                      }}
                    >
                      <option value="">Görev seçin</option>
                      {category === "SISTEM" ? (
                        <optgroup label="Sistem & IT Görevleri">
                          <option value="Sistem Yöneticisi">Sistem Yöneticisi</option>
                          <option value="IT Yöneticisi">IT Yöneticisi</option>
                          <option value="Sistem Destek Sorumlusu">Sistem Destek Sorumlusu</option>
                        </optgroup>
                      ) : null}
                      {category === "YONETICI" ? (
                        <optgroup label="Yönetim & Süpervizör Görevleri">
                          <option value="Otel Müdürü">Otel Müdürü</option>
                          <option value="F&B Müdürü">F&B Müdürü</option>
                          <option value="Minibar Takip Süpervizör">Minibar Takip Süpervizör</option>
                          <option value="Minibar Takip Depo Sorumlusu">Minibar Takip Depo Sorumlusu</option>
                          <option value="Minibar Takip Sorumlusu">Minibar Takip Sorumlusu</option>
                          <option value="Depo Sorumlusu">Depo Sorumlusu</option>
                          <option value="Housekeeping Süpervizörü">Housekeeping Süpervizörü</option>
                          <option value="Outlet Müdürü">Outlet Müdürü</option>
                          <option value="Outlet Şefi">Outlet Şefi</option>
                          <option value="Restoran Müdürü">Restoran Müdürü</option>
                          <option value="Şef Garson">Şef Garson / Süpervizör</option>
                          <option value="Mutfak Şefi">Mutfak Şefi</option>
                          <option value="Kasa Yöneticisi">Kasa Yöneticisi</option>
                        </optgroup>
                      ) : null}
                      {category === "KULLANICI" ? (
                        <optgroup label="Operasyonel Personel Görevleri">
                          <option value="Minibar Takip Operasyonu">Minibar Takip Operasyonu</option>
                          <option value="Minibar Takip Kat Sorumlusu">Minibar Takip Kat Sorumlusu</option>
                          <option value="Kat Sorumlusu">Kat Sorumlusu (Minibar Takip)</option>
                          <option value="Kat Görevlisi">Kat Görevlisi</option>
                          <option value="Garson">Garson</option>
                          <option value="Komi">Komi</option>
                          <option value="Runner">Runner</option>
                          <option value="Barmen / Barmaid">Barmen / Barmaid</option>
                          <option value="Barista">Barista</option>
                          <option value="Mutfak Personeli">Mutfak Personeli</option>
                          <option value="Aşçı">Aşçı</option>
                          <option value="Kasiyer">Kasiyer</option>
                          <option value="Oda Servisi Görevlisi">Oda Servisi Görevlisi</option>
                          <option value="Butler (VIP)">Butler (VIP)</option>
                          <option value="KDS Operatörü">KDS Operatörü</option>
                        </optgroup>
                      ) : null}
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

                  {customJobTitle ? (
                    <Field name="customJobTitle" label="Görev unvanı">
                      <input
                        required
                        maxLength={100}
                        value={profile.jobTitle}
                        onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                      />
                    </Field>
                  ) : null}

                  <Field name="roleId" label="Rol ve yetkiler">
                    <select
                      required
                      value={roleId}
                      onChange={(e) => setRoleId(e.target.value)}
                    >
                      <option value="">Rol seçin</option>
                      {effectiveRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} ({role.code})
                        </option>
                      ))}
                      {effectiveRoles.length < allRoles.length ? (
                        <optgroup label="Diğer Tüm Roller">
                          {allRoles
                            .filter((r) => !effectiveRoles.some((er) => er.id === r.id))
                            .map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name} ({role.code})
                              </option>
                            ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </Field>

                  {selectedRole ? (
                    <div
                      className="xp-defs-note xp-user-role-note"
                      style={{
                        padding: "6px 8px",
                        background: "var(--xp-body, #f8fafc)",
                        border: "1px solid var(--xp-body-edge, #cbd5e1)",
                        borderRadius: "4px",
                        fontSize: "11px",
                      }}
                    >
                      <p>
                        Giriş sonrası açılış ekranı:{" "}
                        <strong style={{ color: "var(--xp-accent, #0055ea)" }}>
                          {selectedRole.defaultScreenName ?? "Rol için varsayılan ekran tanımlanmamış"}
                        </strong>
                      </p>
                      <p style={{ marginTop: "2px", opacity: 0.85 }}>
                        Ekran yetkileri ve menü görünümü sistem yöneticisi tarafından Yetki Matrisi panelinden
                        düzenlenebilir.
                      </p>
                    </div>
                  ) : null}

                  <Field name="phone" label="Telefon numarası (isteğe bağlı)">
                    <input
                      type="tel"
                      maxLength={30}
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    />
                  </Field>

                  <Field name="email" label="E-posta adresi (isteğe bağlı)">
                    <input
                      type="email"
                      maxLength={120}
                      value={profile.email}
                      placeholder="ornek@merithotels.com (isteğe bağlı)"
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    />
                  </Field>

                  <Field name="username" label="Sisteme giriş kullanıcı adı">
                    <input
                      required
                      autoComplete="off"
                      maxLength={40}
                      value={profile.username || suggestedUsername(profile.fullName)}
                      onChange={(e) => {
                        setProfile({ ...profile, username: e.target.value });
                      }}
                    />
                  </Field>

                  <p className="xp-defs-note xp-user-username-note">
                    Kullanıcı adı ad.soyad biçiminde önerilir ve bu alandan değiştirilebilir. Önerilen ad kullanımda ise
                    sonuna sayı eklenir.
                  </p>
                </>
              ) : (
                <>
                  <p className="xp-defs-note">
                    {profile.fullName} · {profile.jobTitle}
                  </p>
                  <Field name="hotelId" label="Ana otel">
                    <select value={hotelId} disabled={lockHotel} onChange={(e) => setHotelId(e.target.value)}>
                      <option value="">
                        {requireHotel ? "Otel seçin" : "Sistem kullanıcısı · otel ataması isteğe bağlı"}
                      </option>
                      {(options?.hotels ?? []).map((hotel) => (
                        <option key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {!lockHotel
                    ? options?.hotels
                        .filter((hotel) => hotel.id !== hotelId)
                        .map((hotel) => (
                          <Field key={hotel.id} name={`hotel:${hotel.id}`} label={`Ek otel · ${hotel.name}`}>
                            <input
                              type="checkbox"
                              checked={hotelIds.includes(hotel.id)}
                              onChange={(e) =>
                                setHotelIds((current) =>
                                  e.target.checked ? [...current, hotel.id] : current.filter((id) => id !== hotel.id),
                                )
                              }
                            />
                          </Field>
                        ))
                    : null}
                </>
              )}
            </div>
            <div className="xp-dialog-actions">
              {step === "assignment" ? (
                <button
                  type="button"
                  disabled={pending}
                  className="xp-button"
                  onClick={() => {
                    setStep("profile");
                    setError("");
                  }}
                >
                  Geri
                </button>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="xp-button"
                aria-busy={pending || undefined}
              >
                {pending ? "Kaydediliyor…" : step === "profile" ? "İleri" : "Kullanıcıyı kaydet"}
              </button>
              <button type="button" disabled={pending} className="xp-button" onClick={close}>
                Vazgeç
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );

  return portalRoot ? createPortal(dialogNode, portalRoot) : dialogNode;
}
