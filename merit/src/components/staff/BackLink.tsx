"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSyncExternalStore, type MouseEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { frameCanGoBack } from "@/shell/components/mobile/frameHistory";
import { stepBackIfPrevious } from "@/shell/FrameOwnBack";
import type { LeaveGuard } from "@/shell/useLeaveGuard";
import { useInShellFrame } from "@/shell/useInShellFrame";
import { backTarget, homeFor, pageName, pathOfHref, withContext } from "./backTarget";
import { useVisibleScreens } from "./StaffScreens";

const noSubscribe = () => () => {};

/** The address a shell window (MobileShell, the desktop XP window) opened this frame with; "" outside a frame. */
function frameSrc(): string {
  try {
    return window.frameElement?.getAttribute("src") ?? "";
  } catch {
    return "";
  }
}

/** Whether the page on screen is the first one of its shell window (the address the window was opened with). */
export function isFrameFirstScreen(pathname: string, src: string): boolean {
  return src !== "" && pathOfHref(src) === pathOfHref(pathname);
}

export type BackDecision =
  | { render: false }
  | { render: true; href: string; label: string; mode: "frame-back" | "step-or-replace" };

/**
 * What a back control does (pure, decision D1): inside a shell window, nothing on the window's first screen (the
 * shell's own arrow closes the app) and a step back of the window elsewhere; outside, nothing on a navigation root,
 * else the parent (going back in history when the parent is the previous entry, replacing otherwise).
 */
export function decideBack(input: {
  pathname: string;
  search: string;
  visible: ReadonlySet<string> | null;
  parent?: string;
  inFrame: boolean;
  frameSrc: string;
  frameHasHistory: boolean;
}): BackDecision {
  const visible = input.visible ?? new Set<string>();
  if (input.inFrame) {
    if (isFrameFirstScreen(input.pathname, input.frameSrc)) return { render: false };
    const target = backTarget({ pathname: input.pathname, search: input.search, visible, parent: input.parent });
    const href = target.kind === "back" ? target.href : withContext(homeFor(visible, input.pathname), new URLSearchParams(input.search));
    // Without a step of its own and with only the sign-in landing to go to, the window's own arrow is the way out.
    if (!input.frameHasHistory && pathOfHref(href) === "/baslat") return { render: false };
    return { render: true, href, label: pageName(href), mode: "frame-back" };
  }
  if (!input.visible && !input.parent) return { render: false };
  const target = backTarget({ pathname: input.pathname, search: input.search, visible, parent: input.parent });
  if (target.kind === "root") return { render: false };
  return { render: true, href: target.href, label: target.label, mode: "step-or-replace" };
}

/**
 * The single back control of the staff pages: "Geri", left-aligned as the first item of the page header. Leads to
 * the page's parent for this user (backTarget) and asks first when `guard` holds unsaved input.
 * `parent` names the parent when only the page's data knows it (a room's floor).
 */
export function BackLink({
  parent,
  guard,
  className,
  testId = "back-link",
}: {
  parent?: string;
  guard?: LeaveGuard;
  className?: string;
  testId?: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const visible = useVisibleScreens();
  const inFrame = useInShellFrame();
  const src = useSyncExternalStore(noSubscribe, frameSrc, () => "");
  const frameHasHistory = useSyncExternalStore(
    noSubscribe,
    () => inFrame && frameCanGoBack(window, src),
    () => false,
  );
  const decision = decideBack({ pathname, search, visible, parent, inFrame, frameSrc: src, frameHasHistory });
  if (!decision.render) return null;
  const { href, label, mode } = decision;

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (guard && !(await guard.leave())) return;
    if (mode === "frame-back" && frameCanGoBack(window, frameSrc())) {
      window.history.back();
      return;
    }
    if (stepBackIfPrevious(href)) return;
    router.replace(href);
  };

  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={`Geri: ${label}`}
      data-testid={testId}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg ${className ?? ""}`}
      style={{ minHeight: "max(var(--tap-action, 48px), var(--tap-min, 44px))", minWidth: "var(--tap-min, 44px)" }}
    >
      <Icon name="arrow-left" size={20} />
      Geri
    </a>
  );
}
