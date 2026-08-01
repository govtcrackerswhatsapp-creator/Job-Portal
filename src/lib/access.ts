import { Job, JobSection, UserProfile } from '../types';

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
 * >>> THE SWITCH <
 *
 * true  — every listing with any sellable content is locked, regardless of depth.
 * false — a listing must carry real researched depth (see MIN_DEPTH_CHARS).
 *
 * Currently true while the listings are being filled out with proper exam
 * patterns and study material. Flip to false once that work is done and the
 * paywall will start reflecting the content again — nothing else needs to
 * change, and per-job accessTier overrides keep working either way.
 */
const LOCK_EVERYTHING = true;

/**
 * How much real prose a rich-text field carries, tags and entities removed.
 */
export function richTextLength(html?: string | null): number {
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
 * before it is worth charging for. Only consulted when LOCK_EVERYTHING is false.
 */
const MIN_DEPTH_CHARS = 120;

/**
 * Titles that must never be advertised as something to buy.
 *
 * Two kinds, and both damage the sale rather than help it:
 *
 *   RESTATES FREE INFO — a paid row promising "Important Dates" sits on the
 *   same screen as the four date fields, which are free. The reader can see
 *   both at once, and the only conclusion available to them is that the
 *   paywall is padded.
 *
 *   NOT A BENEFIT — "Please Note" is a caveat. Advertising a disclaimer as
 *   part of what you get reads as hiding the small print, which is the
 *   opposite of the impression a paywall needs to make.
 */
const UNSELLABLE_TITLE = /\b(dates?|timeline|schedule|eligibility|age|qualifications?|educational|salary|pay\s*scale|location|work\s*mode|experience|notes?|disclaimer|attention|caution|warning)\b/i;

/**
 * Titles too vague to want. "Post" tells a reader nothing they can desire;
 * "Post Details and Vacancies" does, and is not caught here because the match
 * is anchored to the WHOLE title.
 */
const VAGUE_TITLE = /^(post|posts|detail|details|other|others|info|information|general|misc|miscellaneous|about|summary|overview|content|data)$/i;

/** Below this a section is a label, not a section. "05 posts" is 8 characters. */
const MIN_SECTION_CHARS = 25;

/**
 * Is this custom section worth listing as a reason to pay?
 *
 * Exported because the locked panel and the lock decision MUST agree. Filter a
 * section out of the panel but still count it when deciding to lock, and you
 * get a lock that opens onto an empty page — worse than either alone.
 *
 * NOTE: this governs ADVERTISING only. A section that fails here still renders
 * in full for a subscriber. It is their content; it just is not a sales point.
 */
export function isSellableSection(section: JobSection | null | undefined): boolean {
  if (!section) return false;
  const title = (section.title || '').trim();
  if (!title) return false;
  if (VAGUE_TITLE.test(title)) return false;
  if (UNSELLABLE_TITLE.test(title)) return false;
  return richTextLength(section.content) >= MIN_SECTION_CHARS;
}

/**
 * Is there anything genuinely worth putting behind a lock?
 *
 * The floor even in LOCK_EVERYTHING mode. A listing whose only "paid" content
 * is a restatement of its free dates has nothing to sell, and locking it would
 * show a lock on the card and then an empty panel on the page.
 */
function hasSellableContent(job: Job): boolean {
  if (richTextLength(job.examDetails) > 0) return true;
  if (richTextLength(job.studyMaterial) > 0) return true;
  if ((job.customSections || []).some(isSellableSection)) return true;
  if ((job.linkButtons || []).some((b) => b.text?.trim() && b.url?.trim())) return true;
  return false;
}

/**
 * Does this listing hold enough researched content to sit behind the paywall?
 *
 * In depth mode ONLY examDetails and studyMaterial count — the two fields that
 * cannot be filled in without doing genuine work. Everything else on a job is
 * a fact printed on the official advertisement.
 */
function hasResearchedDepth(job: Job): boolean {
  if (LOCK_EVERYTHING) return hasSellableContent(job);
  return richTextLength(job.examDetails) + richTextLength(job.studyMaterial) >= MIN_DEPTH_CHARS;
}

/**
 * Is this listing behind the paywall?
 * An explicit accessTier always wins.
 */
export function isPremiumJob(job: Job | null | undefined): boolean {
  if (!job) return false;
  if (job.accessTier === 'paid') return true;
  if (job.accessTier === 'free') return false;
  return hasResearchedDepth(job);
}

/**
 * Should this user see a lock on this listing?
 * Used by BOTH the card button and the detail page, so the two cannot disagree.
 */
export function shouldLockJob(job: Job | null | undefined, user: UserProfile | null): boolean {
  if (hasPortalAccess(user)) return false;
  return isPremiumJob(job);
}