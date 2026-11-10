import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword / verifyPassword", () => {
  it("bcrypt gidiş-dönüş: doğru şifre ok, yanlış şifre değil; needsRehash false", async () => {
    const hash = await hashPassword("Parola1!");
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash.split("$")[2]).toBe("12");
    expect(await verifyPassword("Parola1!", hash)).toEqual({ ok: true, needsRehash: false });
    expect(await verifyPassword("yanlis", hash)).toEqual({ ok: false, needsRehash: false });
  });

  it("Werkzeug pbkdf2:sha256 biçimi doğrulanır ve needsRehash true döner", async () => {
    const hex = pbkdf2Sync("Parola1!", "abc", 600000, 32, "sha256").toString("hex");
    const hash = `pbkdf2:sha256:600000$abc$${hex}`;
    expect(await verifyPassword("Parola1!", hash)).toEqual({ ok: true, needsRehash: true });
    expect(await verifyPassword("Yanlis1!", hash)).toEqual({ ok: false, needsRehash: false });
  });

  it("bozuk pbkdf2 biçimleri istisna fırlatmadan reddedilir", async () => {
    for (const bad of [
      "pbkdf2:sha256:600000$abc",
      "pbkdf2:sha256:abc$salt$00",
      "pbkdf2:sha256:0$salt$00",
      "pbkdf2:sha256:600000$salt$zz",
      "pbkdf2:sha256:600000$salt$",
    ]) {
      expect(await verifyPassword("Parola1!", bad)).toEqual({ ok: false, needsRehash: false });
    }
  });

  it("tek haneli fazla (65 karakter) veya eksik özet reddedilir", async () => {
    const hex = pbkdf2Sync("Parola1!", "abc", 1000, 32, "sha256").toString("hex");
    expect(await verifyPassword("Parola1!", `pbkdf2:sha256:1000$abc$${hex}`)).toMatchObject({ ok: true });
    expect(await verifyPassword("Parola1!", `pbkdf2:sha256:1000$abc$${hex}0`)).toEqual({
      ok: false,
      needsRehash: false,
    });
    expect(await verifyPassword("Parola1!", `pbkdf2:sha256:1000$abc$${hex.slice(0, 62)}`)).toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it("tanınmayan biçim ok:false döner (istisna yok)", async () => {
    expect(await verifyPassword("x", "md5$x$y")).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPassword("x", "$2b$bozuk")).toEqual({ ok: false, needsRehash: false });
  });

  it("boş hash ok:false döner", async () => {
    expect(await verifyPassword("x", "")).toEqual({ ok: false, needsRehash: false });
  });
});

describe('passwordPolicyError', () => {
  it('en az 10 karakter, büyük + küçük harf + rakam ister (Türkçe harfler sayılır)', async () => {
    const { passwordPolicyError } = await import('@/lib/password');
    expect(passwordPolicyError('Parola12345')).toBeNull();
    expect(passwordPolicyError('ÖzelŞifre123')).toBeNull();
    expect(passwordPolicyError('Kisa1A')).toMatch(/10/);
    expect(passwordPolicyError('kucukharf12345')).toMatch(/büyük/);
    expect(passwordPolicyError('BUYUKHARF12345')).toMatch(/küçük/);
    expect(passwordPolicyError('HarfHarfHarfHarf')).toMatch(/rakam/);
    expect(passwordPolicyError('A'.repeat(200) + 'a1')).toMatch(/128/);
  });

  it('bcrypt 72 bayt sınırı bayt cinsinden uygulanır (Türkçe harfler 2 bayt)', async () => {
    const { passwordPolicyError } = await import('@/lib/password');
    expect(passwordPolicyError('Aa1' + 'x'.repeat(69))).toBeNull(); // 72 bayt
    expect(passwordPolicyError('Aa1' + 'x'.repeat(70))).toMatch(/72 bayt/); // 73 bayt, 73 karakter
    // 40 karakter ama 'ş' 2 bayt: 3 + 37*2 = 77 bayt
    expect(passwordPolicyError('Aa1' + 'ş'.repeat(37))).toMatch(/72 bayt/);
  });
});
