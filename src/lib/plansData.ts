import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { SubscriptionPlan } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

const PLANS_KEY = 'plans';
const TTL = 3 * 60 * 1000; // 3 minutes

/** All plans, cached for 3 min. Pass force=true to bypass cache (admin editing view). */
export async function getPlans(force = false): Promise<SubscriptionPlan[]> {
  if (!force) {
    const cached = cacheGet<SubscriptionPlan[]>(PLANS_KEY, TTL);
    if (cached) return cached;
  }
  const snap = await getDocs(collection(db, 'plans'));
  const list: SubscriptionPlan[] = [];
  snap.forEach((d) => list.push({ id: d.id, ...(d.data() as SubscriptionPlan) }));
  cacheSet(PLANS_KEY, list);
  return list;
}

/** Clear the plans cache — call after a plan is created/edited/deleted. */
export function clearPlansCache(): void {
  cacheClear(PLANS_KEY);
}