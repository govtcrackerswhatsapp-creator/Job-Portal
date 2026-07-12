// A tiny in-memory cache with per-key TTL. Lives in module memory: shared across
// the app during a session, cleared on full page refresh. Used only for public,
// slow-changing data (jobs, plans) — never for access/payment state.
interface Entry<T> { data: T; at: number; }

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const e = store.get(key);
  if (e && Date.now() - e.at < ttlMs) return e.data as T;
  return null;
}

export function cacheSet<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() });
}

export function cacheClear(key: string): void {
  store.delete(key);
}