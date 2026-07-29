import { Job, JobSection, JobLinkButton, WorkMode } from '../types';
import { sanitizeHtml, isEmptyHtml, safeUrl } from './richText';
import { dateInputToTimestamp, timestampToDateInput } from './format';

/**
 * Bulk job import: parse, validate, plan, and build write payloads.
 *
 * PURE LOGIC. Nothing here touches Firestore or React — that is what makes it
 * testable and what lets JobImportPanel show a full preview before a single
 * document is written. Keep it that way.
 */

export const MAX_IMPORT_ROWS = 200;

export const WORK_MODES: WorkMode[] = ['onsite', 'hybrid', 'remote'];

export const DEFAULT_BTN_BG = '#8b2df2';
export const DEFAULT_BTN_FG = '#ffffff';

/** Every key the importer understands. Anything else is reported and ignored. */
export const KNOWN_FIELDS = [
  'refCode', 'title', 'category', 'companyName', 'companyLogo', 'location',
  'salary', 'experience', 'workMode', 'skills',
  'notificationDate', 'applicationStartDate', 'applicationEndDate', 'examDate',
  'ageLimit', 'educationalQualification', 'examDetails', 'studyMaterial',
  'customSections', 'linkButtons',
  'onHold', 'holdLabel', 'holdNote',
] as const;
export type KnownField = (typeof KNOWN_FIELDS)[number];

/**
 * Server-controlled: silently ignored if a file supplies them.
 *
 * heldAt belongs here, NOT in KNOWN_FIELDS. Export emits it so a backup is
 * complete, and without this entry every exported held row would warn "Unknown
 * field heldAt" on re-import. Listing it here makes the round trip silent while
 * keeping the hold clock un-forgeable from a file — it is stamped by
 * buildCreatePayload / buildUpdatePayload and nowhere else.
 */
export const IGNORED_FIELDS = ['id', 'createdAt', 'createdBy', 'heldAt'];

/**
 * Editorial hold fields.
 *
 * These are the ONLY fields exempt from replace mode's "absent means clear it"
 * rule. Hold is a decision made in the admin UI; a bulk content refresh that
 * happens not to mention hold must never undo it as a side effect. So both the
 * preview (diffRow) and the write (buildUpdatePayload) skip them unless the
 * file names them explicitly.
 *
 * The two must agree. An earlier version had diffRow walking every KNOWN_FIELD
 * while buildUpdatePayload used a fixed list, so the preview announced
 * "onHold: true -> (empty)" and then the write left it alone. A preview that
 * disagrees with the write is worse than either behaviour on its own, because
 * it costs you trust in the preview for the fields that DO change.
 *
 * To release jobs in bulk, say so: { "onHold": false }.
 */
const HOLD_FIELDS: KnownField[] = ['onHold', 'holdLabel', 'holdNote'];

/** Card space is finite. Longer labels are truncated with a warning, not rejected. */
export const HOLD_LABEL_MAX = 60;

const RICH_FIELDS: KnownField[] = ['ageLimit', 'educationalQualification', 'examDetails', 'studyMaterial'];

/**
 * examDate joins this list, which gets it three behaviours for free: it is
 * parsed as YYYY-MM-DD, it defaults to null rather than '' in replace mode,
 * and it renders as a readable date in the diff preview instead of a raw
 * millisecond number.
 */
const DATE_FIELDS: KnownField[] = ['notificationDate', 'applicationStartDate', 'applicationEndDate', 'examDate'];

const TEXT_FIELDS: KnownField[] = ['companyName', 'companyLogo', 'location', 'salary', 'experience'];

// ---------------------------------------------------------------- types

export interface RowIssue {
  field?: string;
  message: string;
}

export interface NormalisedRow {
  /** 1-based position in the file, for error messages. */
  index: number;
  /** Which keys the file actually specified — drives merge semantics. */
  present: Set<KnownField>;
  values: Partial<Job>;
  refCode: string;
  identity: string;
  title: string;
  errors: RowIssue[];
  warnings: RowIssue[];
}

export type RowAction = 'create' | 'update' | 'error' | 'not-owner' | 'superseded';

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface PlannedRow extends NormalisedRow {
  action: RowAction;
  targetId?: string;
  targetTitle?: string;
  diffs: FieldDiff[];
  nearMatch?: { title: string; refCode: string };
  /**
   * Was the matched job ALREADY on hold? Set by planImport on 'update' rows.
   *
   * Exists so buildUpdatePayload can tell a NEW hold from a re-stated one and
   * only stamp heldAt on the false->true transition. Without it, exporting held
   * jobs and re-importing them (the file still says onHold: true) would reset
   * every hold clock to zero and destroy the "held 47 days ago" ageing that is
   * the whole reason heldAt exists.
   */
  targetWasHeld?: boolean;
}

export interface ImportPlan {
  rows: PlannedRow[];
  counts: { create: number; update: number; error: number; notOwner: number; superseded: number };
}

export interface ParseResult {
  rows: Record<string, unknown>[];
  warnings: string[];
  error?: string;
}

// ---------------------------------------------------------------- identity

export function slugify(input: string): string {
  return (input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/**
 * Fallback identity for jobs with no refCode. Includes companyName so two
 * different "Junior Engineer" postings do not overwrite one another.
 */
export function deriveRefCode(title?: string | null, category?: string | null, companyName?: string | null): string {
  const base = slugify([title || '', companyName || ''].join(' ').trim());
  if (!base) return '';
  const cat = slugify(category || '');
  return cat ? base + '-' + cat : base;
}

/**
 * The match key. Applied to BOTH file rows and jobs already in Firestore, so
 * existing jobs (which have no refCode yet) still match on re-import.
 */
export function jobIdentity(job: Pick<Job, 'refCode' | 'title' | 'category' | 'companyName'>): string {
  const explicit = slugify(job.refCode || '');
  if (explicit) return explicit;
  return deriveRefCode(job.title, job.category, job.companyName);
}

// ---------------------------------------------------------------- parsing

export function parseImportText(input: string): ParseResult {
  const warnings: string[] = [];
  let text = (input || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { rows: [], warnings, error: 'Nothing to import — paste JSON or choose a file.' };

  // Strip markdown fences an AI may have wrapped the JSON in.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    text = fenced[1].trim();
    warnings.push('Removed the markdown code fence around the JSON.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      rows: [],
      warnings,
      error: 'That is not valid JSON. ' + (e instanceof Error ? e.message : String(e)),
    };
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) list = obj.jobs;
    else return { rows: [], warnings, error: 'Expected an array of jobs, or an object with a "jobs" array.' };
  } else {
    return { rows: [], warnings, error: 'Expected an array of jobs.' };
  }

  const rows: Record<string, unknown>[] = [];
  list.forEach((r) => {
    if (r && typeof r === 'object' && !Array.isArray(r)) rows.push(r as Record<string, unknown>);
  });

  if (rows.length === 0) return { rows: [], warnings, error: 'No job entries found in that file.' };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      warnings,
      error: `That file has ${rows.length} jobs. The limit is ${MAX_IMPORT_ROWS} per import — split it into smaller files.`,
    };
  }

  return { rows, warnings };
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function normaliseHex(v: string, fallback: string): string {
  const t = (v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : fallback;
}

function parseDate(v: unknown): { value: number | null; error?: string } {
  const s = asString(v).trim();
  if (!s) return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { value: null, error: `"${s}" is not a valid date. Use YYYY-MM-DD.` };
  }
  const ms = dateInputToTimestamp(s);
  if (ms === null) return { value: null, error: `"${s}" is not a real calendar date.` };
  return { value: ms };
}

/**
 * Strict-ish boolean. Accepts real booleans plus the spellings a spreadsheet or
 * an LLM realistically emits. Anything else is an ERROR rather than a silent
 * coercion — "maybe" quietly becoming false would release a hold without
 * telling anyone, which is precisely the failure this feature exists to stop.
 */
function parseBool(v: unknown): { value: boolean | null; error?: string } {
  if (typeof v === 'boolean') return { value: v };
  if (typeof v === 'number') {
    if (v === 1) return { value: true };
    if (v === 0) return { value: false };
    return { value: null, error: 'must be true or false (got ' + v + ').' };
  }
  const t = asString(v).trim().toLowerCase();
  if (t === 'true' || t === 'yes' || t === 'y' || t === '1') return { value: true };
  if (t === 'false' || t === 'no' || t === 'n' || t === '0' || t === '') return { value: false };
  return { value: null, error: 'must be true or false (got "' + asString(v) + '").' };
}

function parseSkills(v: unknown): { value: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let list: string[] = [];
  if (Array.isArray(v)) {
    list = v.map((x) => asString(x).trim()).filter(Boolean);
  } else {
    const s = asString(v).trim();
    if (s) {
      list = s.split(',').map((x) => x.trim()).filter(Boolean);
      warnings.push('skills was a string — split on commas.');
    }
  }
  if (list.length > 20) {
    warnings.push(`skills had ${list.length} entries — kept the first 20.`);
    list = list.slice(0, 20);
  }
  return { value: list, warnings };
}

function parseSections(v: unknown): { value: JobSection[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const out: JobSection[] = [];
  if (v === null || v === undefined || v === '') return { value: out, errors, warnings };
  if (!Array.isArray(v)) {
    errors.push('customSections must be an array of { title, content } objects.');
    return { value: out, errors, warnings };
  }
  v.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`customSections[${i}] was not an object and was skipped.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const title = asString(o.title).trim();
    const content = sanitizeHtml(asString(o.content));
    if (!title && isEmptyHtml(content)) {
      warnings.push(`customSections[${i}] was empty and was skipped.`);
      return;
    }
    out.push({ title, content });
  });
  return { value: out, errors, warnings };
}

function parseButtons(v: unknown): { value: JobLinkButton[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const out: JobLinkButton[] = [];
  if (v === null || v === undefined || v === '') return { value: out, errors, warnings };
  if (!Array.isArray(v)) {
    errors.push('linkButtons must be an array of { text, url } objects.');
    return { value: out, errors, warnings };
  }
  v.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`linkButtons[${i}] was not an object and was skipped.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const text = asString(o.text).trim();
    const rawUrl = asString(o.url).trim();
    if (!text && !rawUrl) {
      warnings.push(`linkButtons[${i}] was empty and was skipped.`);
      return;
    }
    if (!text) {
      warnings.push(`linkButtons[${i}] had no text and was skipped.`);
      return;
    }
    const url = safeUrl(rawUrl);
    if (!url) {
      warnings.push(`linkButtons[${i}] ("${text}") had an unusable URL and was skipped. Use https://, mailto: or tel:.`);
      return;
    }
    out.push({
      text,
      url,
      bgColor: normaliseHex(asString(o.bgColor), DEFAULT_BTN_BG),
      textColor: normaliseHex(asString(o.textColor), DEFAULT_BTN_FG),
    });
  });
  return { value: out, errors, warnings };
}

// ---------------------------------------------------------------- normalising

export function normaliseRow(
  raw: Record<string, unknown>,
  index: number,
  categoryIds?: string[],
): NormalisedRow {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const present = new Set<KnownField>();
  const values: Partial<Job> = {};
  const bag = values as Record<string, unknown>;

  const known = new Set<string>(KNOWN_FIELDS as readonly string[]);
  Object.keys(raw).forEach((k) => {
    if (known.has(k) || IGNORED_FIELDS.indexOf(k) !== -1 || k.charAt(0) === '_') return;
    warnings.push({ field: k, message: 'Unknown field "' + k + '" was ignored.' });
  });

  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);

  if (has('title')) {
    const t = asString(raw.title).trim();
    if (!t) errors.push({ field: 'title', message: 'title is empty.' });
    else { present.add('title'); values.title = t; }
  }

  if (has('category')) {
    const c = asString(raw.category).trim().toLowerCase();
    if (c) {
      const haveList = Array.isArray(categoryIds) && categoryIds.length > 0;
      if (!haveList) {
        // Fail open: rejecting every row because the list could not be read
        // would be worse than accepting a possibly-wrong id.
        present.add('category');
        values.category = c;
        warnings.push({
          field: 'category',
          message: 'Category list unavailable — "' + c + '" was accepted without checking.',
        });
      } else if (categoryIds.indexOf(c) !== -1) {
        present.add('category');
        values.category = c;
      } else {
        errors.push({
          field: 'category',
          message: '"' + c + '" is not a category. Use one of: ' + categoryIds.join(', ') + '.',
        });
      }
    } else {
      errors.push({ field: 'category', message: 'category is empty.' });
    }
  }

  TEXT_FIELDS.forEach((f) => {
    if (!has(f)) return;
    present.add(f);
    bag[f] = asString(raw[f]).trim();
  });

  RICH_FIELDS.forEach((f) => {
    if (!has(f)) return;
    const clean = sanitizeHtml(asString(raw[f]));
    present.add(f);
    bag[f] = isEmptyHtml(clean) ? '' : clean;
  });

  if (has('workMode')) {
    const w = asString(raw.workMode).trim().toLowerCase();
    if (!w) { present.add('workMode'); values.workMode = ''; }
    else if (WORK_MODES.indexOf(w as WorkMode) !== -1) { present.add('workMode'); values.workMode = w as WorkMode; }
    else {
      errors.push({
        field: 'workMode',
        message: '"' + w + '" is not a work mode. Use onsite, hybrid, remote, or leave it blank.',
      });
    }
  }

  DATE_FIELDS.forEach((f) => {
    if (!has(f)) return;
    const r = parseDate(raw[f]);
    if (r.error) { errors.push({ field: f, message: r.error }); return; }
    present.add(f);
    bag[f] = r.value;
  });

  // A date in the past is legal (you may be importing an archive), but it is
  // almost always a typo in the year, so say so.
  if (present.has('examDate') && values.examDate && values.examDate < Date.now()) {
    warnings.push({
      field: 'examDate',
      message: 'examDate is in the past — this job will import as expired. Check the year if that was not intended.',
    });
  }

  if (has('skills')) {
    const r = parseSkills(raw.skills);
    r.warnings.forEach((m) => warnings.push({ field: 'skills', message: m }));
    present.add('skills');
    values.skills = r.value;
  }

  if (has('customSections')) {
    const r = parseSections(raw.customSections);
    r.errors.forEach((m) => errors.push({ field: 'customSections', message: m }));
    r.warnings.forEach((m) => warnings.push({ field: 'customSections', message: m }));
    if (r.errors.length === 0) { present.add('customSections'); values.customSections = r.value; }
  }

  if (has('linkButtons')) {
    const r = parseButtons(raw.linkButtons);
    r.errors.forEach((m) => errors.push({ field: 'linkButtons', message: m }));
    r.warnings.forEach((m) => warnings.push({ field: 'linkButtons', message: m }));
    if (r.errors.length === 0) { present.add('linkButtons'); values.linkButtons = r.value; }
  }

  /**
   * EDITORIAL HOLD.
   *
   * Three rules, chosen so a file can never half-apply a hold:
   *
   *  1. onHold: true REQUIRES holdLabel in the same row. The label is public —
   *     it replaces the stage line on the card — so a held job without one
   *     renders a blank space. getJobStage() carries a fallback for documents
   *     edited straight in the Firebase console, but a file has no excuse.
   *     Export always emits the pair, so the round trip is unaffected.
   *
   *  2. onHold: false CLEARS the label and note too. Releasing a job while
   *     leaving "Result awaited" behind means the stale text reappears the next
   *     time that job is held.
   *
   *  3. Omitting onHold entirely changes nothing, in EITHER mode. See
   *     HOLD_FIELDS.
   */
  if (has('onHold')) {
    const r = parseBool(raw.onHold);
    if (r.error) {
      errors.push({ field: 'onHold', message: 'onHold ' + r.error });
    } else if (r.value === true) {
      const label = asString(raw.holdLabel).trim();
      if (!label) {
        errors.push({
          field: 'holdLabel',
          message: 'onHold is true but holdLabel is missing. The label is shown publicly on the job card, so it cannot be blank.',
        });
      } else {
        let clean = label;
        if (clean.length > HOLD_LABEL_MAX) {
          clean = clean.slice(0, HOLD_LABEL_MAX).trim();
          warnings.push({
            field: 'holdLabel',
            message: 'holdLabel was longer than ' + HOLD_LABEL_MAX + ' characters and was shortened to "' + clean + '".',
          });
        }
        present.add('onHold'); values.onHold = true;
        present.add('holdLabel'); values.holdLabel = clean;
        if (has('holdNote')) { present.add('holdNote'); values.holdNote = asString(raw.holdNote).trim(); }
      }
    } else {
      // Explicit release: wipe the pair as well, per rule 2.
      present.add('onHold'); values.onHold = false;
      present.add('holdLabel'); values.holdLabel = '';
      present.add('holdNote'); values.holdNote = '';
    }
  } else if (has('holdLabel') || has('holdNote')) {
    // Label/note WITHOUT onHold: treated as an edit to an existing hold. Kept
    // rather than rejected because renaming a label in bulk is a reasonable
    // thing to want. planImport warns if the target is not actually held, since
    // in that case the value is stored but has no visible effect.
    if (has('holdLabel')) {
      let clean = asString(raw.holdLabel).trim();
      if (clean.length > HOLD_LABEL_MAX) {
        clean = clean.slice(0, HOLD_LABEL_MAX).trim();
        warnings.push({ field: 'holdLabel', message: 'holdLabel was shortened to ' + HOLD_LABEL_MAX + ' characters.' });
      }
      present.add('holdLabel'); values.holdLabel = clean;
    }
    if (has('holdNote')) { present.add('holdNote'); values.holdNote = asString(raw.holdNote).trim(); }
  }

  let refCode = slugify(asString(raw.refCode));
  if (has('refCode') && asString(raw.refCode).trim() && !refCode) {
    warnings.push({ field: 'refCode', message: 'refCode contained no usable characters and was ignored.' });
  }
  if (!refCode) {
    refCode = deriveRefCode(values.title, values.category, values.companyName);
    if (refCode) {
      warnings.push({ field: 'refCode', message: 'No refCode given — derived "' + refCode + '" from title, company and category.' });
    }
  }
  if (refCode) { present.add('refCode'); values.refCode = refCode; }
  else errors.push({ message: 'Cannot identify this job — give it a refCode, or a title and category.' });

  return {
    index,
    present,
    values,
    refCode,
    identity: refCode,
    title: values.title || asString(raw.title).trim() || '(untitled)',
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------- diffing

function summarise(v: unknown, field?: string): string {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (Array.isArray(v)) {
    if (v.length === 0) return '(empty)';
    if (field === 'skills') return v.join(', ');
    return v.length + ' item' + (v.length === 1 ? '' : 's');
  }
  if (field && DATE_FIELDS.indexOf(field as KnownField) !== -1 && typeof v === 'number') {
    return timestampToDateInput(v);
  }
  const s = String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (x: unknown) => (x === undefined ? null : x);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function defaultFor(f: KnownField): unknown {
  if (DATE_FIELDS.indexOf(f) !== -1) return null;
  if (f === 'skills' || f === 'customSections' || f === 'linkButtons') return [];
  // onHold is a boolean: without this it would default to '' and write an empty
  // string into a boolean field. Reachable only if HOLD_FIELDS ever stops being
  // exempt from replace mode, but wrong is wrong.
  if (f === 'onHold') return false;
  return '';
}

function diffRow(row: PlannedRow, target: Job, replaceMode: boolean): FieldDiff[] {
  const out: FieldDiff[] = [];
  /**
   * Replace mode diffs every field, EXCEPT the hold fields — those are only
   * diffed when the file names them. This must stay in lockstep with the same
   * exemption in buildUpdatePayload: the preview and the write have to describe
   * the same operation, or the preview is lying.
   */
  const fields: KnownField[] = replaceMode
    ? (KNOWN_FIELDS as readonly KnownField[]).filter(
        (f) => HOLD_FIELDS.indexOf(f) === -1 || row.present.has(f),
      )
    : Array.from(row.present);
  const bag = row.values as Record<string, unknown>;
  const existing = target as unknown as Record<string, unknown>;

  fields.forEach((f) => {
    const after = row.present.has(f) ? bag[f] : defaultFor(f);
    const before = existing[f];
    if (sameValue(before, after)) return;
    out.push({ field: f, before: summarise(before, f), after: summarise(after, f) });
  });
  return out;
}

/**
 * Loose title match used only to WARN about a probable duplicate. It never
 * changes what gets written — the row still imports as whatever it was.
 *
 * Scored by CONTAINMENT (shared tokens / tokens in the shorter title) rather
 * than Jaccard. When an AI rewords "SSC CGL 2026 Notification" into
 * "SSC CGL 2026 Recruitment Notice" the two titles differ a lot in length, and
 * dividing by the longer one scores that pair around 0.43 — well under any
 * sane threshold, so the duplicate would slip through silently. Dividing by
 * the shorter one scores it 0.60 and catches it.
 *
 * Deliberately biased toward false positives: a spurious warning costs a
 * glance, a missed one costs a duplicate job.
 */
function findNearMatch(row: PlannedRow, existing: Job[]): Job | null {
  const t = slugify(row.values.title || '');
  if (!t) return null;

  for (let i = 0; i < existing.length; i++) {
    if (slugify(existing[i].title) === t) return existing[i];
  }

  const aSet = new Set(t.split('-').filter((x) => x.length > 2));
  if (aSet.size < 2) return null;

  let best: Job | null = null;
  let bestScore = 0;
  existing.forEach((j) => {
    const bSet = new Set(slugify(j.title).split('-').filter((x) => x.length > 2));
    if (bSet.size < 2) return;
    let inter = 0;
    bSet.forEach((x) => { if (aSet.has(x)) inter++; });
    const score = inter / Math.min(aSet.size, bSet.size);
    if (score > bestScore) { bestScore = score; best = j; }
  });
  return bestScore >= 0.55 ? best : null;
}

// ---------------------------------------------------------------- planning

export interface PlanOptions {
  uid: string;
  isAdmin: boolean;
  replaceMode: boolean;
  /**
   * Valid category ids. Supplied by JobImportPanel from categoriesData, which
   * never returns an empty list — it falls back to the four built-ins. Optional
   * here so an omitted list degrades to "accept with a warning" rather than
   * failing every row.
   */
  categoryIds?: string[];
}

export function planImport(
  rawRows: Record<string, unknown>[],
  existing: Job[],
  opts: PlanOptions,
): ImportPlan {
  const rows: PlannedRow[] = rawRows.map((r, i) => {
    const n = normaliseRow(r, i + 1, opts.categoryIds);
    return { ...n, action: 'create' as RowAction, diffs: [] as FieldDiff[] };
  });

  const byIdentity = new Map<string, Job[]>();
  existing.forEach((j) => {
    const key = jobIdentity(j);
    if (!key) return;
    const arr = byIdentity.get(key);
    if (arr) arr.push(j);
    else byIdentity.set(key, [j]);
  });

  // Within one file the LAST entry for an identity wins.
  const lastIndexFor = new Map<string, number>();
  rows.forEach((r, i) => { if (r.identity) lastIndexFor.set(r.identity, i); });

  rows.forEach((row, i) => {
    if (row.errors.length > 0) { row.action = 'error'; return; }

    if (row.identity && lastIndexFor.get(row.identity) !== i) {
      row.action = 'superseded';
      row.warnings.push({ message: 'A later entry in this file has the same reference and will be used instead.' });
      return;
    }

    if (opts.replaceMode && (!row.present.has('title') || !row.present.has('category'))) {
      row.action = 'error';
      row.errors.push({ message: 'Replace mode needs both title and category on every entry.' });
      return;
    }

    const matches = byIdentity.get(row.identity) || [];

    if (matches.length > 1) {
      row.action = 'error';
      row.errors.push({
        message: matches.length + ' existing jobs share the reference "' + row.identity +
                 '". Resolve those duplicates in your job list first.',
      });
      return;
    }

    if (matches.length === 0) {
      const missing: string[] = [];
      if (!row.present.has('title')) missing.push('title');
      if (!row.present.has('category')) missing.push('category');
      if (missing.length > 0) {
        row.action = 'error';
        row.errors.push({ message: 'New jobs need ' + missing.join(' and ') + '.' });
        return;
      }
      row.action = 'create';
      const near = findNearMatch(row, existing);
      if (near) {
        row.nearMatch = { title: near.title, refCode: jobIdentity(near) };
        row.warnings.push({
          message: 'Looks similar to the existing job "' + near.title +
                   '" but the reference differs — this will be added as a NEW job.',
        });
      }
      return;
    }

    const target = matches[0];
    if (!opts.isAdmin && target.createdBy !== opts.uid) {
      row.action = 'not-owner';
      row.targetId = target.id;
      row.targetTitle = target.title;
      row.warnings.push({ message: 'Created by someone else — you can only update your own jobs.' });
      return;
    }

    row.action = 'update';
    row.targetId = target.id;
    row.targetTitle = target.title;
    // Lets buildUpdatePayload tell a NEW hold from a re-stated one, so heldAt is
    // stamped only on the false->true transition and a round-tripped export does
    // not reset every hold clock.
    row.targetWasHeld = target.onHold === true;
    // A label with no onHold, on a job that is not held: stored, but invisible
    // until someone holds the job. Worth saying so — silence here reads as
    // "the label was applied".
    if (!row.present.has('onHold') && (row.present.has('holdLabel') || row.present.has('holdNote')) && !row.targetWasHeld) {
      row.warnings.push({
        field: 'holdLabel',
        message: 'This job is not on hold, so the hold label/note will be saved but not shown. Add "onHold": true to actually hold it.',
      });
    }
    row.diffs = diffRow(row, target, opts.replaceMode);
  });

  return {
    rows,
    counts: {
      create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length,
      error: rows.filter((r) => r.action === 'error').length,
      notOwner: rows.filter((r) => r.action === 'not-owner').length,
      superseded: rows.filter((r) => r.action === 'superseded').length,
    },
  };
}

// ---------------------------------------------------------------- payloads

/**
 * A brand new job document. All required fields are always present.
 *
 * @param fallbackCategory Used only if the row somehow reaches here with no
 *   category. planImport already rejects such rows, so this is defensive. It
 *   is a PARAMETER rather than a hardcoded 'government' because that id can
 *   now be renamed or disabled — the caller passes the first active category.
 */
export function buildCreatePayload(
  row: PlannedRow,
  uid: string,
  fallbackCategory = '',
): Record<string, unknown> {
  const v = row.values;
  return {
    refCode: row.refCode,
    title: v.title || '',
    category: v.category || fallbackCategory,
    ageLimit: v.ageLimit ?? '',
    educationalQualification: v.educationalQualification ?? '',
    examDetails: v.examDetails ?? '',
    studyMaterial: v.studyMaterial ?? '',
    notificationDate: v.notificationDate ?? null,
    applicationStartDate: v.applicationStartDate ?? null,
    applicationEndDate: v.applicationEndDate ?? null,
    examDate: v.examDate ?? null,
    customSections: v.customSections ?? [],
    linkButtons: v.linkButtons ?? [],
    companyName: v.companyName ?? '',
    companyLogo: v.companyLogo ?? '',
    salary: v.salary ?? '',
    experience: v.experience ?? '',
    location: v.location ?? '',
    workMode: v.workMode ?? '',
    skills: v.skills ?? [],
    // Hold on a brand new job is unusual but legal — a batch restored from an
    // export can legitimately contain held listings. heldAt is stamped here and
    // never read from the file (it is in IGNORED_FIELDS).
    onHold: v.onHold === true,
    holdLabel: v.onHold === true ? (v.holdLabel ?? '') : '',
    holdNote: v.onHold === true ? (v.holdNote ?? '') : '',
    heldAt: v.onHold === true ? Date.now() : null,
    createdAt: Date.now(),
    createdBy: uid,
  };
}

/**
 * Stamp heldAt / clear the hold fields consistently on an update.
 *
 * Mutates `out` in place and is called from BOTH modes, so hold behaves
 * identically whichever one you are in — the only field group for which that is
 * true, and deliberately so.
 *
 *  - file omits onHold        -> every hold key removed from the payload, so the
 *                                stored value survives untouched
 *  - onHold: true, was NOT held -> new hold, stamp heldAt now
 *  - onHold: true, WAS held     -> re-stated, leave heldAt alone so the clock keeps running
 *  - onHold: false              -> release: clear the pair and null the clock
 */
function applyHoldToUpdate(out: Record<string, unknown>, row: PlannedRow): void {
  if (!row.present.has('onHold')) {
    // Silent on hold state: never write it, never clear the clock. But a file
    // MAY still edit the label or note on its own (renaming holds in bulk), so
    // only drop the keys the file did not actually supply.
    delete out.onHold;
    delete out.heldAt;
    if (!row.present.has('holdLabel')) delete out.holdLabel;
    if (!row.present.has('holdNote')) delete out.holdNote;
    return;
  }
  const holding = row.values.onHold === true;
  out.onHold = holding;
  out.holdLabel = holding ? (row.values.holdLabel ?? '') : '';
  out.holdNote = holding ? (row.values.holdNote ?? '') : '';
  if (!holding) out.heldAt = null;
  else if (row.targetWasHeld) delete out.heldAt;
  else out.heldAt = Date.now();
}

/**
 * Merge mode: only keys the file actually supplied, so an omitted field keeps
 * its stored value. Replace mode: the full document.
 * createdAt / createdBy / id are never written on update.
 *
 * HOLD IS EXEMPT FROM REPLACE MODE. Replace mode otherwise means "absent =
 * clear it", but a bulk content refresh must not be able to release a hold as a
 * side effect of not mentioning it. diffRow applies the same exemption, so the
 * preview and this function always describe the same write.
 */
export function buildUpdatePayload(
  row: PlannedRow,
  replaceMode: boolean,
  fallbackCategory = '',
): Record<string, unknown> {
  if (replaceMode) {
    const full = buildCreatePayload(row, '', fallbackCategory);
    delete full.createdAt;
    delete full.createdBy;
    applyHoldToUpdate(full, row);
    return full;
  }
  const out: Record<string, unknown> = {};
  const bag = row.values as Record<string, unknown>;
  row.present.forEach((f) => { out[f] = bag[f]; });
  applyHoldToUpdate(out, row);
  out.refCode = row.refCode; // always backfilled so the next import matches
  return out;
}