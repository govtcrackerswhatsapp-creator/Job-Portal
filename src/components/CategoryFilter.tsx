import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Category } from '../types';
import { categoryBadgeStyle } from '../lib/format';
import { Check, ChevronDown, X, SlidersHorizontal } from 'lucide-react';

/**
 * Multi-select category filter.
 *
 * Replaces the old horizontal chip row, which ran out of width once categories
 * became editable — four fitted, eight would not.
 *
 * SEMANTICS: an EMPTY selection means "everything". There is deliberately no
 * "All" option, because "All" plus "Government" both ticked is a nonsense state
 * a user will inevitably reach. Clearing the selection is how you get back to
 * everything.
 *
 * The panel stays open while you toggle — closing on every pick would defeat
 * the point of multi-select.
 *
 * Two presentations, one state: an anchored dropdown from md: up, and a bottom
 * sheet on phones, which is what a touch device expects and avoids the cramped
 * mis-tappable popover an anchored panel becomes at that width. Same pattern
 * Layout already uses for the sidebar and its mobile drawer.
 */

interface Props {
  categories: Category[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Job count per category id, so an empty bucket is obvious before it is picked. */
  counts?: Record<string, number>;
}

export default function CategoryFilter({ categories, selected, onChange, counts }: Props) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close the desktop dropdown on an outside click. Skipped on mobile, where
  // the sheet has its own backdrop.
  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, isMobile]);

  // Escape closes either presentation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Stop the page scrolling behind the open sheet.
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  const toggle = (id: string) => {
    onChange(selected.indexOf(id) !== -1 ? selected.filter((x) => x !== id) : selected.concat(id));
  };

  /**
   * The trigger must carry the state, or a filtered list looks like a broken
   * one — someone scrolls past the control, sees six jobs, and wonders where
   * the rest went.
   */
  const triggerLabel = (() => {
    if (selected.length === 0) return 'All categories';
    if (selected.length === 1) {
      const c = categories.find((x) => x.id === selected[0]);
      return c ? c.label : '1 category';
    }
    return `${selected.length} categories`;
  })();

  const rows = (
    <div className="py-1">
      {categories.map((c) => {
        const id = c.id || '';
        const on = selected.indexOf(id) !== -1;
        const n = counts ? counts[id] || 0 : null;
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`w-full flex items-center gap-3 px-4 text-left transition ${
              isMobile ? 'py-3.5' : 'py-2.5'
            } ${on ? 'bg-[#8b2df2]/5' : 'hover:bg-zinc-50'}`}
          >
            <span
              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                on ? 'bg-[#8b2df2] border-[#8b2df2]' : 'border-zinc-300 bg-white'
              }`}
            >
              {on && <Check className="w-3.5 h-3.5 text-white" />}
            </span>
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: categoryBadgeStyle(c.color).color }}
            />
            <span className="text-sm text-zinc-800 flex-1 min-w-0 truncate">{c.label}</span>
            {n !== null && (
              <span className={`text-xs shrink-0 ${n === 0 ? 'text-zinc-300' : 'text-zinc-400'}`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full lg:w-auto inline-flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition bg-white ${
          selected.length > 0
            ? 'border-[#8b2df2] text-[#8b2df2]'
            : 'border-zinc-200 text-zinc-600 hover:border-[#8b2df2]/40'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Desktop: anchored dropdown */}
      {open && !isMobile && (
        <div className="absolute z-40 mt-2 w-64 right-0 lg:left-0 lg:right-auto bg-white rounded-xl border border-zinc-200 shadow-lg overflow-hidden">
          <div className="max-h-80 overflow-y-auto">{rows}</div>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-zinc-100 bg-zinc-50">
            <button
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-40"
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-[#8b2df2] hover:opacity-80"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Mobile: bottom sheet, portalled so no ancestor's overflow or transform can clip it */}
      {open && isMobile && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl shadow-xl max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
              <h3 className="font-heading text-base font-semibold text-zinc-900">Filter by category</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">{rows}</div>
            <div
              className="flex items-center gap-3 px-4 py-3 border-t border-zinc-100 shrink-0"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={() => onChange([])}
                disabled={selected.length === 0}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#8b2df2] text-white text-sm font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}