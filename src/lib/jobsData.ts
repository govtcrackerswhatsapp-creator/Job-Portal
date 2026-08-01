import { auth, db } from './firebase';
import { collection, doc, writeBatch, addDoc, updateDoc } from 'firebase/firestore';
import { Job } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

const JOBS_KEY = 'jobs';

/**
 * How long a fetched jobs list stays fresh.
 *
 * The dashboard pulls the whole collection on every miss, so a short TTL was
 * charging a full read several times per browsing session and once more on
 * every refresh. Combined with the sessionStorage persistence in cache.ts, a
 * typical visit now costs one fetch instead of four or five.
 *
 * TRADE-OFF: a job posted right now can take up to this long to appear in a tab
 * that is ALREADY open. The admin's own tab is unaffected — ManageJobs calls
 * clearJobsCache() after every write, and getJobs(true) bypasses this entirely.
 */
const TTL = 15 * 60 * 1000; // 15 minutes

/**
 * READS GO THROUGH THE SERVER NOW.
 *
 * Firestore has no field-level read rules, so while the browser read the jobs
 * collection directly it held examDetails and studyMaterial for every listing —
 * the paywall in JobDetails was a redirect, not a boundary. /api/jobs works out
 * entitlement from the caller's token and deletes the paid fields before the
 * response is serialised, so a free user's browser never receives them.
 *
 * What this costs: a Vercel function hop, and a cold start on the first call
 * after the container has been idle. The 15-minute cache above absorbs most of
 * it — one request per tab per fifteen minutes, not one per page view.
 *
 * What it buys beyond enforcement: the server caches raw documents across
 * callers, so a hundred visitors in the same minute cost one collection read
 * instead of a hundred.
 *
 * WRITES still go straight to Firestore — the importer below is unchanged.
 * Security rules already restrict job writes to staff, and rules CAN express
 * that, because it is a document-level question rather than a field-level one.
 */
async function fetchJobs(params: { id?: string; fresh?: boolean }): Promise<Job[]> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in');

  const qs = new URLSearchParams();
  if (params.id) qs.set('id', params.id);
  if (params.fresh) qs.set('fresh', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  const resp = await fetch(`/api/jobs${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.error || `Could not load jobs (${resp.status})`);
  }

  const data = await resp.json();
  return Array.isArray(data?.jobs) ? (data.jobs as Job[]) : [];
}

/** All jobs (newest first), cached for 15 min and persisted for this tab. */
export async function getJobs(force = false): Promise<Job[]> {
  if (!force) {
    const cached = cacheGet<Job[]>(JOBS_KEY, TTL);
    if (cached) return cached;
  }
  const list = await fetchJobs({ fresh: force });
  // persist=true: the one payload big enough to be worth surviving a refresh,
  // and the only one whose cost scales with the content.
  cacheSet(JOBS_KEY, list, true);
  return list;
}

/**
 * A single job. Reuses the cached list when present (no request at all), else
 * asks the server for just that one.
 *
 * The cached entry is already gated for THIS user — the server shaped it on the
 * way in — so reusing it can never hand someone content they are not entitled
 * to. The cache is per-tab and per-session, so it cannot outlive a sign-out.
 */
export async function getJob(id: string): Promise<Job | null> {
  const cached = cacheGet<Job[]>(JOBS_KEY, TTL);
  if (cached) {
    const found = cached.find((j) => j.id === id);
    if (found) return found;
  }
  const list = await fetchJobs({ id });
  return list.length > 0 ? list[0] : null;
}

/** Clear the jobs cache — call after a job is created/edited/deleted. */
export function clearJobsCache(): void {
  cacheClear(JOBS_KEY);
}

export interface ImportOp {
  kind: 'create' | 'update';
  /** Required for 'update'. */
  id?: string;
  data: Record<string, unknown>;
  /** Shown if this row fails. */
  label: string;
}

export interface ImportOutcome {
  created: number;
  updated: number;
  failures: { label: string; message: string }[];
}

/** Firestore caps a batch at 500 ops; 100 keeps rule-evaluation budget and
 *  progress feedback comfortable, and limits the blast radius of a rejection. */
const IMPORT_CHUNK = 100;

/**
 * Write an import plan. Batched for speed, with a per-row fallback: a batch is
 * atomic, so one row rejected by security rules would otherwise fail the whole
 * chunk. On failure we retry that chunk one document at a time, so the valid
 * rows still land and the caller learns exactly which ones did not.
 *
 * Unchanged by the move to /api/jobs. Writes are staff-only and Firestore rules
 * already enforce that at document level, so there is nothing an API hop would
 * add here beyond latency.
 */
export async function commitJobImport(
  ops: ImportOp[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportOutcome> {
  const out: ImportOutcome = { created: 0, updated: 0, failures: [] };

  for (let i = 0; i < ops.length; i += IMPORT_CHUNK) {
    const slice = ops.slice(i, i + IMPORT_CHUNK);
    try {
      const batch = writeBatch(db);
      slice.forEach((op) => {
        if (op.kind === 'create') batch.set(doc(collection(db, 'jobs')), op.data);
        else batch.update(doc(db, 'jobs', op.id as string), op.data as never);
      });
      await batch.commit();
      slice.forEach((op) => { if (op.kind === 'create') out.created++; else out.updated++; });
    } catch {
      for (const op of slice) {
        try {
          if (op.kind === 'create') {
            await addDoc(collection(db, 'jobs'), op.data);
            out.created++;
          } else {
            await updateDoc(doc(db, 'jobs', op.id as string), op.data as never);
            out.updated++;
          }
        } catch (e) {
          out.failures.push({ label: op.label, message: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    if (onProgress) onProgress(Math.min(i + IMPORT_CHUNK, ops.length), ops.length);
  }

  clearJobsCache();
  return out;
}