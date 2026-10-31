import type { MeritEvent } from "@/lib/realtime-events";

/** The mobile shell owns the one SSE connection and hands events to the tabs through this. */
export type SubscribeEvents = (listener: (e: MeritEvent) => void) => () => void;
