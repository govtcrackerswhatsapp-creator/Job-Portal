/**
 * The paywall, moved to the server.
 *
 * Firestore has no field-level read rules, so as long as a browser can read the
 * jobs collection it holds examDetails and studyMaterial for every listing —
 * the gate in JobDetails was a UI redirect, never a boundary. This module is
 * what makes it real: /api/jobs decides entitlement here and strips the paid
 * fields before the response is ever serialised.
 *
 * It also replaces the client-side isPremiumJob(). The lock decision now runs
 * where a user cannot reach it.
 *
 * No imports from src/ on purpose. This is bundled into a serverless function,
 * and a stray import of anything touching React or the Firebase web SDK would
 * drag half the frontend into it.
 */

export interface GateSection {
  title?: string;
  content?: string;
}

export interface GateLinkButton {
  text?: string;
  url?: string;
}

/** Only the fields the gate reads. A real job document has many more. */
export interface GateJob {
  accessTier?: 'auto' | 'paid' | 'free';
  examDetails?: string;
  studyMaterial?: string;
  customSections?: GateSection[];
  linkButtons?: GateLinkButton[];
  [key: string]: unknown;
}

/** The four fields a free reader must never receive. */
export const PAID_FIELDS = ['examDetails', 'studyMaterial', 'customSections', 'linkButtons'] as const;

export type ContentRowKind = 'exam' | 'study' | 'section' | 'links';

/** One advertised item in the locked panel. Describes shape, never content. */
export interface ContentRow {
  kind: ContentRowKind;
  label: string;
  note: string;
}

/**
 * >>> THE SWITCH <
 *
 * true  — every listing with any sellable content is locked, regardless of depth.
 * false — a listing must carry real researched depth (see MIN_DEPTH_CHARS).
 *
 * Currently true while the listings are being filled out with proper exam
 * patterns and study material. Flip to false once that work is done.
 *
 * NOTE: this moved here from src/lib/access.ts. Changing it now requires a
 * deploy rather than just a rebuild, because it runs on the server.
 */
const LOCK_EVERYTHING = true;

/** Combined characters of exam details plus study material needed in depth mode. */
const MIN_DEPTH_CHARS = 120;

/** Below this a section is a label, not a section. "05 posts" is 8 characters. */
const MIN_SECTION_CHARS = 25;

/**
 * Titles that must never be advertised as something to buy.
 *
 * RESTATES FREE INFO — a paid row promising "Important Dates" sits on the same
 * screen as the four date fields, which are free. The reader sees both at once
 * and concludes the paywall is padded.
 *
 * NOT A BENEFIT — "Please Note" is a caveat. Advertising a disclaimer as part
 * of what you get reads as hiding the small print.
 */
const UNSELLABLE_TITLE = /\b(dates?|timeline|schedule|eligibility|age|qualifications?|educational|salary|pay\s*scale|location|work\s*mode|experience|notes?|disclaimer|attention|caution|warning)\b/i;

/** Anchored to the WHOLE title, so "Post Details and Vacancies" still passes. */
const VAGUE_TITLE = /^(post|posts|detail|details|other|others|info|information|general|misc|miscellaneous|about|summary|overview|content|data)$/i;

/** How much real prose a rich-text field carries, tags and entities removed. */
export function richTextLength(html?: unknown): number {
  if (typeof html !== 'string' || !html) return 0;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/** Mirrors safeUrl() on the client, so the advertised link count matches what renders. */
function usableLink(b: GateLinkButton | null | undefined): boolean {
  if (!b) return false;
  const text = (b.text || '').trim();
  const url = (b.url || '').trim();
  if (!text || !url) return false;
  return /^(https?:\/\/|mailto:|tel:)/i.test(url);
}

/**
 * Is this custom section worth listing as a reason to pay?
 *
 * Governs ADVERTISING only. A section failing here still renders in full for a
 * subscriber — it is their content, it just is not a sales point.
 */
export function isSellableSection(section: GateSection | null | undefined): boolean {
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
 * restates its free dates has nothing to sell, and locking it would show a lock
 * on the card and then an empty panel on the page.
 */
function hasSellableContent(job: GateJob): boolean {
  if (richTextLength(job.examDetails) > 0) return true;
  if (richTextLength(job.studyMaterial) > 0) return true;
  if ((job.customSections || []).some(isSellableSection)) return true;
  if ((job.linkButtons || []).some(usableLink)) return true;
  return false;
}

/** Is this listing behind the paywall? An explicit accessTier always wins. */
export function isPremiumJob(job: GateJob): boolean {
  if (!job) return false;
  if (job.accessTier === 'paid') return true;
  if (job.accessTier === 'free') return false;
  if (LOCK_EVERYTHING) return hasSellableContent(job);
  return richTextLength(job.examDetails) + richTextLength(job.studyMaterial) >= MIN_DEPTH_CHARS;
}

/**
 * What the locked panel advertises.
 *
 * Two rules, both protecting the sale:
 *   1. Never promise what is not there — a row appears only for content the job
 *      actually holds.
 *   2. Never sell back what is already free — sections go through
 *      isSellableSection() first.
 *
 * Computed fresh on every request rather than stored on the document, so it can
 * never drift out of step with the content it describes.
 */
export function buildContentSummary(job: GateJob): ContentRow[] {
  const rows: ContentRow[] = [];

  if (richTextLength(job.examDetails) > 0) {
    rows.push({ kind: 'exam', label: 'Exam pattern and details', note: 'Included' });
  }
  if (richTextLength(job.studyMaterial) > 0) {
    rows.push({ kind: 'study', label: 'Study material', note: 'Included' });
  }
  (job.customSections || []).filter(isSellableSection).forEach((s) => {
    rows.push({ kind: 'section', label: (s.title || '').trim(), note: 'Included' });
  });

  const links = (job.linkButtons || []).filter(usableLink).length;
  if (links > 0) {
    rows.push({
      kind: 'links',
      label: 'Official notification and apply links',
      note: `${links} ${links === 1 ? 'link' : 'links'}`,
    });
  }

  return rows;
}

/**
 * Shape a single job for one caller.
 *
 * Entitled callers get the document untouched. Everyone else gets it with the
 * four paid fields DELETED — not blanked, not nulled, deleted — plus the flags
 * the UI needs to render a lock. There is nothing left in the payload to
 * recover the paid content from.
 */
export function gateJob(job: GateJob, hasAccess: boolean): Record<string, unknown> {
  if (hasAccess) return { ...job, locked: false };

  const locked = isPremiumJob(job);
  if (!locked) return { ...job, locked: false };

  const out: Record<string, unknown> = { ...job };
  for (const f of PAID_FIELDS) delete out[f];
  out.locked = true;
  out.contentSummary = buildContentSummary(job);
  return out;
}