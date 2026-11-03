import type { RadarEvent } from "../../types";
import type { RadarState } from "../../state";

/** `mail.failed`: tracked by event id, so a replayed event never counts twice. */
export function reduceMailFailed(s: RadarState, e: Extract<RadarEvent, { type: "mail.failed" }>): RadarState {
  if (s.mailIds[e.id]) return s;
  return { ...s, mailIds: { ...s.mailIds, [e.id]: true }, mailFailed: s.mailFailed + 1 };
}
