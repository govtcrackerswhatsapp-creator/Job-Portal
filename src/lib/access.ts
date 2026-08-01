import { UserProfile } from '../types';

/**
 * USER access only.
 *
 * The job-side of the paywall used to live here too — isPremiumJob(),
 * shouldLockJob(), the sellability filters and the LOCK_EVERYTHING switch. All
 * of it moved to api/_lib/jobGate.ts.
 *
 * The reason is not tidiness. Deciding in the browser whether a listing is
 * premium means the decision runs on the same machine as the person it applies
 * to, and it can only work on data that machine already holds — which meant
 * shipping the paid content in order to decide whether to hide it. The server
 * now decides, and attaches `locked` and `contentSummary` to each job in the
 * response.
 *
 * Components no longer ask a function; they read `job.locked`.
 *
 * The functions BELOW are different. They answer "what is this user entitled
 * to", drive routing and the sidebar plan chip, and are safe in the browser
 * because they reveal nothing the user does not already know about themselves.
 * The server makes the same determination independently in api/jobs.ts, so a
 * tampered client gains nothing but a misleading badge.
 */

/** Staff always have full access. */
export function isStaff(user: UserProfile | null): boolean {
  return !!user && (user.role === 'superadmin' || user.role === 'manager');
}

/** True only for a currently-active PAID subscription (not staff, not free-access). */
export function hasActivePaidSubscription(user: UserProfile | null): boolean {
  if (!user) return false;
  return (
    user.subscriptionStatus === 'active' &&
    typeof user.subscriptionExpiry === 'number' &&
    user.subscriptionExpiry > Date.now()
  );
}

/**
 * The one function that decides portal access in the UI.
 * Access is granted if: staff, OR admin-granted free access, OR active paid subscription.
 * Expiry is checked here at read time, so access lapses automatically.
 *
 * Used for chrome — the sidebar plan label and the upgrade prompt. It does NOT
 * decide what content arrives; api/jobs.ts settles that server-side.
 */
export function hasPortalAccess(user: UserProfile | null): boolean {
  if (!user) return false;
  if (isStaff(user)) return true;
  if (user.freeAccess === true) return true;
  return hasActivePaidSubscription(user);
}