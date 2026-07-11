import { UserProfile } from '../types';

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
 * The one function that decides portal access.
 * Access is granted if: staff, OR admin-granted free access, OR active paid subscription.
 * Expiry is checked here at read time, so access lapses automatically.
 */
export function hasPortalAccess(user: UserProfile | null): boolean {
  if (!user) return false;
  if (isStaff(user)) return true;
  if (user.freeAccess === true) return true;
  return hasActivePaidSubscription(user);
}