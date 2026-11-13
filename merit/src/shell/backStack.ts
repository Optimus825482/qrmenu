/**
 * The phone's back button for things that are not pages: an open sheet or dialog, a wizard step, unsaved input.
 * Each one puts an entry of its own on the browser history (same address); the browser's (Android's, the shell's)
 * "back" then lands on the entry below and the top-most owner is told, instead of the page being left.
 *
 * The owners live in a module-level stack, not in `history.state` (Next.js rewrites the state of the current entry
 * on refresh). History calls are queued: a pushed entry and a step back over a closed one never overtake each other.
 */

type Entry = { id: number; onBack: () => void; href: string };

const stack: Entry[] = [];
let seq = 0;
/** Steps back this module took itself: their popstate is not a user's "back". */
let ownSteps = 0;
let stepDone: (() => void) | null = null;
let queue: Promise<void> = Promise.resolve();
let listening = false;

/** How long a step back of our own may take before the queue moves on regardless. */
const STEP_TIMEOUT_MS = 800;

const here = () => `${window.location.pathname}${window.location.search}`;

function onPopState() {
  if (ownSteps > 0) {
    ownSteps -= 1;
    stepDone?.();
    return;
  }
  stack.pop()?.onBack();
}

function listen() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("popstate", onPopState);
  listening = true;
}

function enqueue(task: () => void | Promise<void>): Promise<void> {
  queue = queue.then(task, task);
  return queue;
}

/** One step back taken by this module (its popstate is swallowed); resolves when it landed. */
function ownStepBack(): Promise<void> {
  return new Promise((resolve) => {
    ownSteps += 1;
    const timer = setTimeout(() => {
      if (stepDone === done) {
        stepDone = null;
        ownSteps = Math.max(0, ownSteps - 1);
        resolve();
      }
    }, STEP_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      stepDone = null;
      resolve();
    };
    stepDone = done;
    window.history.back();
  });
}

/** Puts an entry on the history; `onBack` runs (once) when the user steps back over it. Returns its id. */
export function pushBackEntry(onBack: () => void): number {
  listen();
  const id = ++seq;
  stack.push({ id, onBack, href: typeof window === "undefined" ? "" : here() });
  void enqueue(() => {
    // The patched pushState of Next.js copies its own state into the entry; the address stays the same.
    window.history.pushState({ meritBack: id }, "");
  });
  return id;
}

/** Whether `id` is the top-most entry (a navigation from it may replace it instead of adding one). */
export function isTopBackEntry(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1]!.id === id;
}

/**
 * Takes an entry off when its owner closed by itself (a button, a save). When it is the top-most entry and the
 * page is still the one it was put on, the browser steps back over it, so no dead "back" step is left behind;
 * after a navigation away it is only forgotten. Resolves once the history is in place.
 */
export function dropBackEntry(id: number): Promise<void> {
  const at = stack.findIndex((e) => e.id === id);
  if (at === -1) return queue;
  const [entry] = stack.splice(at, 1);
  const wasTop = at === stack.length;
  if (!wasTop || typeof window === "undefined") return queue;
  return enqueue(() => (here() === entry!.href ? ownStepBack() : undefined));
}

/** Forgets an entry without touching the history: a navigation is about to replace it. */
export function forgetBackEntry(id: number): void {
  const at = stack.findIndex((e) => e.id === id);
  if (at !== -1) stack.splice(at, 1);
}

/** The browser's "back", queued behind pending entry changes (in-page "Geri" of a wizard step, leaving a page). */
export function historyBack(): Promise<void> {
  return enqueue(() => {
    window.history.back();
  });
}

/** Test helper: forgets every entry and pending step. */
export function resetBackStack(): void {
  stack.length = 0;
  ownSteps = 0;
  stepDone = null;
  queue = Promise.resolve();
}
