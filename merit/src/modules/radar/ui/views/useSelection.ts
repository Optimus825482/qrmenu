import { useState } from "react";

/**
 * The selected record of a view. With `onChange` the radar owns it (so an alert, the ticker or the path bar can
 * open and close a record); without it the view keeps its own, as the board of another hotel does.
 */
export function useSelection(
  value: string | null | undefined,
  onChange: ((id: string | null) => void) | undefined,
): [string | null, (id: string | null) => void] {
  const [own, setOwn] = useState<string | null>(null);
  return onChange ? [value ?? null, onChange] : [own, setOwn];
}
