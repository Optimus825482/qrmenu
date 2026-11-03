/**
 * POS uyarı seslerini üretir: public/sounds/{new-order,ready,call,error}.wav (16-bit mono PCM, 22,05 kHz).
 * Telifli ses dosyası yoktur; ton dizileri bu betikten gelir. Çalıştırma: `npx tsx scripts/generate-sounds.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const RATE = 22050;

type Note = { freq: number; ms: number; gain?: number };

function render(notes: Note[]): Int16Array {
  const total = notes.reduce((n, note) => n + Math.round((note.ms / 1000) * RATE), 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const note of notes) {
    const len = Math.round((note.ms / 1000) * RATE);
    for (let i = 0; i < len; i++) {
      // 10 ms giriş / 40 ms çıkış zarfı: tık sesi olmaz.
      const attack = Math.min(1, i / (RATE * 0.01));
      const release = Math.min(1, (len - i) / (RATE * 0.04));
      const sample = note.freq === 0 ? 0 : Math.sin((2 * Math.PI * note.freq * i) / RATE);
      out[at + i] = Math.round(sample * attack * release * (note.gain ?? 0.5) * 32767);
    }
    at += len;
  }
  return out;
}

function wav(samples: Int16Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const CUES: Record<string, Note[]> = {
  // Yeni sipariş: yükselen iki nota.
  "new-order": [{ freq: 523, ms: 140 }, { freq: 784, ms: 220 }],
  // Hazır: yumuşak tek çan.
  ready: [{ freq: 659, ms: 260, gain: 0.4 }],
  // Çağrı: üç kısa tiz bip (dikkat çeker, siparişten ayırt edilir).
  call: [{ freq: 988, ms: 90 }, { freq: 0, ms: 60 }, { freq: 988, ms: 90 }, { freq: 0, ms: 60 }, { freq: 988, ms: 90 }],
  // Hata: alçak, uzun.
  error: [{ freq: 196, ms: 320, gain: 0.45 }],
};

const dir = path.resolve(__dirname, "../public/sounds");
mkdirSync(dir, { recursive: true });
for (const [name, notes] of Object.entries(CUES)) {
  writeFileSync(path.join(dir, `${name}.wav`), wav(render(notes)));
}
console.log(`public/sounds: ${Object.keys(CUES).length} dosya üretildi`);
