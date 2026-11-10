export const PRINT_TEMPLATES = ["stand", "compact", "badge"] as const;
export const PRINT_THEMES = ["royal", "classic", "dark"] as const;

export type PrintTemplate = (typeof PRINT_TEMPLATES)[number];
export type PrintTheme = (typeof PRINT_THEMES)[number];

/** White list: anything else (unknown, malformed, hostile) is `undefined`, i.e. the default. */
export function parsePrintTemplate(value: unknown): PrintTemplate | undefined {
  return PRINT_TEMPLATES.find((t) => t === value);
}

export function parsePrintTheme(value: unknown): PrintTheme | undefined {
  return PRINT_THEMES.find((t) => t === value);
}
