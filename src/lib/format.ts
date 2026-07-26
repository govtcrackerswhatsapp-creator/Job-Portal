import { WorkMode } from '../types';

/**
 * Presentation helpers: pure formatting, no data access.
 *
 * IMPORTANT: nothing here may import from firebase, categoriesData or any other
 * module that touches Firestore. jobImport.ts depends on this file and is
 * documented as pure logic with no Firestore, so a data import here would
 * quietly break that guarantee for the whole importer.
 *
 * That constraint is why the old categoryLabel() and categoryBadgeClass() are
 * NOT in this file. Categories are editable documents now, so resolving an id
 * to a name or a colour needs the category list — which means it needs data.
 * Those two live in categoriesData.ts as labelForCategory() and
 * colorForCategory(), both of which take the list as an argument.
 *
 * What stays here is the half that is genuinely presentational: turning a
 * colour that has already been resolved into the inline styles a badge needs.
 */

/** A badge's inline styles. Plain object rather than React's CSSProperties, to keep this file React-free. */
export interface BadgeStyle {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

/** Expand #abc to #aabbcc and strip the hash. Returns null if not parseable. */
function normaliseHex(hex: string): string | null {
  const h = (hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) return h;
  return null;
}

/** Hex plus alpha as an rgba() string. Falls back to the brand purple on bad input. */
function rgba(hex: string, alpha: number): string {
  const h = normaliseHex(hex) || '8b2df2';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Inline styles for a category badge, built from one hex colour.
 *
 * These have to be inline rather than Tailwind classes: Tailwind v4 only ships
 * classes it can see in the source at build time, so a class name assembled at
 * runtime from a Firestore value would render completely unstyled.
 *
 * The alpha values approximate the Tailwind scale the old badges used — a 50
 * shade tint behind a 700 shade text with a 200 shade border. Cards are white,
 * so the translucent background lands on the same tint as before.
 */
export function categoryBadgeStyle(color: string): BadgeStyle {
  const safe = normaliseHex(color) ? color : '#8b2df2';
  return {
    backgroundColor: rgba(safe, 0.1),
    color: safe,
    borderColor: rgba(safe, 0.28),
  };
}

/** Human-readable label for a work mode. */
export function workModeLabel(mode?: WorkMode | string | null): string {
  switch (mode) {
    case 'onsite':
      return 'On-site';
    case 'hybrid':
      return 'Hybrid';
    case 'remote':
      return 'Remote';
    default:
      return '';
  }
}

/** Format a timestamp (ms) as e.g. "12 Jul 2026". Returns '' if missing. */
export function formatDate(ms?: number | null): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Format rupees as e.g. "₹499". */
export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Convert a date-input value ("YYYY-MM-DD") to a local-midnight timestamp.
 * Shared by the job form and the bulk importer so both store dates identically.
 *
 * Note this is LOCAL midnight, not IST. A job therefore expires at a slightly
 * different instant depending on the viewer's device timezone. Pre-existing
 * behaviour, inherited by examDate, and deliberately left alone here — changing
 * it would shift every date already stored.
 */
export function dateInputToTimestamp(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value + 'T00:00:00').getTime();
  return isNaN(ms) ? null : ms;
}

/** Inverse of dateInputToTimestamp — formats a timestamp for <input type="date">. */
export function timestampToDateInput(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}