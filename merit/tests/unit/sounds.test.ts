import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NAMES = ["new-order", "ready", "call", "error"] as const;
const read = (name: string) => readFileSync(join(process.cwd(), "public", "sounds", `${name}.wav`));

describe("ses dosyaları", () => {
  it("dört WAV dosyası var, geçerli başlık, 16-bit mono, süre en fazla 1,0 sn", () => {
    for (const name of NAMES) {
      const buf = read(name);
      expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
      expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
      const channels = buf.readUInt16LE(22);
      const rate = buf.readUInt32LE(24);
      const bits = buf.readUInt16LE(34);
      expect(buf.toString("ascii", 36, 40)).toBe("data");
      const dataBytes = buf.readUInt32LE(40);
      expect(channels).toBe(1);
      expect(bits).toBe(16);
      const seconds = dataBytes / (rate * channels * (bits / 8));
      expect(seconds).toBeGreaterThan(0.1);
      expect(seconds).toBeLessThanOrEqual(1.0);
    }
  });

  it("dört dosyanın SHA-256 karması birbirinden farklı", () => {
    const hashes = NAMES.map((name) => createHash("sha256").update(read(name)).digest("hex"));
    expect(new Set(hashes).size).toBe(4);
  });
});
