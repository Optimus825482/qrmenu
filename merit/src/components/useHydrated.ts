import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and the hydration pass, true afterwards. Forms driven by client
 * actions disable their submit button until then: before hydration a click would do nothing.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
