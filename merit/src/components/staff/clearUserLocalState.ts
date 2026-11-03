const USER_PREFIX = "merit.u.";

/**
 * Shared hotel devices (spec S5): on logout everything the signed-in user left in this browser is
 * removed - every `merit.u.*` key and the whole sessionStorage. `merit.device` (what this device is)
 * belongs to the device, not to the user, and stays.
 */
export function clearUserLocalState(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(USER_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable (private window); nothing to clear then.
  }
  try {
    sessionStorage.clear();
  } catch {
    // ditto
  }
}
