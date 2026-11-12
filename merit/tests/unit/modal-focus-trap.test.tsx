// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalFocusTrap } from "@/modules/menu/ui/guest/useModalFocusTrap";

function Modal({ onClosed }: { onClosed: () => void }) {
  const [note, setNote] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // A new function on every render, as SelectionsDrawer and ItemSheet pass it.
  const close = () => onClosed();
  useModalFocusTrap({ onClose: close, initialFocusRef: closeRef, containerRef: boxRef });
  return (
    <div ref={boxRef}>
      <button ref={closeRef} type="button">kapat</button>
      <textarea aria-label="not" value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useModalFocusTrap", () => {
  it("yazarken odak metin kutusunda kalır; Escape en güncel onClose'u çağırır", () => {
    vi.useFakeTimers();
    const onClosed = vi.fn();
    render(<Modal onClosed={onClosed} />);
    act(() => void vi.advanceTimersByTime(50));
    expect(document.activeElement).toBe(screen.getByText("kapat"));

    const box = screen.getByLabelText("not");
    box.focus();
    for (const value of ["a", "ab", "abc"]) {
      fireEvent.change(box, { target: { value } });
      act(() => void vi.advanceTimersByTime(50));
      expect(document.activeElement).toBe(box);
    }

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
