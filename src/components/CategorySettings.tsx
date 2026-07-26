import { useEffect, useMemo, useState } from 'react';
import { Category, Job } from '../types';
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  seedBuiltinCategories, isBuiltinFallback, slugifyCategoryId,
} from '../lib/categoriesData';
import { getJobs, commitJobImport, ImportOp } from '../lib/jobsData';
import { categoryBadgeStyle } from '../lib/format';
import {
  Plus, Pencil, Trash2, Check, X, Loader2, ArrowUp, ArrowDown,
  Eye, EyeOff, AlertTriangle, Tag, Sparkles,
} from 'lucide-react';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';

const PRESET_COLORS = ['#047857', '#1d4ed8', '#b45309', '#4338ca', '#8b2df2', '#be123c', '#0f766e', '#c2410c'];

interface FormState { label: string; color: string; }
const EMPTY: FormState = { label: '', color: '#8b2df2' };

export default function CategorySettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormState>({ ...EMPTY });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>({ ...EMPTY });

  // Delete requires choosing where any jobs in the category should go.
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const usingDefaults = isBuiltinFallback(categories);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      // force=true: the admin view must never read a stale cached list.
      const [cats, jobList] = await Promise.all([getCategories(true), getJobs()]);
      setCategories(cats);
      setJobs(jobList);
    } catch (e) {
      console.error('Error loading categories:', e);
      showStatus('err', 'Could not load categories.');
    } finally {
      setLoading(false);
    }
  };

  const showStatus = (type: 'ok' | 'err', msg: string) => {
    setStatus({ type, msg });
    window.setTimeout(() => setStatus(null), 5000);
  };

  /** How many jobs sit in each category id. Drives the delete guard. */
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    jobs.forEach((j) => { m[j.category] = (m[j.category] || 0) + 1; });
    return m;
  }, [jobs]);

  /** Jobs whose category id matches nothing in the list — only possible after a console edit. */
  const orphanCount = useMemo(() => {
    const known = new Set(categories.map((c) => c.id));
    return jobs.filter((j) => !known.has(j.category)).length;
  }, [jobs, categories]);

  const previewId = slugifyCategoryId(addForm.label);
  const idTaken = categories.some((c) => c.id === previewId);

  // ------------------------------------------------------------- actions

  const handleSeed = async () => {
    try {
      setActing('seed');
      await seedBuiltinCategories();
      await load();
      showStatus('ok', 'Default categories created. You can now rename or add to them.');
    } catch (e) {
      console.error('Seed error:', e);
      showStatus('err', 'Could not create the defaults — check your Firestore rules.');
    } finally {
      setActing(null);
    }
  };

  const handleAdd = async () => {
    const label = addForm.label.trim();
    if (!label) return;
    if (!previewId) { showStatus('err', 'That name has no usable characters — try letters or numbers.'); return; }
    try {
      setActing('add');
      const id = await createCategory(label, addForm.color);
      setShowAdd(false);
      setAddForm({ ...EMPTY });
      await load();
      showStatus('ok', `Category "${label}" created with id "${id}".`);
    } catch (e) {
      console.error('Create error:', e);
      showStatus('err', 'Could not create that category.');
    } finally {
      setActing(null);
    }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id || '');
    setEditForm({ label: c.label, color: c.color });
  };

  const handleSaveEdit = async (c: Category) => {
    const label = editForm.label.trim();
    if (!label || !c.id) return;
    try {
      setActing(c.id);
      // The id is never touched — only the label and colour. That is what makes
      // renaming safe: no job has to be rewritten.
      await updateCategory(c.id, { label, color: editForm.color });
      setEditingId(null);
      await load();
      showStatus('ok', 'Category updated.');
    } catch (e) {
      console.error('Update error:', e);
      showStatus('err', 'Could not save that change.');
    } finally {
      setActing(null);
    }
  };

  const handleToggleActive = async (c: Category) => {
    if (!c.id) return;
    try {
      setActing(c.id);
      await updateCategory(c.id, { active: !c.active });
      await load();
      showStatus('ok', c.active
        ? `"${c.label}" disabled — existing jobs are unaffected and stay filterable.`
        : `"${c.label}" enabled.`);
    } catch (e) {
      console.error('Toggle error:', e);
      showStatus('err', 'Could not change that category.');
    } finally {
      setActing(null);
    }
  };

  /** Swap this category's order with its neighbour and persist both. */
  const handleMove = async (index: number, dir: -1 | 1) => {
    const a = categories[index];
    const b = categories[index + dir];
    if (!a?.id || !b?.id) return;
    try {
      setActing(a.id);
      const aOrder = a.order ?? index;
      const bOrder = b.order ?? index + dir;
      await Promise.all([
        updateCategory(a.id, { order: bOrder }),
        updateCategory(b.id, { order: aOrder }),
      ]);
      await load();
    } catch (e) {
      console.error('Reorder error:', e);
      showStatus('err', 'Could not reorder.');
    } finally {
      setActing(null);
    }
  };

  const openDelete = (c: Category) => {
    setDeleteTarget(c);
    // Default the reassignment to the first other category, so the dropdown is
    // never empty when a choice is required.
    const other = categories.find((x) => x.id !== c.id);
    setReassignTo(other?.id || '');
  };

  const handleDelete = async () => {
    const c = deleteTarget;
    if (!c?.id) return;
    const n = counts[c.id] || 0;

    if (n > 0 && !reassignTo) {
      showStatus('err', 'Choose where those jobs should move first.');
      return;
    }

    try {
      setActing(c.id);

      if (n > 0) {
        // Reassign through commitJobImport: it chunks at 100, falls back to
        // per-document writes if a batch is rejected, and clears the jobs
        // cache when it finishes — all of which we would otherwise repeat here.
        const ops: ImportOp[] = jobs
          .filter((j) => j.category === c.id && j.id)
          .map((j) => ({
            kind: 'update' as const,
            id: j.id as string,
            data: { category: reassignTo },
            label: j.title,
          }));
        const outcome = await commitJobImport(ops);
        if (outcome.failures.length > 0) {
          showStatus('err', `${outcome.failures.length} job(s) could not be moved — category not deleted.`);
          setActing(null);
          return;
        }
      }

      await deleteCategory(c.id);
      setDeleteTarget(null);
      await load();
      showStatus('ok', n > 0
        ? `Deleted "${c.label}" and moved ${n} job(s).`
        : `Deleted "${c.label}".`);
    } catch (e) {
      console.error('Delete error:', e);
      showStatus('err', 'Could not delete that category.');
    } finally {
      setActing(null);
    }
  };

  // ------------------------------------------------------------- render

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>;
  }

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-zinc-900 mb-1">Job Categories</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Rename, reorder, add or retire the categories managers can post jobs into. Renaming is always safe —
        jobs store a fixed id, never the display name.
      </p>

      {usingDefaults && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800">
              These are the built-in defaults — they are not saved in the database yet, so they cannot be
              edited. Create them first and everything becomes editable. Your existing jobs are unaffected:
              the four keep their original ids.
            </p>
          </div>
          <button
            onClick={handleSeed}
            disabled={acting === 'seed'}
            className="inline-flex items-center gap-2 bg-[#8b2df2] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {acting === 'seed' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Create default categories
          </button>
        </div>
      )}

      {orphanCount > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">
            {orphanCount} job(s) point at a category that no longer exists. They still show a badge but will not
            appear under any dashboard filter. Re-import them with a valid category to fix it.
          </p>
        </div>
      )}

      {/* ---- add ---- */}
      {!usingDefaults && (
        <div className="mb-4">
          {!showAdd ? (
            <button
              onClick={() => { setShowAdd(true); setAddForm({ ...EMPTY }); }}
              className="inline-flex items-center gap-2 bg-[#8b2df2] text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Add category
            </button>
          ) : (
            <div className="border border-zinc-200 rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                  <input
                    autoFocus
                    className={inputCls}
                    value={addForm.label}
                    onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                    placeholder="e.g. Banking"
                  />
                  {addForm.label.trim() && (
                    <p className={`text-xs mt-1 ${idTaken ? 'text-red-600' : 'text-zinc-400'}`}>
                      {idTaken
                        ? `id "${previewId}" is taken — a suffix will be added.`
                        : <>id: <span className="font-mono">{previewId || '—'}</span> (permanent)</>}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Badge colour</label>
                  <ColorField value={addForm.color} onChange={(color) => setAddForm({ ...addForm, color })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!addForm.label.trim() || acting === 'add'}
                  className="inline-flex items-center gap-2 bg-[#8b2df2] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                >
                  {acting === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create
                </button>
                <button
                  onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY }); }}
                  className="inline-flex items-center gap-2 border border-zinc-200 text-zinc-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-zinc-50 transition"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- list ---- */}
      <div className="space-y-2">
        {categories.map((c, i) => {
          const id = c.id || '';
          const n = counts[id] || 0;
          const busy = acting === id;
          const isEditing = editingId === id;

          return (
            <div key={id} className={`border rounded-xl p-3 sm:p-4 ${c.active ? 'border-zinc-200' : 'border-zinc-100 bg-zinc-50'}`}>
              {isEditing ? (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
                      <input
                        autoFocus
                        className={inputCls}
                        value={editForm.label}
                        onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                      />
                      <p className="text-xs text-zinc-400 mt-1">
                        id stays <span className="font-mono">{id}</span> — jobs are not touched.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Badge colour</label>
                      <ColorField value={editForm.color} onChange={(color) => setEditForm({ ...editForm, color })} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(c)}
                      disabled={!editForm.label.trim() || busy}
                      className="inline-flex items-center gap-2 bg-[#8b2df2] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-2 border border-zinc-200 text-zinc-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-zinc-50 transition"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0"
                    style={categoryBadgeStyle(c.color)}
                  >
                    <Tag className="w-3 h-3" /> {c.label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-400 font-mono truncate">{id}</p>
                    <p className="text-xs text-zinc-500">
                      {n} job{n === 1 ? '' : 's'}
                      {!c.active && <span className="text-zinc-400"> · disabled</span>}
                    </p>
                  </div>

                  {!usingDefaults && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleMove(i, -1)}
                        disabled={i === 0 || busy}
                        className="p-2 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMove(i, 1)}
                        disabled={i === categories.length - 1 || busy}
                        className="p-2 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(c)}
                        disabled={busy}
                        className="p-2 text-zinc-400 hover:text-[#8b2df2] disabled:opacity-40"
                        title={c.active ? 'Disable — hides it from the job form' : 'Enable'}
                      >
                        {c.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEdit(c)}
                        disabled={busy}
                        className="p-2 text-zinc-400 hover:text-[#8b2df2] disabled:opacity-40"
                        title="Rename or recolour"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openDelete(c)}
                        disabled={busy || categories.length <= 1}
                        className="p-2 text-zinc-400 hover:text-red-600 disabled:opacity-30"
                        title={categories.length <= 1 ? 'You need at least one category' : 'Delete'}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- delete confirmation ---- */}
      {deleteTarget && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">Delete "{deleteTarget.label}"?</p>
              {(counts[deleteTarget.id || ''] || 0) > 0 ? (
                <p className="text-sm text-red-700 mt-1">
                  {counts[deleteTarget.id || '']} job(s) use this category. They must move somewhere, or they
                  would keep pointing at an id that no longer exists and disappear from the dashboard filter.
                </p>
              ) : (
                <p className="text-sm text-red-700 mt-1">No jobs use it, so this is safe.</p>
              )}
            </div>
          </div>

          {(counts[deleteTarget.id || ''] || 0) > 0 && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Move those jobs to</label>
              <select
                className={inputCls}
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                {categories.filter((x) => x.id !== deleteTarget.id).map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleDelete}
              disabled={acting === deleteTarget.id}
              className="inline-flex items-center gap-2 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
            >
              {acting === deleteTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {(counts[deleteTarget.id || ''] || 0) > 0 ? 'Move jobs and delete' : 'Delete'}
            </button>
            <button
              onClick={() => setDeleteTarget(null)}
              className="inline-flex items-center gap-2 border border-zinc-200 bg-white text-zinc-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-zinc-50 transition"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      {status && (
        <div className={`mt-4 rounded-xl p-3 text-sm font-medium ${status.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#8b2df2'}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-9 rounded border border-zinc-200 bg-white p-0.5 cursor-pointer shrink-0"
      />
      <input
        className={inputCls + ' flex-1 min-w-[110px] font-mono'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#8b2df2"
      />
      <div className="flex gap-1 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="w-6 h-6 rounded-md border border-zinc-200 shrink-0"
            style={{ backgroundColor: c }}
            aria-label={`Use ${c}`}
          />
        ))}
      </div>
    </div>
  );
}