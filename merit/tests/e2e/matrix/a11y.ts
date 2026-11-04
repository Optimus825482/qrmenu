import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { KNOWN_AXE_VIOLATIONS, KNOWN_TOUCH_VIOLATIONS, knownFor } from "./knownViolations";

export type Tier = "xp" | "personel" | "pos";

export type TouchViolation = { selector: string; text: string; w: number; h: number; need: number };

const MIN: Record<Tier, number> = { xp: 24, personel: 44, pos: 44 };
const PRIMARY: Record<Tier, number> = { xp: 24, personel: 56, pos: 64 };
const GAP: Record<Tier, number> = { xp: 0, personel: 8, pos: 12 };

const TARGETS =
  "button, a[href], [role=button], [role=tab], [role=menuitem], input:not([type=hidden]), select, textarea";

/**
 * Waits for finite CSS/Web animations (entry fades) to end: a box measured while it is still at
 * opacity 0 would be skipped and a screen could pass without being looked at. Infinite animations are ignored.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const within = (p: Promise<unknown>) => Promise.race([p, new Promise((res) => setTimeout(res, 3000))]);
    // Fonts first: a box measured before they applied would look unpadded.
    await within(document.fonts.ready);
    const finite = document
      .getAnimations()
      .filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity);
    await within(Promise.all(finite.map((a) => a.finished.catch(() => undefined))));
  });
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal scroll: ${scrollWidth} > ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}

/**
 * `layer`: index of the closest fixed/sticky ancestor (-1: page flow). Scrolling content and pinned
 * chrome (sticky bottom nav, fixed header) have no fixed distance, so they are not gap neighbours.
 */
type Box = { selector: string; text: string; x: number; y: number; w: number; h: number; primary: boolean; layer: number };

/** Visible, non-exempt interactive boxes of the page. */
async function collectBoxes(page: Page): Promise<Box[]> {
  await settle(page);
  return page.evaluate((targets) => {
    const out: Box[] = [];
    const layers: Element[] = [];
    const layerOf = (el: Element): number => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === "fixed" || pos === "sticky") {
          if (!layers.includes(n)) layers.push(n);
          return layers.indexOf(n);
        }
      }
      return -1;
    };
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    for (const el of Array.from(document.querySelectorAll(targets))) {
      if (el.closest("[data-tap-exempt]")) continue;
      if (el.matches("p a, li > a:not([class])") && el.closest("p")) continue;
      if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      if (el.closest("[hidden], [inert], [aria-hidden=true]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom < 0 || r.right < 0) continue;
      out.push({
        selector: describe(el),
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || el.getAttribute("aria-label") || "",
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        primary: el.hasAttribute("data-primary"),
        layer: layerOf(el),
      });
    }
    return out;
  }, TARGETS);
}

/** Touch targets smaller than the tier requires (xp >= 24, personel/pos >= 44, [data-primary] >= 56/64). */
export async function touchViolations(page: Page, tier: Tier): Promise<TouchViolation[]> {
  const boxes = await collectBoxes(page);
  const found: TouchViolation[] = [];
  for (const b of boxes) {
    const need = b.primary ? PRIMARY[tier] : MIN[tier];
    // Sub-pixel rounding must not flag a 44px target as 43.99.
    if (b.w + 0.5 < need || b.h + 0.5 < need) {
      found.push({ selector: b.selector, text: b.text, w: Math.round(b.w), h: Math.round(b.h), need });
    }
  }
  return found;
}

/** Neighbouring targets of one layer closer than the tier gap (0 < gap < min). Touching targets (gap 0) belong to one control. */
export async function gapViolations(page: Page, tier: Tier): Promise<{ a: string; b: string; gap: number }[]> {
  const min = GAP[tier];
  if (min === 0) return [];
  const boxes = await collectBoxes(page);
  const found: { a: string; b: string; gap: number }[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const c = boxes[j];
      if (a.layer !== c.layer) continue;
      const dx = Math.max(c.x - (a.x + a.w), a.x - (c.x + c.w));
      const dy = Math.max(c.y - (a.y + a.h), a.y - (c.y + c.h));
      // Boxes separated on one axis and overlapping on the other are neighbours.
      const gap = dx > 0 && dy > 0 ? Infinity : Math.max(dx, dy);
      if (gap > 0 && gap + 0.5 < min) found.push({ a: `${a.selector} ${a.text}`, b: `${c.selector} ${c.text}`, gap: Math.round(gap) });
    }
  }
  return found;
}

/**
 * Ratchet: a `key` listed in KNOWN_TOUCH_VIOLATIONS must still violate (so the list can only shrink);
 * an unlisted key must be clean.
 */
export async function expectTouchTargets(page: Page, tier: Tier, key: string): Promise<void> {
  const violations = await touchViolations(page, tier);
  const known = knownFor(KNOWN_TOUCH_VIOLATIONS, key);
  if (known) {
    expect(
      violations.length,
      `"${key}" is listed in KNOWN_TOUCH_VIOLATIONS (${known}) but is clean now: remove it`,
    ).toBeGreaterThan(0);
  } else {
    expect(violations, `touch targets of "${key}"`).toEqual([]);
  }
}

/** Serious/critical axe violations; KNOWN_AXE_VIOLATIONS uses the same ratchet. */
export async function expectNoSeriousAxe(page: Page, key: string, opts: { exclude?: string[] } = {}): Promise<void> {
  await settle(page);
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const { violations } = await builder.analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const known = knownFor(KNOWN_AXE_VIOLATIONS, key);
  if (known) {
    expect(
      serious.length,
      `"${key}" is listed in KNOWN_AXE_VIOLATIONS (${known}) but is clean now: remove it`,
    ).toBeGreaterThan(0);
  } else {
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message ?? "")).join(" | ")}`),
      `axe violations of "${key}"`,
    ).toEqual([]);
  }
}
