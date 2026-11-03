import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playCue, resetSoundGate, setMuted, soundStore, unlockAudio } from "@/components/pos/soundGate";

const g = globalThis as unknown as Record<string, unknown>;

beforeEach(() => resetSoundGate());
afterEach(() => {
  delete g.AudioContext;
  delete g.webkitAudioContext;
  delete g.Audio;
  vi.restoreAllMocks();
});

describe("soundGate", () => {
  it("başlangıç durumu locked", () => {
    expect(soundStore.getState().state).toBe("locked");
  });

  it("AudioContext yoksa unlockAudio unsupported olur ve fırlatmaz", async () => {
    await expect(unlockAudio()).resolves.toBeUndefined();
    expect(soundStore.getState().state).toBe("unsupported");
  });

  it("locked iken playCue ses nesnesi yaratmaz", () => {
    const audio = vi.fn();
    g.Audio = audio;
    playCue("new-order");
    expect(audio).not.toHaveBeenCalled();
  });

  it("kilit açılınca on olur, setMuted ile off/on arasında geçer; kapalıyken çalmaz", async () => {
    g.AudioContext = class {
      state = "suspended";
      resume = vi.fn(async () => {
        this.state = "running";
      });
    };
    const audio = vi.fn(function () {
      return { play: () => Promise.resolve() };
    });
    g.Audio = audio;
    await unlockAudio();
    expect(soundStore.getState().state).toBe("on");
    playCue("call");
    expect(audio).toHaveBeenCalledWith("/sounds/call.wav");
    setMuted(true);
    expect(soundStore.getState().state).toBe("off");
    playCue("call");
    expect(audio).toHaveBeenCalledTimes(1);
    setMuted(false);
    expect(soundStore.getState().state).toBe("on");
  });

  it("resume reddederse unsupported", async () => {
    g.AudioContext = class {
      state = "suspended";
      resume = () => Promise.reject(new Error("no"));
    };
    await unlockAudio();
    expect(soundStore.getState().state).toBe("unsupported");
  });
});
