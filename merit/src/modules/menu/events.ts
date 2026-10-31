/** Realtime event types of the QR menu module. */
export const MENU_EVENTS = [
  "menu.availability",
  "menu.changed",
  "price.display",
  "ordering.changed",
  "scan.table",
] as const;
export type MenuEventType = (typeof MENU_EVENTS)[number];
