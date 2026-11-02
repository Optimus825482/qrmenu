import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "../../src/app");

/**
 * Does `src/app` hold a page.tsx for this route? Route groups "(x)" are transparent; a "[param]"
 * folder is never matched (a catalogue path must not need an id).
 */
export function hasPage(route: string, dir = APP_DIR): boolean {
  const segments = route.replace(/[?#].*$/, "").split("/").filter(Boolean);
  return walk(segments, dir);
}

function walk(segments: string[], dir: string): boolean {
  if (segments.length === 0 && existsSync(path.join(dir, "page.tsx"))) return true;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (/^\(.+\)$/.test(entry.name)) {
      if (walk(segments, path.join(dir, entry.name))) return true;
    } else if (segments.length > 0 && entry.name === segments[0]) {
      if (walk(segments.slice(1), path.join(dir, entry.name))) return true;
    }
  }
  return false;
}
