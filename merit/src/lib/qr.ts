import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";

export type QrKind = "TABLE" | "ROOM";

const RAND_BYTES = 16; // 22 base64url characters
const RAND_LENGTH = 22;
const SIG_LENGTH = 8;
export const QR_TOKEN_LENGTH = RAND_LENGTH + SIG_LENGTH; // 30
const TOKEN_RE = /^[A-Za-z0-9_-]{30}$/;

function sign(kind: QrKind, entityId: string, rand: string): string {
  return createHmac("sha256", env.QR_HMAC_SECRET)
    .update(`${kind}:${entityId}:${rand}`)
    .digest("base64url")
    .slice(0, SIG_LENGTH);
}

/** 22 random characters + 8 characters of HMAC over `kind:entityId:random` = 30 characters. */
export function generateQrToken(kind: QrKind, entityId: string): string {
  const rand = randomBytes(RAND_BYTES).toString("base64url");
  return rand + sign(kind, entityId, rand);
}

/** Constant-time check that `token` was issued for exactly this kind and entity. */
export function verifyQrToken(token: string, kind: QrKind, entityId: string): boolean {
  if (!isSignedToken(token)) return false;
  const expected = Buffer.from(sign(kind, entityId, token.slice(0, RAND_LENGTH)));
  const given = Buffer.from(token.slice(RAND_LENGTH));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Shape check only (30 base64url characters); older 6-digit room codes and placeholders are not signed. */
export function isSignedToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export async function qrUrl(token: string): Promise<string> {
  const base = (await getSetting("qr.baseUrl")).replace(/\/+$/, "");
  return `${base}/q/${token}`;
}

export function renderQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1 });
}

export function renderQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: "png", margin: 1, width: 512 });
}
