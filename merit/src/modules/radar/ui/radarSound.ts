// Client-safe audio playback for Radar alerts and status cues.

let audioContext: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  if (!audioContext) {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtor) {
      try {
        audioContext = new AudioCtor();
      } catch {
        // unsupported in this environment
      }
    }
  }
  return audioContext;
}

export function unlockRadarAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

function playSynthesizedTone(freq: number, durationSec = 0.25): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // ignore
  }
}

export type RadarSoundName = "call" | "new-order" | "ready" | "error";

export function playRadarSound(name: RadarSoundName): void {
  unlockRadarAudio();
  const freqs: Record<RadarSoundName, number> = { call: 880, "new-order": 520, ready: 660, error: 220 };

  if (typeof Audio === "undefined") {
    playSynthesizedTone(freqs[name]);
    return;
  }

  try {
    const audio = new Audio(`/sounds/${name}.wav`);
    audio.volume = 0.75;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay policy or decoding failure: fall back to Web Audio oscillator tone
        playSynthesizedTone(freqs[name]);
      });
    }
  } catch {
    playSynthesizedTone(freqs[name]);
  }
}
