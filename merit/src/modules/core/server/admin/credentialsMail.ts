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

export type CredentialsMailInput = {
  fullName: string;
  username: string;
  siteUrl: string;
  /** Present only when a new temporary password was issued. */
  temporaryPassword?: string;
};

export const CREDENTIALS_SUBJECT = "F&B Command Center giriş bilgileriniz";

/** Builds the subject, plain text and simple HTML of the sign-in details mail. */
export function composeCredentialsMail(input: CredentialsMailInput): { subject: string; text: string; html: string } {
  const { fullName, username, siteUrl, temporaryPassword } = input;
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
        <p style="font-size: 13px;">Bu bilgileri kimseyle paylaşmayın.</p>
      </div>
    </div>`;
  return { subject: CREDENTIALS_SUBJECT, text: lines.join("\n"), html };
}
