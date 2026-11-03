// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveOnline, guardMutations, installOfflineGuard } from "@/components/staff/useOnline";

function button(label: string, attrs: Record<string, string>, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.textContent = label;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.addEventListener("click", onClick);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("deriveOnline", () => {
  it("tarayıcı çevrimdışıysa SSE ne derse desin offline", () => {
    expect(deriveOnline(false, "open")).toBe("offline");
    expect(deriveOnline(false, "connecting")).toBe("offline");
  });
  it("çevrimiçi + SSE açık = online; açılıyor/kapalı = connecting", () => {
    expect(deriveOnline(true, "open")).toBe("online");
    expect(deriveOnline(true, "connecting")).toBe("connecting");
    expect(deriveOnline(true, "closed")).toBe("connecting");
  });
});

describe("çevrimdışıyken veri değiştiren düğmeler", () => {
  it("offline: [data-mutates] aria-disabled olur ve tıklama işleyiciye ulaşmaz; online: geri açılır", () => {
    const onClick = vi.fn();
    const onRead = vi.fn();
    const approve = button("Onayla", { "data-mutates": "" }, onClick);
    const read = button("Yenile", {}, onRead);
    const stop = installOfflineGuard(document);

    guardMutations(document, true);
    expect(approve.getAttribute("aria-disabled")).toBe("true");
    approve.click();
    expect(onClick).not.toHaveBeenCalled();
    read.click();
    expect(onRead).toHaveBeenCalledTimes(1);

    guardMutations(document, false);
    expect(approve.hasAttribute("aria-disabled")).toBe(false);
    approve.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    stop();
  });

  it("kendi aria-disabled değerini koyan düğmeye dokunmaz", () => {
    const own = button("Kilitli", { "data-mutates": "", "aria-disabled": "true" }, () => {});
    guardMutations(document, true);
    guardMutations(document, false);
    expect(own.getAttribute("aria-disabled")).toBe("true");
  });
});
