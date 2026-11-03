import { test } from "@playwright/test";

/** The six views of the UX matrix (spec P-UX-15). Each one is a Playwright project of the same name. */
export const VIEWPORTS = {
  "desktop-1366x768": { width: 1366, height: 768 },
  "tablet-1280x800": { width: 1280, height: 800 },
  "tablet-1024x768": { width: 1024, height: 768 },
  "tablet-768x1024": { width: 768, height: 1024 },
  "tablet-800x1280": { width: 800, height: 1280 },
  "phone-390x844": { width: 390, height: 844 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** The matrix project the running spec belongs to. */
export function projectName(): ViewportName {
  const name = test.info().project.name;
  if (!(name in VIEWPORTS)) throw new Error(`"${name}" is not a matrix project`);
  return name as ViewportName;
}
