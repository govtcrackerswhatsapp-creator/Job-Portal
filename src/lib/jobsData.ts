import { db } from './firebase';
import { collection, getDocs, query, orderBy, doc, getDoc, writeBatch, addDoc, updateDoc } from 'firebase/firestore';
import { Job } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

const JOBS_KEY = 'jobs';

/**
 * How long a fetched jobs list stays fresh.
 *
 * Raised from 3 minutes. The dashboard reads the ENTIRE collection on every
 * miss — 67 documents today, and that number grows with the content — so a
 * short TTL was charging a full collection read several times per browsing
 * session, and once more on every refresh.
 *
 * Combined with sessionStorage persistence below, a typical visit now costs one
 * collection read instead of four or five.
 *
 * TRADE-OFF: a job posted right now can take up to this long to appear in a tab
 * that is ALREADY open. The admin's own tab is unaffected — ManageJobs calls
 * clearJobsCache() after every write. Lower this number if you post frequently
 * and want faster propagation to live sessions.
 */
const TTL = 15 * 60 * 1000; // 15 minutes

/** All jobs (newest first), cached for 15 min and persisted for this tab. */
export async function getJobs(force = false): Promise<Job[]> {
  if (!force) {
    const cached = cacheGet<Job[]>(JOBS_KEY, TTL);
    if (cached) return cached;
  }
  const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const list: Job[] = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Job) }));
  // persist=true: this is the one payload big enough to be worth surviving a
  // refresh, and the only one whose read cost scales with the content.
  cacheSet(JOBS_KEY, list, true);
  return list;
}

/** A single job. Reuses the cached jobs list if present (zero reads), else fetches it. */
export async function getJob(id: string): Promise<Job | null> {
  const cached = cacheGet<Job[]>(JOBS_KEY, TTL);
  if (cached) {
    const found = cached.find((j) => j.id === id);
    if (found) return found;
  }
  const snap = await getDoc(doc(db, 'jobs', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Job) } : null;
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