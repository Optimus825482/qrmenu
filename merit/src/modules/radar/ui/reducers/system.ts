import type { RadarState } from "../../state";

export function reduceMailFailed(s: RadarState): RadarState {
  return { ...s, mailFailed: s.mailFailed + 1 };
}
