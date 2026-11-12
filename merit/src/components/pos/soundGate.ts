import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * Ses kapısı: tarayıcılar sesi yalnız kullanıcı hareketinden sonra açar. `unlockAudio()` (kapı
 * düğmesi / ilk dokunuş) `AudioContext`'i uyandırır; kilitliyken `playCue` hiçbir ses nesnesi yaratmaz.
 * Kullanıcı sesi kapatabilir (`setMuted`); desteklenmiyorsa durum `unsupported` olur ve uygulama çalışmaya devam eder.
 */
export type SoundName = "new-order" | "ready" | "call" | "error" | "mybar";
export type SoundState = "locked" | "on" | "off" | "unsupported";

export const soundStore = createStore<{ state: SoundState }>()(() => ({ state: "locked" }));

const MUTE_KEY = "merit.pos.muted";
const FREQ: Record<SoundName, number> = { "new-order": 520, ready: 660, call: 880, error: 220, mybar: 740 };

type AudioCtor = new () => AudioContext;
let context: AudioContext | undefined;
let muted = false;

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function audioCtor(): AudioCtor | undefined {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext;
}

/** Kullanıcı hareketinde çağrılır. Hata fırlatmaz. */
export async function unlockAudio(): Promise<void> {
  const Ctor = audioCtor();
  if (!Ctor) {
    soundStore.setState({ state: "unsupported" });
    return;
  }
  try {
    context ??= new Ctor();
    if (context.state === "suspended") await context.resume();
    muted = readMuted();
    soundStore.setState({ state: muted ? "off" : "on" });
  } catch {
    soundStore.setState({ state: "unsupported" });
  }
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* gizli pencere: tercih yalnız bu oturumda geçerli */
  }
  const { state } = soundStore.getState();
  if (state === "on" || state === "off") soundStore.setState({ state: next ? "off" : "on" });
}

function beep(name: SoundName): void {
  if (!context) return;
  try {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = FREQ[name];
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.25);
  } catch {
    /* ses çalınamadı: sessiz geç */
  }
}

/** Kilitliyse veya kapalıysa hiçbir şey yapmaz. Önce /sounds/<ad>.wav, dosya çalınamazsa osilatör bip'i. */
export function playCue(name: SoundName): void {
  if (soundStore.getState().state !== "on") return;
  const AudioEl = (globalThis as unknown as { Audio?: new (src: string) => HTMLAudioElement }).Audio;
  if (!AudioEl) {
    beep(name);
    return;
  }
  try {
    const played = new AudioEl(`/sounds/${name}.wav`).play();
    if (played && typeof played.catch === "function") played.catch(() => beep(name));
  } catch {
    beep(name);
  }
}

export function useSoundState(): SoundState {
  return useStore(soundStore, (s) => s.state);
}

/** Yalnız testler için. */
export function resetSoundGate(): void {
  context = undefined;
  muted = false;
  soundStore.setState({ state: "locked" });
}
