import { Job, UserProfile } from '../types';

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

/**
 * How much real prose a rich-text field carries, tags and entities removed.
 *
 * Presence alone is not enough to justify a paywall: an examDetails of
 * "<p>Written test.</p>" is technically non-empty and worth nothing. Measuring
 * the text is what separates a researched exam pattern from a placeholder.
 */
function textLength(html?: string | null): number {
  if (!html) return 0;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * Combined characters of exam details plus study material a listing needs
 * before it is worth charging for. Roughly two sentences.
 *
 * TUNE THIS if the split comes out wrong. Raising it frees more listings,
 * lowering it locks more. Erring low is the safer direction — a thin listing
 * behind a paywall costs more trust than a good listing given away.
 */
const MIN_DEPTH_CHARS = 120;

/**
 * Does this listing hold enough researched content to sit behind the paywall?
 *
 * ONLY examDetails and studyMaterial count. Those are the two fields that
 * cannot be filled in without doing genuine work — reading the notification,
 * working out the pattern, gathering resources. Everything else on a job is a
 * fact printed on the official advertisement:
 *
 *   - customSections can be as thin as "05 posts", so they are not a signal.
 *   - linkButtons are a commodity; anyone can find the apply page.
 *
 * Both still APPEAR in the locked panel once a job qualifies. They just do not
 * get a vote on whether the lock exists at all.
 */
function hasResearchedDepth(job: Job): boolean {
  return textLength(job.examDetails) + textLength(job.studyMaterial) >= MIN_DEPTH_CHARS;
}

/**
 * Is this listing behind the paywall?
 *
 * The lock mirrors the content rather than being a switch someone remembers to
 * flip. A listing you spent hours assembling earns one; a listing you typed out
 * from a careers page does not.
 *
 * That asymmetry is the whole point. If a thin listing were locked, a
 * subscriber who opens it finds a salary and an apply link they could have
 * found themselves — and then doubts every other listing they paid for. Left
 * free, the same listing does useful work: it brings people in, shows the
 * listings are accurate, and puts an upgrade prompt in front of someone who now
 * trusts the site.
 *
 * An explicit accessTier overrides all of it, for the cases where a human
 * disagrees with the rule.
 */
export function isPremiumJob(job: Job | null | undefined): boolean {
  if (!job) return false;
  if (job.accessTier === 'paid') return true;
  if (job.accessTier === 'free') return false;
  return hasResearchedDepth(job);
}

/**
 * Should this user see a lock on this listing?
 *
 * Used by BOTH the card button and the detail page, so the two can never
 * disagree — previously the card promised a lock on every job while the detail
 * page showed a panel only when there was something to show.
 */
export function shouldLockJob(job: Job | null | undefined, user: UserProfile | null): boolean {
  if (hasPortalAccess(user)) return false;
  return isPremiumJob(job);
}