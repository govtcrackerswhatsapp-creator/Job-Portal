/**
 * The only way a browser gets job data.
 *
 * Firestore cannot gate individual fields, so as long as clients could read the
 * jobs collection directly they held examDetails and studyMaterial for every
 * listing regardless of what the UI showed. This endpoint replaces that read:
 * it works out entitlement from the caller's Firebase token and the server's
 * own view of their subscription, and strips the paid fields before responding.
 *
 * Once the matching Firestore rule ships (jobs become staff-read-only), this is
 * the boundary rather than a suggestion.
 *
 *   GET /api/jobs                -> every job, newest first
 *   GET /api/jobs?id=abc123      -> that one job (still an array, 0 or 1 long)
 *   GET /api/jobs?fresh=1        -> skip the server cache
 *
 * Authorization: Bearer <firebase id token>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, adminAuth } from './_lib/grant.js';
import { gateJob } from './_lib/jobGate.js';
import type { GateJob } from './_lib/jobGate.js';

/**
 * Jobs held in the warm container, shared across every caller.
 *
 * This is the read reduction that direct-from-Firestore could never give you:
 * a hundred visitors in the same minute cost one collection read instead of a
 * hundred. Raw documents are cached and gating runs per request, so one user's
 * entitlement can never leak into another's response.
 */
let jobsCache: { at: number; docs: GateJob[] } | null = null;
const CACHE_MS = 60 * 1000;

interface Access {
  uid: string;
  hasAccess: boolean;
  isStaff: boolean;
}

/**
 * Who is asking, and what are they entitled to?
 *
 * Read from the user document every time rather than trusted from the client.
 * A suspended manager is treated as a plain user here, matching what
 * AuthContext does in the browser — the stored role stays 'manager' so
 * un-suspending is clean, which means the suspension has to be applied at
 * read time in both places.
 */
async function resolveAccess(req: VercelRequest): Promise<Access | null> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return null;
  }

  const snap = await db().collection('users').doc(uid).get();
  if (!snap.exists) return { uid, hasAccess: false, isStaff: false };

  const u = snap.data() as any;
  const isStaff = (u.role === 'superadmin' || u.role === 'manager') && u.suspended !== true;
  const now = Date.now();
  const paid =
    u.subscriptionStatus === 'active' &&
    typeof u.subscriptionExpiry === 'number' &&
    u.subscriptionExpiry > now;

  return { uid, hasAccess: isStaff || u.freeAccess === true || paid, isStaff };
}

async function loadJobs(skipCache: boolean): Promise<GateJob[]> {
  if (!skipCache && jobsCache && Date.now() - jobsCache.at < CACHE_MS) {
    return jobsCache.docs;
  }
  const snap = await db().collection('jobs').orderBy('createdAt', 'desc').get();
  const docs: GateJob[] = [];
  snap.forEach((d) => docs.push({ id: d.id, ...(d.data() as Record<string, unknown>) } as GateJob));
  jobsCache = { at: Date.now(), docs };
  return docs;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Responses differ per caller, so they must never be cached by a CDN or proxy.
  res.setHeader('Cache-Control', 'no-store, private');

  try {
    const access = await resolveAccess(req);
    if (!access) return res.status(401).json({ error: 'Sign in to view jobs' });

    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';

    // Staff edit jobs and must never see their own write missing. They always
    // bypass the shared cache; there are few of them, so the cost is nothing.
    const skipCache = access.isStaff || req.query.fresh === '1';

    if (id) {
      const snap = await db().collection('jobs').doc(id).get();
      if (!snap.exists) return res.status(200).json({ jobs: [] });
      const job = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as GateJob;
      return res.status(200).json({ jobs: [gateJob(job, access.hasAccess)] });
    }

    const docs = await loadJobs(skipCache);
    return res.status(200).json({ jobs: docs.map((j) => gateJob(j, access.hasAccess)) });
  } catch (error: any) {
    console.error('api/jobs error:', error?.message || error);
    return res.status(500).json({ error: 'Could not load jobs' });
  }
}