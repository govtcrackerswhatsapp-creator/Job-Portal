/**
 * The paywall, moved to the server.
 *
 * Firestore has no field-level read rules, so as long as a browser can read the
 * jobs collection it holds examDetails and studyMaterial for every listing —
 * the gate in JobDetails was a UI redirect, never a boundary. This module is
 * what makes it real: /api/jobs decides entitlement here and strips the paid
 * fields before the response is ever serialised.
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
 *
 * WIDENED. Real listings produced three titles the first pass missed, each
 * restating something already on screen for free:
 *   "Current Stage"              -> the stage line, shown on the card AND at
 *                                   the top of the detail page
 *   "Application Window (closed)" -> the application dates in Key Information
 *   "Vacancies"                   -> only ever a count; the substance belongs
 *                                   in a titled breakdown, not a bare number
 * The pattern is unanchored, so any title CONTAINING one of these words is
 * dropped — "Application Window (closed)" is caught by both `application` and
 * `window`.
 */
const UNSELLABLE_TITLE = /\b(dates?|deadlines?|timeline|schedule|window|application|apply|stage|status|current|closed|open|live|eligibility|age|qualifications?|educational|salary|pay\s*scale|stipend|location|venue|work\s*mode|experience|vacanc(y|ies)|posts?\s*count|notes?|disclaimer|attention|caution|warning|important)\b/i;

/**
 * Titles too vague to want, matched against the WHOLE title.
 *
 * "Post Details and Vacancies" is not caught here — but it IS caught by
 * UNSELLABLE_TITLE above, on `vacancies`. That is the correct outcome: a
 * vacancy count is a fact, not preparation. A section that genuinely breaks
 * down posts should be titled for what it teaches — "Post-wise Reservation
 * Breakup", "Department Allocation" — which passes both patterns.
 */
const VAGUE_TITLE = /^(post|posts|detail|details|other|others|info|information|general|misc|miscellaneous|about|summary|overview|content|data|update|updates)$/i;

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