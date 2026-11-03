import type { RadarEvent } from "../../types";
import type { RadarState, StateSession } from "../../state";
import { addRefresh, replaceAt } from "./util";

type Ev<T extends RadarEvent["type"]> = Extract<RadarEvent, { type: T }>;

/** `presence`: add/remove/refresh a session; BOSTA marks it idle. */
export function reducePresence(s: RadarState, e: Ev<"presence">): RadarState {
  const layer = s.layers.staff;
  if (!layer) return s;
  const idx = layer.sessions.findIndex((x) => x.sessionId === e.sessionId);
  if (e.userId === "") {
    // Normalised `presence.tick` touch: lastSeenAt only; unknown sessions are ignored.
    if (idx < 0) return s;
    const lastSeenAt = e.lastSeenAt ?? e.at;
    if (layer.sessions[idx].lastSeenAt === lastSeenAt) return s;
    return {
      ...s,
      layers: { ...s.layers, staff: { sessions: replaceAt(layer.sessions, idx, { ...layer.sessions[idx], lastSeenAt }) } },
    };
  }
  if (e.status === "CIKTI" || e.status === "DUSURULDU") {
    if (idx < 0) return s;
    return { ...s, layers: { ...s.layers, staff: { sessions: layer.sessions.filter((_, i) => i !== idx) } } };
  }
  // A session we never saw has no name/role on the wire.
  if (idx < 0) return addRefresh(s, `session:${e.sessionId}`);
  const old = layer.sessions[idx];
  const lastSeenAt = e.lastSeenAt ?? e.at;
  const idle = e.status === "BOSTA";
  const status = e.status === "BOSTA" ? old.status : e.status;
  const base: StateSession = { ...old, status, lastSeenAt };
  if (e.outletId) base.outletId = e.outletId;
  if (e.place) base.lastPlace = e.place;
  if (idle) base.idle = true;
  else delete base.idle;
  return { ...s, layers: { ...s.layers, staff: { sessions: replaceAt(layer.sessions, idx, base) } } };
}
