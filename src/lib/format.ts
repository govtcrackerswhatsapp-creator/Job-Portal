import { JobCategory } from '../types';

/** Tailwind classes for each job category badge. */
export function categoryBadgeClass(category: JobCategory): string {
  switch (category) {
    case 'government':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'corporate':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'internship':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    default:
      return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  }
}

/** Human-readable label for a category. */
export function categoryLabel(category: JobCategory): string {
  switch (category) {
    case 'government':
      return 'Government';
    case 'corporate':
      return 'Corporate';
    case 'internship':
      return 'Internship';
    default:
      return category;
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