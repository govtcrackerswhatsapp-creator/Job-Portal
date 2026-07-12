import { db } from './firebase';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { Job } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

const JOBS_KEY = 'jobs';
const TTL = 3 * 60 * 1000; // 3 minutes

/** All jobs (newest first), cached for 3 min. Pass force=true to bypass cache. */
export async function getJobs(force = false): Promise<Job[]> {
  if (!force) {
    const cached = cacheGet<Job[]>(JOBS_KEY, TTL);
    if (cached) return cached;
  }
  const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const list: Job[] = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Job) }));
  cacheSet(JOBS_KEY, list);
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