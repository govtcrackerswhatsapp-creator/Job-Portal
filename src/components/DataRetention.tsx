import { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, where } from 'firebase/firestore';
import { UserProfile } from '../types';
import { hasActivePaidSubscription } from '../lib/access';
import { AlertTriangle, Loader2, Trash2, ShieldAlert, Search, Eye } from 'lucide-react';

type Target = 'users' | 'all_managers' | 'specific_manager' | 'all_organisation';

const AGE_PRESETS = [
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
  { label: '2 years', days: 730 },
];

export default function DataRetention() {
  const [target, setTarget] = useState<Target>('users');
  const [ageDays, setAgeDays] = useState<number>(365);
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // Specific manager selection
  const [managerSearch, setManagerSearch] = useState('');
  const [managerResults, setManagerResults] = useState<UserProfile[]>([]);
  const [selectedManager, setSelectedManager] = useState<UserProfile | null>(null);
  const [searching, setSearching] = useState(false);

  // Preview + confirm flow
  const [includeUndated, setIncludeUndated] = useState(false);
  const [preview, setPreview] = useState<{ toDelete: UserProfile[]; exemptCount: number; undatedProtected: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const effectiveDays = useCustom ? parseInt(customDays, 10) : ageDays;
  const cutoff = Date.now() - (effectiveDays || 0) * 24 * 60 * 60 * 1000;

  const reset = () => { setPreview(null); setConfirmText(''); setResult(null); };

  const searchManagers = async () => {
    try {
      setSearching(true);
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'manager')));
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push(d.data() as UserProfile));
      const term = managerSearch.trim().toLowerCase();
      setManagerResults(term ? list.filter((u) => u.email.toLowerCase().includes(term)) : list);
    } catch (e) {
      console.error('Manager search error:', e);
    } finally {
      setSearching(false);
    }
  };

  // Build the deletion set with ALL guardrails applied.
  const buildPreview = async () => {
    if (!effectiveDays || effectiveDays < 1) { alert('Enter a valid age (days).'); return; }
    if (target === 'specific_manager' && !selectedManager) { alert('Select a manager first.'); return; }
    try {
      setPreviewing(true);
      reset();
      const snap = await getDocs(collection(db, 'users'));
      const all: UserProfile[] = [];
      snap.forEach((d) => all.push(d.data() as UserProfile));

      let exempt = 0;
      let undatedProtected = 0;
      const toDelete = all.filter((u) => {
        // GUARDRAIL: superadmin is NEVER deleted.
        if (u.role === 'superadmin') { return false; }
        // GUARDRAIL: active subscribers (paid or free-access) are NEVER deleted.
        if (u.freeAccess === true || hasActivePaidSubscription(u)) { exempt++; return false; }

        // A named manager is chosen by hand, so account age never applies.
        if (target === 'specific_manager') {
          return u.uid === selectedManager?.uid; // jobs survive separately
        }

        const created = typeof u.createdAt === 'number' ? u.createdAt : null;

        // GUARDRAIL: accounts with no recorded signup date (created before
        // createdAt was tracked) have an UNKNOWN age. Deleting them by age would
        // be a guess, so they are protected unless the admin explicitly opts in.
        if (created === null) {
          if (!includeUndated) { undatedProtected++; return false; }
        } else if (created >= cutoff) {
          return false; // account is newer than the cutoff
        }

        switch (target) {
          case 'users':
            return u.role === 'user';
          case 'all_managers':
            return u.role === 'manager';
          case 'all_organisation':
            return true;
          default:
            return false;
        }
      });

      setPreview({ toDelete, exemptCount: exempt, undatedProtected });
    } catch (e) {
      console.error('Preview error:', e);
      alert('Failed to build preview.');
    } finally {
      setPreviewing(false);
    }
  };

  const executeDelete = async () => {
    if (!preview) return;
    if (confirmText !== 'DELETE') { alert('Type DELETE to confirm.'); return; }
    try {
      setDeleting(true);
      let count = 0;
      let failed = 0;
      for (const u of preview.toDelete) {
        // One failure must not abandon the rest — record it and carry on, so the
        // final message is an accurate account of what actually happened.
        try {
          await deleteDoc(doc(db, 'users', u.uid));
          // Also remove their saved-jobs cart (their jobs are intentionally left intact).
          try { await deleteDoc(doc(db, 'carts', u.uid)); } catch { /* no cart is fine */ }
          count++;
        } catch (e) {
          failed++;
          console.error(`Could not delete user ${u.uid} (${u.email}):`, e);
        }
      }
      setResult(
        `Deleted ${count} user record(s).` +
        (failed > 0 ? ` ${failed} could not be deleted — see the browser console.` : '') +
        ` Payments were protected and managers' jobs were left intact.`
      );
      setPreview(null);
      setConfirmText('');
    } catch (e) {
      console.error('Delete error:', e);
      alert('Deletion failed. Some records may remain.');
    } finally {
      setDeleting(false);
    }
  };

  const targetLabel: Record<Target, string> = {
    users: 'Regular users',
    all_managers: 'All managers',
    specific_manager: 'One specific manager',
    all_organisation: 'Everyone (full organisation)',
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0"><ShieldAlert className="w-5 h-5 text-red-600" /></div>
        <div>
          <h2 className="font-heading text-lg font-semibold text-zinc-900">Data Retention (Danger Zone)</h2>
          <p className="text-sm text-zinc-500">Permanently delete old records. This cannot be undone.</p>
        </div>
      </div>

      {/* Guardrail summary */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-5 text-sm text-emerald-800">
        <p className="font-medium mb-1">Always protected (never deleted):</p>
        <ul className="list-disc list-inside space-y-0.5 text-emerald-700">
          <li>Superadmin (you)</li>
          <li>Active subscribers & free-access users</li>
          <li>Accounts with no recorded signup date (unknown age)</li>
          <li>All payment records (kept for tax/legal)</li>
          <li>Jobs posted by a deleted manager (they stay until they expire naturally)</li>
        </ul>
      </div>

      {/* Step 1: Target */}
      <label className="block text-sm font-medium text-zinc-700 mb-2">1. What to delete</label>
      <select className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white mb-4 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30" value={target} onChange={(e) => { setTarget(e.target.value as Target); reset(); }}>
        <option value="users">Regular users</option>
        <option value="all_managers">All managers (their jobs survive)</option>
        <option value="specific_manager">A specific manager (their jobs survive)</option>
        <option value="all_organisation">Everyone — full organisation wipe</option>
      </select>

      {/* Specific manager picker */}
      {target === 'specific_manager' && (
        <div className="bg-zinc-50 rounded-xl p-4 mb-4 border border-zinc-100">
          <label className="block text-sm font-medium text-zinc-700 mb-2">Select the manager</label>
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white" value={managerSearch} onChange={(e) => setManagerSearch(e.target.value)} placeholder="Search manager email..." />
            </div>
            <button onClick={searchManagers} disabled={searching} className="px-4 py-2 rounded-lg bg-[#8b2df2] text-white text-sm font-medium disabled:opacity-50">{searching ? '...' : 'Find'}</button>
          </div>
          {managerResults.map((m) => (
            <button key={m.uid} onClick={() => setSelectedManager(m)} className={`block w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${selectedManager?.uid === m.uid ? 'bg-[#8b2df2] text-white' : 'bg-white border border-zinc-100 hover:bg-zinc-50'}`}>
              {m.name || 'Manager'} — {m.email}
            </button>
          ))}
          {selectedManager && <p className="text-xs text-zinc-500 mt-1">Selected: {selectedManager.email}</p>}
        </div>
      )}

      {/* Step 2: Age (not needed for specific manager) */}
      {target !== 'specific_manager' && (
        <>
          <label className="block text-sm font-medium text-zinc-700 mb-2">2. Delete records older than</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {AGE_PRESETS.map((p) => (
              <button key={p.days} onClick={() => { setUseCustom(false); setAgeDays(p.days); reset(); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${!useCustom && ageDays === p.days ? 'bg-[#8b2df2] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{p.label}</button>
            ))}
            <button onClick={() => { setUseCustom(true); reset(); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${useCustom ? 'bg-[#8b2df2] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>Custom</button>
          </div>
          {useCustom && (
            <input type="number" min="1" className="w-40 px-3 py-2 rounded-lg border border-zinc-200 text-sm bg-white mb-2" value={customDays} onChange={(e) => { setCustomDays(e.target.value); reset(); }} placeholder="Days" />
          )}
          <p className="text-xs text-zinc-400 mb-3">Currently: older than <strong>{effectiveDays || '?'}</strong> days.</p>

          <label className="flex items-start gap-2 mb-4 text-sm text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl p-3">
            <input type="checkbox" checked={includeUndated} onChange={(e) => { setIncludeUndated(e.target.checked); reset(); }} className="mt-0.5" />
            <span>
              Also include accounts with <strong>no recorded signup date</strong>.
              <span className="block text-xs text-zinc-500 mt-0.5">
                Accounts created before signup dates were tracked have an unknown age. They are protected by default — tick this only if you intend to delete them regardless of age.
              </span>
            </span>
          </label>
        </>
      )}

      {/* Step 3: Backup reminder + Preview */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span><strong>Before deleting:</strong> download a backup from the <strong>Backup</strong> tab first. Deletion is permanent.</span>
      </div>

      <button onClick={buildPreview} disabled={previewing} className="inline-flex items-center gap-2 bg-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-zinc-900 transition disabled:opacity-50 mb-4">
        {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview what will be deleted
      </button>

      {/* Preview + type-to-confirm */}
      {preview && (
        <div className="border-2 border-red-200 rounded-xl p-5 bg-red-50/50">
          <p className="font-heading text-lg font-bold text-red-700 mb-1">
            This will permanently delete {preview.toDelete.length} record(s).
          </p>
          <p className="text-sm text-zinc-600 mb-3">
            Target: <strong>{targetLabel[target]}</strong>. {preview.exemptCount > 0 && <>{preview.exemptCount} active subscriber(s) were protected and excluded. </>}{preview.undatedProtected > 0 && <>{preview.undatedProtected} account(s) with no recorded signup date were protected and excluded. </>}
            Payments and managers' jobs are not affected.
          </p>

          {preview.toDelete.length > 0 && (
            <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-red-100 p-2 mb-3 text-sm">
              {preview.toDelete.slice(0, 50).map((u) => (
                <div key={u.uid} className="px-2 py-1 text-zinc-700 truncate">{u.email} <span className="text-zinc-400">({u.role})</span></div>
              ))}
              {preview.toDelete.length > 50 && <p className="px-2 py-1 text-zinc-400">…and {preview.toDelete.length - 50} more</p>}
            </div>
          )}

          {preview.toDelete.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing matches — no records will be deleted.</p>
          ) : (
            <>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Type <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-zinc-200">DELETE</span> to confirm</label>
              <input className="w-48 px-3 py-2 rounded-lg border border-zinc-300 text-sm bg-white mb-3" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
              <div>
                <button onClick={executeDelete} disabled={deleting || confirmText !== 'DELETE'} className="inline-flex items-center gap-2 bg-red-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-40">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Permanently Delete {preview.toDelete.length} Record(s)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">{result}</div>
      )}
    </div>
  );
}