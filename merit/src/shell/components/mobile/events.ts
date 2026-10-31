import type { MeritEvent } from "@/lib/realtime-events";

/** The mobile shell subscribes once to the shared SSE connection and hands events to the tabs. */
export type SubscribeEvents = (listener: (e: MeritEvent) => void) => () => void;
