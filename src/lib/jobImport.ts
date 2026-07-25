import { Job, JobCategory, JobSection, JobLinkButton, WorkMode } from '../types';
import { sanitizeHtml, isEmptyHtml, safeUrl } from './richText';
import { dateInputToTimestamp, timestampToDateInput } from './format';

/**
 * Bulk job import: parsing, normalising, validating, matching and diffing.
 *
 * Pure logic only — no React, no Firestore. The panel renders what this
 * produces; jobsData.commitJobImport() performs the writes.
 *
 * Every value here goes through the SAME helpers the manual job form uses
 * (sanitizeHtml / isEmptyHtml / dateInputToTimestamp / safeUrl), so an
 * imported job is byte-identical to one typed into the form.
 */

export const MAX_IMPORT_ROWS = 200;

export const CATEGORIES: JobCategory[] = ['government', 'corporate', 'internship', 'exam'];
export const WORK_MODES: WorkMode[] = ['onsite', 'hybrid', 'remote'];

export const DEFAULT_BTN_BG = '#8b2df2';
export const DEFAULT_BTN_FG = '#ffffff';

/** Every key the importer understands. Anything else is reported and ignored. */
export const KNOWN_FIELDS = [
  'refCode', 'title', 'category', 'companyName', 'companyLogo', 'location',
  'salary', 'experience', 'workMode', 'skills',
  'notificationDate', 'applicationStartDate', 'applicationEndDate',
  'ageLimit', 'educationalQualification', 'examDetails', 'studyMaterial',
  'customSections', 'linkButtons',
] as const;
export type KnownField = (typeof KNOWN_FIELDS)[number];

/** Server-controlled: silently ignored if a file supplies them. */
export const IGNORED_FIELDS = ['id', 'createdAt', 'createdBy'];

const RICH_FIELDS: KnownField[] = ['ageLimit', 'educationalQualification', 'examDetails', 'studyMaterial'];
const DATE_FIELDS: KnownField[] = ['notificationDate', 'applicationStartDate', 'applicationEndDate'];
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

/** Lowercase, accent-stripped, hyphenated slug. Digits are kept: "2026" matters. */
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

  const fence = text.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) {
    text = fence[1].trim();
    warnings.push('Removed the surrounding ``` code fence.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (first) {
    const straightened = text
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
    try {
      parsed = JSON.parse(straightened);
      warnings.push('Curly quotes were converted to straight quotes so the file could be read — check the preview carefully.');
    } catch {
      const msg = first instanceof Error ? first.message : String(first);
      return { rows: [], warnings, error: 'That is not valid JSON. ' + msg };
    }
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) {
      list = obj.jobs;
    } else {
      list = [obj];
      warnings.push('Read the file as a single job.');
    }
  } else {
    return { rows: [], warnings, error: 'Expected a list of jobs.' };
  }

  const rows: Record<string, unknown>[] = [];
  list.forEach((r, i) => {
    if (r && typeof r === 'object' && !Array.isArray(r)) rows.push(r as Record<string, unknown>);
    else warnings.push('Entry ' + (i + 1) + ' is not a job object and was skipped.');
  });

  if (rows.length === 0) return { rows: [], warnings, error: 'No jobs found in that file.' };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [], warnings,
      error: 'That file has ' + rows.length + ' jobs. The limit is ' + MAX_IMPORT_ROWS +
             ' per import — split it into smaller files.',
    };
  }
  return { rows, warnings };
}

// ---------------------------------------------------------------- field helpers

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function normaliseHex(v: string, fallback: string): string {
  const s = v.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : fallback;
}

function parseDate(v: unknown): { value: number | null; error?: string } {
  if (v === null || v === undefined || v === '') return { value: null };
  if (typeof v === 'number' && isFinite(v)) return { value: v };
  const s = asString(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return { value: null, error: '"' + s + '" is not a date. Use YYYY-MM-DD, e.g. 2026-08-15.' };
  const ms = dateInputToTimestamp(m[1]);
  if (ms === null) return { value: null, error: '"' + s + '" is not a real calendar date.' };
  // JS rolls 2026-02-30 forward to 2026-03-02 rather than failing — catch that.
  if (timestampToDateInput(ms) !== m[1]) {
    return { value: null, error: '"' + s + '" is not a real calendar date.' };
  }
  return { value: ms };
}

function parseSkills(v: unknown): { value: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let raw: string[] = [];
  if (Array.isArray(v)) raw = v.map(asString);
  else if (typeof v === 'string') raw = v.split(',');
  else if (v === null || v === undefined) raw = [];
  else warnings.push('skills should be a list of strings — value ignored.');

  const out: string[] = [];
  const seen = new Set<string>();
  raw.map((s) => s.trim()).filter(Boolean).forEach((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  });
  return { value: out, warnings };
}

function parseSections(v: unknown): { value: JobSection[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (v === null || v === undefined) return { value: [], errors, warnings };
  if (!Array.isArray(v)) {
    errors.push('customSections must be a list.');
    return { value: [], errors, warnings };
  }
  const out: JobSection[] = [];
  v.forEach((item, i) => {
    const label = 'Section ' + (i + 1);
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(label + ' is not an object and was skipped.');
      return;
    }
    const o = item as Record<string, unknown>;
    const title = asString(o.title).trim();
    const rawContent = asString(o.content);
    const content = isEmptyHtml(rawContent) ? '' : sanitizeHtml(rawContent);
    // Mirrors handleSave: a section survives on title OR content.
    if (!title && !content) {
      warnings.push(label + ' has no title and no content — dropped.');
      return;
    }
    out.push({ title, content });
  });
  return { value: out, errors, warnings };
}

function parseButtons(v: unknown): { value: JobLinkButton[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (v === null || v === undefined) return { value: [], errors, warnings };
  if (!Array.isArray(v)) {
    errors.push('linkButtons must be a list.');
    return { value: [], errors, warnings };
  }
  const out: JobLinkButton[] = [];
  v.forEach((item, i) => {
    const label = 'Button ' + (i + 1);
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(label + ' is not an object and was skipped.');
      return;
    }
    const o = item as Record<string, unknown>;
    const text = asString(o.text).trim();
    const rawUrl = asString(o.url).trim();
    if (!text && !rawUrl) { warnings.push(label + ' is empty — dropped.'); return; }
    if (!text) { warnings.push(label + ' has a link but no button text — dropped.'); return; }
    if (!rawUrl) { warnings.push(label + ' ("' + text + '") has no URL — dropped.'); return; }

    const url = safeUrl(rawUrl);
    if (!url) {
      warnings.push(label + ' ("' + text + '") has an unusable URL "' + rawUrl +
                    '" — dropped. Use https://, mailto: or tel:.');
      return;
    }
    if (url !== rawUrl) {
      warnings.push(label + ' ("' + text + '") URL corrected to ' + url + '.');
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

// ---------------------------------------------------------------- normalise

export function normaliseRow(raw: Record<string, unknown>, index: number): NormalisedRow {
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
      if ((CATEGORIES as string[]).indexOf(c) !== -1) {
        present.add('category');
        values.category = c as JobCategory;
      } else {
        errors.push({
          field: 'category',
          message: 'category "' + asString(raw.category) + '" is not valid. Use one of: ' + CATEGORIES.join(', ') + '.',
        });
      }
    }
  }

  if (has('workMode')) {
    const w = asString(raw.workMode).trim().toLowerCase();
    if (!w) { present.add('workMode'); values.workMode = ''; }
    else if ((WORK_MODES as string[]).indexOf(w) !== -1) { present.add('workMode'); values.workMode = w as WorkMode; }
    else {
      errors.push({
        field: 'workMode',
        message: 'workMode "' + asString(raw.workMode) + '" is not valid. Use onsite, hybrid, remote, or leave it empty.',
      });
    }
  }

  TEXT_FIELDS.forEach((f) => {
    if (!has(f)) return;
    const v = asString(raw[f]).trim();
    if (f === 'companyLogo' && v && !/^https?:\/\//i.test(v)) {
      warnings.push({ field: f, message: 'companyLogo "' + v + '" is not an http(s) URL — cleared, the letter tile will be used.' });
      present.add(f);
      bag[f] = '';
      return;
    }
    present.add(f);
    bag[f] = v;
  });

  RICH_FIELDS.forEach((f) => {
    if (!has(f)) return;
    const rawV = asString(raw[f]);
    present.add(f);
    bag[f] = isEmptyHtml(rawV) ? '' : sanitizeHtml(rawV);
  });

  DATE_FIELDS.forEach((f) => {
    if (!has(f)) return;
    const r = parseDate(raw[f]);
    if (r.error) { errors.push({ field: f, message: f + ': ' + r.error }); return; }
    present.add(f);
    bag[f] = r.value;
  });

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
    if (v.length === 0) return '(none)';
    if (typeof v[0] === 'string') return (v as string[]).join(', ');
    return v.length + (v.length === 1 ? ' item' : ' items');
  }
  if (typeof v === 'number') {
    if (field && DATE_FIELDS.indexOf(field as KnownField) !== -1) return timestampToDateInput(v) || String(v);
    return String(v);
  }
  const s = String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '(empty)';
  return s.length > 70 ? s.slice(0, 70) + '…' : s;
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (x: unknown) => (x === undefined ? null : x);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function defaultFor(f: KnownField): unknown {
  if (DATE_FIELDS.indexOf(f) !== -1) return null;
  if (f === 'skills' || f === 'customSections' || f === 'linkButtons') return [];
  return '';
}

function diffRow(row: PlannedRow, target: Job, replaceMode: boolean): FieldDiff[] {
  const out: FieldDiff[] = [];
  const fields: KnownField[] = replaceMode
    ? (KNOWN_FIELDS as readonly KnownField[]).slice()
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
}

export function planImport(
  rawRows: Record<string, unknown>[],
  existing: Job[],
  opts: PlanOptions,
): ImportPlan {
  const rows: PlannedRow[] = rawRows.map((r, i) => {
    const n = normaliseRow(r, i + 1);
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

/** A brand new job document. All required fields are always present. */
export function buildCreatePayload(row: PlannedRow, uid: string): Record<string, unknown> {
  const v = row.values;
  return {
    refCode: row.refCode,
    title: v.title || '',
    category: (v.category || 'government') as JobCategory,
    ageLimit: v.ageLimit ?? '',
    educationalQualification: v.educationalQualification ?? '',
    examDetails: v.examDetails ?? '',
    studyMaterial: v.studyMaterial ?? '',
    notificationDate: v.notificationDate ?? null,
    applicationStartDate: v.applicationStartDate ?? null,
    applicationEndDate: v.applicationEndDate ?? null,
    customSections: v.customSections ?? [],
    linkButtons: v.linkButtons ?? [],
    companyName: v.companyName ?? '',
    companyLogo: v.companyLogo ?? '',
    salary: v.salary ?? '',
    experience: v.experience ?? '',
    location: v.location ?? '',
    workMode: v.workMode ?? '',
    skills: v.skills ?? [],
    createdAt: Date.now(),
    createdBy: uid,
  };
}

/**
 * Merge mode: only keys the file actually supplied, so an omitted field keeps
 * its stored value. Replace mode: the full document.
 * createdAt / createdBy / id are never written on update.
 */
export function buildUpdatePayload(row: PlannedRow, replaceMode: boolean): Record<string, unknown> {
  if (replaceMode) {
    const full = buildCreatePayload(row, '');
    delete full.createdAt;
    delete full.createdBy;
    return full;
  }
  const out: Record<string, unknown> = {};
  const bag = row.values as Record<string, unknown>;
  row.present.forEach((f) => { out[f] = bag[f]; });
  out.refCode = row.refCode; // always backfilled so the next import matches
  return out;
}