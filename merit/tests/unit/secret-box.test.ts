import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { isSealed, openSecret, sealSecret } from "@/lib/secret-box";

const original = { session: env.SESSION_SECRET, key: env.SETTINGS_SECRET_KEY };
afterEach(() => {
  env.SESSION_SECRET = original.session;
  env.SETTINGS_SECRET_KEY = original.key;
});

describe("secret-box", () => {
  it("mühürler: enc:v1: öneki, düz metin yok, her mühür farklı, geri açılır", () => {
    const a = sealSecret("s3cret!");
    const b = sealSecret("s3cret!");
    expect(a.startsWith("enc:v1:")).toBe(true);
    expect(a).not.toContain("s3cret!");
    expect(a).not.toBe(b);
    expect(openSecret(a)).toBe("s3cret!");
    expect(openSecret(b)).toBe("s3cret!");
    expect(openSecret(sealSecret("Şifre-ğüşiöç 🔑"))).toBe("Şifre-ğüşiöç 🔑");
  });

  it("bozuk değer veya düz metin null verir", () => {
    const sealed = sealSecret("s3cret!");
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(openSecret(flipped)).toBeNull();
    expect(openSecret("enc:v1:abc")).toBeNull();
    expect(openSecret("duz-metin")).toBeNull();
  });

  it("SESSION_SECRET değişince açılamaz; SETTINGS_SECRET_KEY varsa onu kullanır", () => {
    const sealed = sealSecret("s3cret!");
    env.SESSION_SECRET = "x".repeat(40);
    expect(openSecret(sealed)).toBeNull();
    env.SESSION_SECRET = original.session;
    expect(openSecret(sealed)).toBe("s3cret!");

    env.SETTINGS_SECRET_KEY = "k".repeat(40);
    const own = sealSecret("abc");
    env.SESSION_SECRET = "y".repeat(40);
    expect(openSecret(own)).toBe("abc");
    env.SETTINGS_SECRET_KEY = undefined;
    expect(openSecret(own)).toBeNull();
  });

  it("isSealed", () => {
    expect(isSealed(sealSecret("a"))).toBe(true);
    expect(isSealed("x")).toBe(false);
  });
});
