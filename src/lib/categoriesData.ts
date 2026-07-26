import { db } from './firebase';
import { collection, getDocs, setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Category } from '../types';
import { cacheGet, cacheSet, cacheClear } from './cache';

/**
 * Job categories — the editable replacement for the old hardcoded four.
 *
 * IDENTITY: a category's Firestore document id is what every job stores, and it
 * NEVER changes. The label on the document is what gets displayed and may be
 * renamed freely. This is the same discipline PlanTier.id already uses for
 * billing periods, and it is what makes "rename a category" safe — renaming
 * touches one document instead of every job that referenced the old name.
 *
 * COLOUR is a hex string, not a Tailwind class. Tailwind v4 only ships classes
 * it can see in the source at build time, so a class name assembled at runtime
 * from Firestore would silently render unstyled. Badges use inline styles,
 * exactly like JobLinkButton and SocialLink already do.
 *
 * SAFETY: this module NEVER returns an empty list. If the collection has not
 * been seeded yet, or the read fails, it falls back to the four built-ins. A
 * blank category list would make the job form unusable and empty the dashboard
 * filter, so failing soft matters more here than reporting the error upward.
 */

const KEY = 'categories';
const TTL = 3 * 60 * 1000; // 3 minutes, matching plans and social links

/**
 * The original four, with their EXACT historical ids.
 *
 * These ids are load-bearing: all 67 existing jobs store one of these four
 * strings. Seeding with any other id would orphan every job in the database,
 * so do not "tidy" them.
 *
 * The colours are the hex equivalents of the Tailwind shades the old
 * categoryBadgeClass() used (emerald-700, blue-700, amber-700, indigo-700), so
 * badges look identical before and after this change.
 */
export const BUILTIN_CATEGORIES: Category[] = [
  { id: 'government', label: 'Government', color: '#047857', order: 0, active: true },
  { id: 'corporate', label: 'Corporate', color: '#1d4ed8', order: 1, active: true },
  { id: 'internship', label: 'Internship', color: '#b45309', order: 2, active: true },
  { id: 'exam', label: 'Exam', color: '#4338ca', order: 3, active: true },
];

/**
 * True when the list handed back is the built-in fallback rather than real
 * documents. Reference equality works because the fallback is a module
 * constant and the cache stores it by reference. The admin panel uses this to
 * decide whether to offer the "Create default categories" action.
 */
export function isBuiltinFallback(list: Category[]): boolean {
  return list === BUILTIN_CATEGORIES;
}

function sortCategories(list: Category[]): Category[] {
  return list.sort((a, b) => {
    const byOrder = (a.order ?? 0) - (b.order ?? 0);
    if (byOrder !== 0) return byOrder;
    return a.label.localeCompare(b.label);
  });
}

/**
 * All categories including inactive ones, sorted. Cached for 3 minutes.
 * Pass force=true to bypass the cache (the admin editing view does).
 */
export async function getCategories(force = false): Promise<Category[]> {
  if (!force) {
    const cached = cacheGet<Category[]>(KEY, TTL);
    if (cached) return cached;
  }
  try {
    const snap = await getDocs(collection(db, 'categories'));
    const list: Category[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Category, 'id'>) }));

    // Not seeded yet — hand back the built-ins so the job form and the
    // dashboard filter keep working in the gap between deploying the rules
    // and creating the documents.
    if (list.length === 0) {
      cacheSet(KEY, BUILTIN_CATEGORIES);
      return BUILTIN_CATEGORIES;
    }

    sortCategories(list);
    cacheSet(KEY, list);
    return list;
  } catch (e) {
    console.error('Failed to load categories, using built-in defaults.', e);
    return BUILTIN_CATEGORIES;
  }
}

/**
 * Only categories that are active — what the job form offers.
 *
 * Deliberately NOT what the dashboard filter uses. A disabled category may
 * still hold jobs, and those jobs must stay filterable; disabling only stops
 * anything NEW from landing there.
 */
export async function getActiveCategories(force = false): Promise<Category[]> {
  const all = await getCategories(force);
  const active = all.filter((c) => c.active);
  // Never hand back nothing — if every category has been disabled, the form
  // would have no options at all and no job could be created.
  return active.length > 0 ? active : all;
}

/** Clear the cache — call after any category is created, edited or deleted. */
export function clearCategoriesCache(): void {
  cacheClear(KEY);
}

/** Find one category by the id stored on a job. */
export function findCategory(list: Category[], id: string): Category | undefined {
  return list.find((c) => c.id === id);
}

/**
 * Display name for a category id.
 *
 * Falls back to prettifying the raw id so a job pointing at a deleted category
 * still renders something readable ("some-old-id" -> "Some Old Id") instead of
 * a blank badge. Deletion is blocked while jobs reference a category, so this
 * should only ever fire after a manual edit in the Firebase console.
 */
export function labelForCategory(list: Category[], id: string): string {
  const found = findCategory(list, id);
  if (found) return found.label;
  if (!id) return 'Uncategorised';
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Badge colour for a category id. Falls back to the brand purple. */
export function colorForCategory(list: Category[], id: string): string {
  return findCategory(list, id)?.color || '#8b2df2';
}

/**
 * Lowercase hyphenated id from a label. Kept local rather than importing
 * slugify from jobImport, because jobImport must stay free of Firestore
 * imports and importing it here would create a cycle once the importer takes
 * the category list for validation.
 */
export function slugifyCategoryId(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Create a category. The id is derived from the label once, at creation, and
 * is then permanent — later renames change only the label.
 *
 * Returns the id that was actually used, which may carry a numeric suffix if
 * the slug was already taken.
 */
export async function createCategory(label: string, color: string): Promise<string> {
  const base = slugifyCategoryId(label) || 'category';
  const existing = await getCategories(true);
  const taken = new Set(existing.map((c) => c.id));

  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }

  const order = existing.length > 0 ? Math.max(...existing.map((c) => c.order ?? 0)) + 1 : 0;

  // setDoc, not addDoc: the id is meaningful and must be controlled.
  await setDoc(doc(db, 'categories', id), { label: label.trim(), color, order, active: true });
  clearCategoriesCache();
  return id;
}

/** Update a category's label, colour, order or active flag. The id is never touched. */
export async function updateCategory(id: string, data: Partial<Omit<Category, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'categories', id), data as never);
  clearCategoriesCache();
}

/**
 * Delete a category outright.
 *
 * The caller MUST confirm no jobs still reference this id — a job pointing at
 * a missing category keeps a readable badge but disappears from the dashboard
 * filter, which is silent data loss. CategorySettings blocks the action while
 * the count is above zero and offers reassignment instead.
 */
export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, 'categories', id));
  clearCategoriesCache();
}

/**
 * Write the four built-ins as real documents, using their exact historical ids.
 *
 * Safe to run more than once: setDoc overwrites by id, so a second run restores
 * the defaults rather than creating duplicates. It will overwrite a renamed
 * built-in, which is the intended "reset to defaults" behaviour.
 */
export async function seedBuiltinCategories(): Promise<void> {
  for (const c of BUILTIN_CATEGORIES) {
    const { id, ...data } = c;
    await setDoc(doc(db, 'categories', id as string), data);
  }
  clearCategoriesCache();
}