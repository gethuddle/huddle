const HUDDLE_SESSION_PREFIX = "huddle:";

type HuddleSessionStorage = Pick<Storage, "key" | "length" | "removeItem">;

/** Clears private, tab-scoped Huddle state without disturbing other applications. */
export function clearHuddleSessionStorage(storage?: HuddleSessionStorage): boolean {
  try {
    const activeStorage = storage ?? window.sessionStorage;
    for (let index = activeStorage.length - 1; index >= 0; index -= 1) {
      const key = activeStorage.key(index);
      if (key?.startsWith(HUDDLE_SESSION_PREFIX)) {
        activeStorage.removeItem(key);
      }
    }

    for (let index = activeStorage.length - 1; index >= 0; index -= 1) {
      if (activeStorage.key(index)?.startsWith(HUDDLE_SESSION_PREFIX)) return false;
    }
    return true;
  } catch {
    // Browser privacy settings must never prevent a completed account exit.
    return false;
  }
}
