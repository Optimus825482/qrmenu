import { randomInt } from "node:crypto";
import { passwordPolicyError } from "@/lib/password";

// No 0/O, 1/l/I: the password is read from a screen or a printout and typed by hand.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALL = UPPER + LOWER + DIGIT;
const LENGTH = 12;

const pick = (set: string) => set[randomInt(set.length)]!;

/** Crypto-random 12-character temporary password (upper, lower and digit guaranteed, no ambiguous characters). */
export function generateTemporaryPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < LENGTH) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  const password = chars.join("");
  // Defensive: the construction already satisfies the policy.
  if (passwordPolicyError(password)) throw new Error("Geçici şifre üretilemedi");
  return password;
}

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** What the user may open, taken from the access summary: the short "how to use the system" part of the mail. */
export type CredentialsBriefing = {
  roleName: string;
  hotelName: string;
  /** Name of the screen that opens after sign-in, when it is one the user may view. */
  landingName?: string;
  modules: { label: string; screens: { name: string; purpose: string }[] }[];
};

export type CredentialsMailInput = {
  fullName: string;
  username: string;
  siteUrl: string;
  /** Present only when a new temporary password was issued. */
  temporaryPassword?: string;
  /** Left out when the user's access could not be read or is empty; the mail then carries sign-in details only. */
  briefing?: CredentialsBriefing;
};

/** Up to this many screens each one gets its purpose sentence; above it only the names, so the mail stays short. */
export const BRIEFING_DETAIL_LIMIT = 8;

type BriefingBlock = { label: string; items: string[] };

/** The briefing as plain data: intro lines, then one block per module (shared by the text and HTML bodies). */
function briefingParts(briefing: CredentialsBriefing): { intro: string[]; blocks: BriefingBlock[]; outro: string } | null {
  const modules = briefing.modules.filter((m) => m.screens.length > 0);
  if (modules.length === 0) return null;
  const total = modules.reduce((sum, m) => sum + m.screens.length, 0);
  const detailed = total <= BRIEFING_DETAIL_LIMIT;
  const intro = [`Rolünüz: ${briefing.roleName} (${briefing.hotelName})`];
  if (briefing.landingName) intro.push(`Giriş yaptığınızda ilk olarak “${briefing.landingName}” ekranı açılır.`);
  const blocks = modules.map((m) => ({
    label: m.label,
    items: detailed ? m.screens.map((s) => `${s.name}: ${s.purpose}`) : [m.screens.map((s) => s.name).join(", ")],
  }));
  return {
    intro,
    blocks,
    outro: "Bir ekranı ilk açtığınızda kısa bir rehber turu size adım adım yol gösterir. Yetkiniz olmayan ekranlar menüde görünmez; eksik bir yetki için yöneticinize başvurun.",
  };
}

export const CREDENTIALS_SUBJECT = "F&B Command Center giriş bilgileriniz";

/** Builds the subject, plain text and simple HTML of the sign-in details mail. */
export function composeCredentialsMail(input: CredentialsMailInput): { subject: string; text: string; html: string } {
  const { fullName, username, siteUrl, temporaryPassword } = input;
  const parts = input.briefing ? briefingParts(input.briefing) : null;
  const briefingText = parts
    ? [
        "",
        "SİSTEMİ NASIL KULLANACAKSINIZ",
        ...parts.intro,
        ...parts.blocks.flatMap((b) => ["", `${b.label}:`, ...b.items.map((item) => `- ${item}`)]),
        "",
        parts.outro,
      ]
    : [];
  const briefingHtml = parts
    ? `
        <div style="margin-top: 20px; padding: 14px 16px; background: #f1f5f9; border-left: 4px solid #0f172a;">
          <p style="margin: 0 0 8px; font-weight: bold; color: #0f172a;">Sistemi nasıl kullanacaksınız</p>
          ${parts.intro.map((line) => `<p style="margin: 0 0 4px; font-size: 13px;">${esc(line)}</p>`).join("")}
          ${parts.blocks
            .map(
              (b) =>
                `<p style="margin: 10px 0 2px; font-size: 13px; font-weight: bold;">${esc(b.label)}</p><ul style="margin: 0; padding-left: 18px; font-size: 13px;">${b.items
                  .map((item) => `<li>${esc(item)}</li>`)
                  .join("")}</ul>`,
            )
            .join("")}
          <p style="margin: 10px 0 0; font-size: 12px; color: #475569;">${esc(parts.outro)}</p>
        </div>`
    : "";
  const lines = temporaryPassword
    ? [
        `Merhaba ${fullName},`,
        "",
        "F&B Command Center giriş bilgileriniz aşağıdadır.",
        "",
        `Adres: ${siteUrl}`,
        `Kullanıcı adı: ${username}`,
        `Geçici şifre: ${temporaryPassword}`,
        "",
        "İlk girişte yeni bir şifre belirlemeniz istenecektir.",
        "Bu bilgileri kimseyle paylaşmayın.",
      ]
    : [
        `Merhaba ${fullName},`,
        "",
        "F&B Command Center giriş bilgileriniz aşağıdadır.",
        "",
        `Adres: ${siteUrl}`,
        `Kullanıcı adı: ${username}`,
        "",
        "Daha önce belirlediğiniz şifrenizle giriş yapabilirsiniz. Şifrenizi hatırlamıyorsanız bir sistem yöneticisinden şifre sıfırlama isteyebilirsiniz.",
        "Bu bilgileri kimseyle paylaşmayın.",
      ];
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0;">
      <div style="background: #0f172a; color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">F&amp;B Command Center</h2>
        <p style="margin: 5px 0 0; font-size: 13px;">Giriş bilgileriniz</p>
      </div>
      <div style="padding: 24px; color: #334155; line-height: 1.5;">
        <p>Merhaba ${esc(fullName)},</p>
        <p>F&amp;B Command Center giriş bilgileriniz aşağıdadır.</p>
        <p>Adres: <a href="${esc(siteUrl)}">${esc(siteUrl)}</a><br>
        Kullanıcı adı: <strong>${esc(username)}</strong>${
          temporaryPassword ? `<br>Geçici şifre: <strong style="font-family: monospace; font-size: 16px;">${esc(temporaryPassword)}</strong>` : ""
        }</p>
        <p style="font-size: 13px;">${
          temporaryPassword
            ? "İlk girişte yeni bir şifre belirlemeniz istenecektir."
            : "Daha önce belirlediğiniz şifrenizle giriş yapabilirsiniz. Şifrenizi hatırlamıyorsanız bir sistem yöneticisinden şifre sıfırlama isteyebilirsiniz."
        }</p>
        <p style="font-size: 13px;">Bu bilgileri kimseyle paylaşmayın.</p>${briefingHtml}
      </div>
    </div>`;
  return { subject: CREDENTIALS_SUBJECT, text: [...lines, ...briefingText].join("\n"), html };
}
