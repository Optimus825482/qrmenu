import { windowStore } from "./windowStore";

/*
 * Closing a window from outside it (the task button menu). Whether a window has unsaved changes is known
 * only to the mounted Window component, so each one registers its own close request here; asking through
 * this module keeps the "unsaved changes" question that the title bar button asks.
 */

type CloseRequest = () => void | Promise<void>;

const requests = new Map<string, CloseRequest>();

/** Called by a mounted window; returns the unregister function. */
export function registerCloseRequest(id: string, request: CloseRequest): () => void {
  requests.set(id, request);
  return () => {
    if (requests.get(id) === request) requests.delete(id);
  };
}

/** Asks the window to close; a window that is not mounted is closed directly. */
export function requestWindowClose(id: string): void {
  const request = requests.get(id);
  if (request) void request();
  else windowStore.getState().close(id);
}
