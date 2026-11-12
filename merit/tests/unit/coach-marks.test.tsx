// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachMarks } from "@/components/guide/CoachMarks";
import {
  placeCard,
  readSeenLocal,
  resolveSteps,
  seenStorageKey,
  shouldAutoStart,
  tourKey,
  writeSeenLocal,
} from "@/components/guide/tourModel";
import { SCREEN_GUIDES } from "@/modules/core/screenGuide";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const allPresent = (t: string) => t;

describe("resolveSteps", () => {
  const zim = SCREEN_GUIDES["MB-ZIM"];

  it("R-KAT (yalnız V,D) Stok ekle adımını görmez, R-DEP görür", () => {
    const kat = resolveSteps(zim, ["V", "D"], allPresent).map((s) => s.title);
    const dep = resolveSteps(zim, ["V", "O", "D"], allPresent).map((s) => s.title);
    expect(kat).not.toContain("Stok ekle");
    expect(dep).toContain("Stok ekle");
    expect(dep).toHaveLength(kat.length + 1);
  });

  it("DOM'da hedefi olmayan adım atlanır; hiç hedef yoksa tur başlamaz", () => {
    const present = new Set(["havuz-listesi", "hareketler"]);
    const some = resolveSteps(zim, ["V", "O", "D"], (t) => (present.has(t) ? t : null));
    expect(some.map((s) => s.el)).toEqual(["havuz-listesi", "hareketler"]);
    expect(resolveSteps(zim, ["V", "O", "D"], () => null)).toEqual([]);
  });
});

describe("tur kuralları", () => {
  it("otomatik başlama: hoş geldin onaylı, sürüm görülmemiş ve ?tur=0 değil", () => {
    expect(shouldAutoStart({ welcomeOk: true, seenVersion: undefined, version: 1 })).toBe(true);
    expect(shouldAutoStart({ welcomeOk: true, seenVersion: 1, version: 1 })).toBe(false);
    expect(shouldAutoStart({ welcomeOk: true, seenVersion: 1, version: 2 })).toBe(true);
    expect(shouldAutoStart({ welcomeOk: false, seenVersion: undefined, version: 1 })).toBe(false);
    expect(shouldAutoStart({ welcomeOk: true, seenVersion: undefined, version: 1, tourParam: "0" })).toBe(false);
  });

  it("kart konumu: sığarsa altta, sığmazsa üstte, ekran kenarına taşmaz", () => {
    const vp = { width: 400, height: 600 };
    const card = { width: 300, height: 160 };
    const below = placeCard({ top: 100, left: 10, width: 80, height: 40 }, vp, card);
    expect(below.placement).toBe("below");
    expect(below.top).toBe(152);
    expect(below.left).toBeGreaterThanOrEqual(8);
    const above = placeCard({ top: 500, left: 350, width: 40, height: 40 }, vp, card);
    expect(above.placement).toBe("above");
    expect(above.left + card.width).toBeLessThanOrEqual(vp.width - 8);
    const edge = placeCard({ top: 0, left: 0, width: 400, height: 600 }, vp, card);
    expect(edge.placement).toBe("edge");
  });

  it("tuşlar: oklar gezinir, Esc kapatır", () => {
    expect(tourKey("ArrowRight")).toBe("next");
    expect(tourKey("ArrowLeft")).toBe("back");
    expect(tourKey("Escape")).toBe("close");
    expect(tourKey("a")).toBeNull();
  });

  it("görüldü bilgisi merit.u. önekiyle yerelde tutulur; depolama bozuksa sessizce 0", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeSeenLocal(storage, "MB-KAT", 2);
    expect(seenStorageKey("MB-KAT").startsWith("merit.u.")).toBe(true);
    expect(readSeenLocal(storage, "MB-KAT")).toBe(2);
    expect(readSeenLocal(storage, "MB-ZIM")).toBe(0);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSeenLocal(broken, "MB-KAT")).toBe(0);
    expect(() => writeSeenLocal(broken, "MB-KAT", 1)).not.toThrow();
    expect(readSeenLocal(null, "MB-KAT")).toBe(0);
  });
});

function setup() {
  const make = (text: string) => {
    const el = document.createElement("button");
    el.textContent = text;
    document.body.append(el);
    return el;
  };
  const a = make("Hedef A");
  const b = make("Hedef B");
  const c = make("Hedef C");
  const opener = make("Aç");
  opener.focus();
  const steps = [
    { el: a, title: "Birinci", body: "Metin bir" },
    { el: b, title: "İkinci", body: "Metin iki" },
    { el: c, title: "Üçüncü", body: "Metin üç" },
  ];
  return { a, b, c, opener, steps };
}

describe("CoachMarks", () => {
  it("diyalog, sayaç ve ileri/geri; son adımda Bitir 'done' bildirir", () => {
    const { steps } = setup();
    const onFinish = vi.fn();
    render(<CoachMarks steps={steps} onFinish={onFinish} />);
    expect(screen.getByRole("dialog", { name: "Ekran turu" })).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Geri" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "İleri" }));
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("İkinci")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "İleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Bitir" }));
    expect(onFinish).toHaveBeenCalledWith("done");
  });

  it("ok tuşları gezinir, Esc turu kapatır ve odak başlatan öğeye döner", () => {
    const { steps, opener } = setup();
    const onFinish = vi.fn();
    const { unmount } = render(<CoachMarks steps={steps} onFinish={onFinish} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2/3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("1/3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFinish).toHaveBeenCalledWith("skip");
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("Turu kapat 'skip' bildirir; adım sırasında hedef DOM'dan kalkarsa adım atlanır, sayaç kalan adedi gösterir", () => {
    const { steps, b } = setup();
    const onFinish = vi.fn();
    render(<CoachMarks steps={steps} onFinish={onFinish} />);
    b.remove();
    fireEvent.click(screen.getByRole("button", { name: "İleri" }));
    expect(screen.getByText("Üçüncü")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turu kapat" }));
    expect(onFinish).toHaveBeenCalledWith("skip");
  });

  it("odak tuzağı: Tab turun içinde kalır", () => {
    const { steps } = setup();
    render(<CoachMarks steps={steps} onFinish={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Ekran turu" });
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
