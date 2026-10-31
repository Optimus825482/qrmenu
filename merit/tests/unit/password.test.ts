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

  it("tanınmayan biçim ok:false döner (istisna yok)", async () => {
    expect(await verifyPassword("x", "md5$x$y")).toEqual({ ok: false, needsRehash: false });
    expect(await verifyPassword("x", "$2b$bozuk")).toEqual({ ok: false, needsRehash: false });
  });

  it("boş hash ok:false döner", async () => {
    expect(await verifyPassword("x", "")).toEqual({ ok: false, needsRehash: false });
  });
});
