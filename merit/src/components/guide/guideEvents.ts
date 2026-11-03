/** Tiny event bridge: "?" buttons and menus ask the nearest guide host to open help or replay the tour. */
export const GUIDE_EVENT = "merit:guide";
export type GuideRequest = "help" | "tour";

export function requestGuide(type: GuideRequest, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent<{ type: GuideRequest }>(GUIDE_EVENT, { detail: { type } }));
}
