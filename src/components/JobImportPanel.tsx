import { useState, useRef, useMemo, useEffect } from 'react';
import { Job, Category } from '../types';
import {
  parseImportText, planImport, buildCreatePayload, buildUpdatePayload,
  MAX_IMPORT_ROWS, ImportPlan, PlannedRow, RowAction,
} from '../lib/jobImport';
import { downloadTemplate, buildAiPrompt } from '../lib/jobTemplate';
import { commitJobImport, ImportOp, ImportOutcome } from '../lib/jobsData';
import { getActiveCategories } from '../lib/categoriesData';
import {
  Upload, Download, Copy, Check, X, AlertTriangle, Loader2, FileText, Plus, Pencil,
} from 'lucide-react';

interface Props {
  existingJobs: Job[];
  uid: string;
  isAdmin: boolean;
  onClose: () => void;
  onImported: () => void;
}

const ACTION_META: Record<RowAction, { label: string; cls: string }> = {
  create: { label: 'New', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  update: { label: 'Update', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  error: { label: 'Error', cls: 'bg-red-50 text-red-700 border-red-200' },
  'not-owner': { label: 'Skipped', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  superseded: { label: 'Superseded', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
};

const btnBase = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost = btnBase + ' border border-zinc-200 text-zinc-700 bg-white hover:bg-zinc-50';

export default function JobImportPanel({ existingJobs, uid, isAdmin, onClose, onImported }: Props) {
  const [text, setText] = useState('');
  const [replaceMode, setReplaceMode] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [parseError, setParseError] = useState('');
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * The categories a file may reference.
   *
   * Loaded here rather than baked into jobImport so that module stays free of
   * Firestore. Only ACTIVE ones: a disabled category should not accept new
   * jobs from an import any more than it appears in the job form. Existing
   * jobs already in a disabled category are untouched — this only governs what
   * an incoming file may say.
   */
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    getActiveCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const categoryIds = useMemo(
    () => categories.map((c) => c.id).filter((id): id is string => !!id),
    [categories],
  );

  /**
   * Only used if a create row somehow arrives with no category, which
   * planImport already rejects. Passed rather than hardcoded because the old
   * 'government' default can now be renamed or disabled.
   */
  const fallbackCategory = categoryIds[0] || '';

  const actionable = useMemo(
    () => (plan ? plan.rows.filter((r) => r.action === 'create' || r.action === 'update') : []),
    [plan],
  );

  const reset = () => {
    setPlan(null);
    setParseError('');
    setParseWarnings([]);
    setResult(null);
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
      reset();
    } catch {
      setParseError('Could not read that file.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleCheck = () => {
    reset();
    const parsed = parseImportText(text);
    setParseWarnings(parsed.warnings);
    if (parsed.error) { setParseError(parsed.error); return; }
    setPlan(planImport(parsed.rows, existingJobs, { uid, isAdmin, replaceMode, categoryIds }));
  };

  const handleCopyPrompt = async () => {
    try {
      // Built from the live category ids, so the AI is told this portal's real
      // options rather than the four that shipped originally.
      await navigator.clipboard.writeText(buildAiPrompt(categoryIds));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setParseError('Could not copy — select the prompt from the downloaded template instead.');
    }
  };

  const handleCommit = async () => {
    if (!plan || actionable.length === 0) return;
    const ops: ImportOp[] = actionable.map((row) => (
      row.action === 'create'
        ? { kind: 'create' as const, data: buildCreatePayload(row, uid, fallbackCategory), label: row.title }
        : { kind: 'update' as const, id: row.targetId, data: buildUpdatePayload(row, replaceMode, fallbackCategory), label: row.title }
    ));
    try {
      setCommitting(true);
      setProgress({ done: 0, total: ops.length });
      const outcome = await commitJobImport(ops, (done, total) => setProgress({ done, total }));
      setResult(outcome);
      setPlan(null);
      onImported();
    } catch (e) {
      setParseError('Import failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-soft p-5 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-heading text-lg font-semibold text-zinc-900">Import Jobs</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition" aria-label="Close import panel">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ---- step 1: get the format ---- */}
      <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 mb-4">
        <p className="text-sm text-zinc-700 mb-3">
          Download the template, hand it to an AI with the prompt, then paste the JSON it returns below.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadTemplate(categoryIds)} className={btnGhost} type="button">
            <FileText className="w-4 h-4" /> Download template
          </button>
          <button onClick={handleCopyPrompt} className={btnGhost} type="button">
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy AI prompt'}
          </button>
        </div>
        {categoryIds.length > 0 && (
          <p className="text-xs text-zinc-500 mt-3">
            Valid categories: <span className="font-mono">{categoryIds.join(', ')}</span>
          </p>
        )}
      </div>

      {/* ---- step 2: supply the data ---- */}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); reset(); }}
        rows={7}
        spellCheck={false}
        placeholder={'Paste the JSON here, or choose a file below.\n\n[\n  { "refCode": "ssc-cgl-2026", "title": "SSC CGL 2026", "category": "exam", "examDate": "2026-09-15" }\n]'}
        className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2]"
      />

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
        />
        <button onClick={() => fileRef.current?.click()} className={btnGhost} type="button">
          <Upload className="w-4 h-4" /> Choose file
        </button>
        <button
          onClick={handleCheck}
          disabled={!text.trim() || committing}
          className={btnBase + ' bg-[#8b2df2] text-white hover:opacity-90'}
          type="button"
        >
          <Check className="w-4 h-4" /> Check file
        </button>
        {text && (
          <button onClick={() => { setText(''); reset(); }} className="text-sm text-zinc-500 hover:text-zinc-800 px-2" type="button">
            Clear
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-zinc-700 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={replaceMode}
            onChange={(e) => { setReplaceMode(e.target.checked); reset(); }}
            className="w-4 h-4 rounded border-zinc-300 accent-[#8b2df2]"
          />
          Replace entirely
        </label>
      </div>

      {/* The replace-mode line used to promise that everything omitted gets
          cleared. That is no longer true of the hold fields, and an inaccurate
          warning here is worse than none — someone would omit onHold expecting
          a bulk release, get silence, and have no idea why. */}
      {replaceMode ? (
        <p className="text-xs text-zinc-400 mt-2">
          Replace mode: a matched job becomes exactly what the file says — fields the file leaves out are
          cleared, including examDate.{' '}
          <span className="text-amber-700">
            Hold is the one exception: it is never released by omission. To release held jobs in bulk, add{' '}
            <span className="font-mono">“onHold”: false</span> to those entries.
          </span>
        </p>
      ) : (
        <p className="text-xs text-zinc-400 mt-2">
          Merge mode: fields the file leaves out keep their current values. Up to {MAX_IMPORT_ROWS} jobs per file.
        </p>
      )}

      {/* ---- errors / warnings ---- */}
      {parseError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{parseError}</p>
        </div>
      )}
      {parseWarnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {parseWarnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-700">• {w}</li>
          ))}
        </ul>
      )}

      {/* ---- preview ---- */}
      {plan && (
        <div className="mt-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip n={plan.counts.create} label="new" cls="bg-emerald-50 text-emerald-700 border-emerald-200" />
            <Chip n={plan.counts.update} label="to update" cls="bg-blue-50 text-blue-700 border-blue-200" />
            <Chip n={plan.counts.error} label="with errors" cls="bg-red-50 text-red-700 border-red-200" />
            <Chip n={plan.counts.notOwner} label="not yours" cls="bg-amber-50 text-amber-700 border-amber-200" />
            <Chip n={plan.counts.superseded} label="superseded" cls="bg-zinc-100 text-zinc-500 border-zinc-200" />
          </div>

          <div className="max-h-96 overflow-y-auto rounded-xl border border-zinc-200 divide-y divide-zinc-100">
            {plan.rows.map((row) => <Row key={row.index} row={row} />)}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button
              onClick={handleCommit}
              disabled={actionable.length === 0 || committing}
              className={btnBase + ' bg-[#8b2df2] text-white hover:opacity-90'}
              type="button"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {committing
                ? 'Importing ' + progress.done + ' / ' + progress.total
                : 'Import ' + actionable.length + (actionable.length === 1 ? ' job' : ' jobs')}
            </button>
            {plan.counts.error > 0 && (
              <p className="text-xs text-zinc-500">
                Rows with errors are skipped — fix them in the file and check again.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---- result ---- */}
      {result && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            Imported {result.created} new and updated {result.updated}.
          </p>
          {result.failures.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-red-700 mb-1">
                {result.failures.length} could not be written:
              </p>
              <ul className="space-y-1">
                {result.failures.map((f, i) => (
                  <li key={i} className="text-xs text-red-700">• {f.label} — {f.message}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={() => { setText(''); reset(); }} className={btnGhost + ' mt-3'} type="button">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ n, label, cls }: { n: number; label: string; cls: string }) {
  if (n === 0) return null;
  return (
    <span className={'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ' + cls}>
      {n} {label}
    </span>
  );
}

function Row({ row }: { row: PlannedRow }) {
  const meta = ACTION_META[row.action];
  const dim = row.action === 'superseded' || row.action === 'not-owner';
  return (
    <div className={'p-3 ' + (dim ? 'opacity-70' : '')}>
      <div className="flex items-start gap-3">
        <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 ' + meta.cls}>
          {row.action === 'create' && <Plus className="w-3 h-3" />}
          {row.action === 'update' && <Pencil className="w-3 h-3" />}
          {meta.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 truncate">
            {row.index}. {row.title}
          </p>
          <p className="text-[11px] text-zinc-400 font-mono truncate">{row.refCode || '(no reference)'}</p>

          {row.action === 'update' && (
            <p className="text-xs text-zinc-500 mt-1">
              Matches “{row.targetTitle}”
              {row.diffs.length === 0
                ? ' — nothing changes'
                : ' — ' + row.diffs.length + (row.diffs.length === 1 ? ' field changes' : ' fields change')}
            </p>
          )}

          {row.diffs.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {row.diffs.map((d) => (
                <li key={d.field} className="text-[11px] text-zinc-600">
                  <span className="font-medium text-zinc-700">{d.field}</span>{' '}
                  <span className="text-zinc-400 line-through">{d.before}</span>{' '}
                  <span className="text-zinc-400">→</span>{' '}
                  <span className="text-zinc-800">{d.after}</span>
                </li>
              ))}
            </ul>
          )}

          {row.errors.map((e, i) => (
            <p key={'e' + i} className="text-xs text-red-600 mt-1">{e.message}</p>
          ))}
          {row.warnings.map((w, i) => (
            <p key={'w' + i} className="text-xs text-amber-700 mt-1">{w.message}</p>
          ))}
        </div>
      </div>
    </div>
  );
}