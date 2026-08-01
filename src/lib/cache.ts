/**
 * A tiny cache with per-key TTL, used only for public, slow-changing data
 * (jobs, plans, categories) — never for access or payment state.
 *
 * Two layers:
 *   1. Module memory — shared across the app, lost on page refresh.
 *   2. sessionStorage — survives refreshes and in-app full reloads within the
 *      same tab, and is cleared when the tab closes.
 *
 * Layer 2 is opt-in per call site (cacheSet's third argument) because it is
 * only worth the serialise cost for large payloads. The jobs list is the one
 * that matters: it was being refetched in full on every refresh.
 *
 * sessionStorage rather than localStorage is deliberate. A cache that outlives
 * the tab would show a returning visitor yesterday's jobs, and there is no
 * cross-tab invalidation here to correct it.
 */
interface Entry<T> { data: T; at: number; }

/**
 * Bump this whenever the SHAPE of any cached value changes — for example when
 * paid fields move out of the job document. Old entries are then ignored rather
 * than deserialised into a structure the code no longer expects.
 */
const VERSION = 'v1';
const PREFIX = `tk:${VERSION}:`;

/** Skip persisting anything above this. Protects against a quota exception on
 *  large job sets; the memory cache still works, so the only cost is a refetch
 *  after a refresh. */
const MAX_PERSIST_BYTES = 2 * 1024 * 1024;

const store = new Map<string, Entry<unknown>>();

function readSession<T>(key: string): Entry<T> | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    // Unavailable, disabled, or corrupt — behave as a cache miss.
    return null;
  }
}

function writeSession<T>(key: string, entry: Entry<T>): void {
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_PERSIST_BYTES) return;
    window.sessionStorage.setItem(PREFIX + key, raw);
  } catch {
    // Quota exceeded or storage blocked (private mode, embedded webview).
    // Non-fatal by design: memory caching is unaffected.
  }
}

/**
 * Fresh value for this key, or null.
 * Checks memory first, then sessionStorage — a hit there is promoted into
 * memory so the JSON.parse happens at most once per tab.
 */
export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const mem = store.get(key);
  if (mem && Date.now() - mem.at < ttlMs) return mem.data as T;

  const persisted = readSession<T>(key);
  if (persisted && Date.now() - persisted.at < ttlMs) {
    store.set(key, persisted);
    return persisted.data;
  }

  return null;
}

/**
 * Store a value. Pass persist=true to also survive refreshes in this tab.
 * The default is false, so existing call sites keep their old behaviour.
 */
export function cacheSet<T>(key: string, data: T, persist = false): void {
  const entry: Entry<T> = { data, at: Date.now() };
  store.set(key, entry);
  if (persist) writeSession(key, entry);
}

/** Drop a key from both layers. Called after an admin creates or edits data. */
export function cacheClear(key: string): void {
  store.delete(key);
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable — memory copy is already gone */
  }
}