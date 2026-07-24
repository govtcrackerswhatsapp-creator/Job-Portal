import { useState, useRef } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { Download, Upload, Loader2, AlertTriangle, CheckCircle2, Database } from 'lucide-react';

// Collections included in backups. (Firebase Auth login accounts are NOT here — they
// live outside Firestore and can't be exported/imported this way.)
const COLLECTIONS = ['jobs', 'plans', 'settings', 'payments', 'carts', 'users'];

interface BackupData {
  version: number;
  exportedAt: string;
  collections: Record<string, Record<string, any>>;
}

export default function BackupRestore() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<'merge' | 'overwrite'>('merge');
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showStatus = (type: 'ok' | 'err', msg: string) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 6000);
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const backup: BackupData = { version: 1, exportedAt: new Date().toISOString(), collections: {} };
      for (const col of COLLECTIONS) {
        const snap = await getDocs(collection(db, col));
        const docs: Record<string, any> = {};
        snap.forEach((d) => { docs[d.id] = d.data(); });
        backup.collections[col] = docs;
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teckosh-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('ok', 'Backup downloaded successfully.');
    } catch (e) {
      console.error('Export error:', e);
      showStatus('err', 'Export failed. Check console.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => fileRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) fileRef.current!.value = ''; // reset so same file can be re-picked
    if (!file) return;

    const confirmMsg = mode === 'overwrite'
      ? '⚠️ OVERWRITE mode will replace existing documents with the backup\'s versions (and add new ones). This cannot be undone. Continue?'
      : 'MERGE mode will add/update documents from the backup without deleting anything. Continue?';
    if (!confirm(confirmMsg)) return;

    try {
      setImporting(true);
      const text = await file.text();
      const backup = JSON.parse(text) as BackupData;
      if (!backup.collections) throw new Error('Invalid backup file.');

      let count = 0;
      let failed = 0;
      let skippedSelf = 0;
      for (const col of Object.keys(backup.collections)) {
        if (!COLLECTIONS.includes(col)) continue; // ignore unknown collections
        const docs = backup.collections[col];
        for (const id of Object.keys(docs)) {
          // LOCKOUT GUARD: never restore your own user document. An older backup
          // may hold a pre-promotion role, which would demote you mid-restore and
          // make every remaining write fail. Your own account is left untouched.
          if (col === 'users' && user && id === user.uid) { skippedSelf++; continue; }
          try {
            // merge:true adds/updates fields; without merge (overwrite) it replaces the doc.
            await setDoc(doc(db, col, id), docs[id], mode === 'merge' ? { merge: true } : {});
            count++;
          } catch (docErr) {
            // One bad document must not abandon the whole restore partway.
            failed++;
            console.error(`Restore failed for ${col}/${id}:`, docErr);
          }
        }
      }
      const extra = [
        failed > 0 ? `${failed} failed (see console)` : '',
        skippedSelf > 0 ? 'your own account was skipped' : '',
      ].filter(Boolean).join(', ');
      showStatus(failed > 0 ? 'err' : 'ok',
        `Restore finished — ${count} documents ${mode === 'merge' ? 'merged' : 'written'}${extra ? ` (${extra})` : ''}. Refresh to see changes.`);
    } catch (err) {
      console.error('Import error:', err);
      showStatus('err', 'Restore failed — the file may be invalid or you lack permissions.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-zinc-900 mb-1">Backup & Restore</h2>
      <p className="text-sm text-zinc-500 mb-5">Export all your data (jobs, plans, payments, subscribers, settings) to a file, or restore from one.</p>

      {/* Export */}
      <div className="border border-zinc-100 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><Download className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h3 className="font-medium text-zinc-900">Export Backup</h3>
            <p className="text-sm text-zinc-500">Downloads a JSON file with all your Firestore data. Keep it somewhere safe.</p>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download Backup
        </button>
      </div>

      {/* Restore */}
      <div className="border border-zinc-100 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Upload className="w-5 h-5 text-blue-600" /></div>
          <div>
            <h3 className="font-medium text-zinc-900">Restore from Backup</h3>
            <p className="text-sm text-zinc-500">Upload a backup JSON to restore data. Your own admin account is never overwritten, so a restore cannot lock you out.</p>
          </div>
        </div>

        <label className="block text-sm font-medium text-zinc-700 mb-2">Restore mode</label>
        <div className="flex gap-2 mb-3 flex-wrap">
          <button onClick={() => setMode('merge')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'merge' ? 'bg-[#8b2df2] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>
            Merge (safe)
          </button>
          <button onClick={() => setMode('overwrite')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'overwrite' ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>
            Overwrite
          </button>
        </div>

        <div className={`rounded-lg p-3 mb-4 text-sm flex items-start gap-2 ${mode === 'overwrite' ? 'bg-red-50 text-red-700' : 'bg-zinc-50 text-zinc-600'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {mode === 'merge'
            ? 'Merge adds and updates documents from the backup. Nothing is deleted. Recommended.'
            : 'Overwrite replaces matching documents with the backup versions. Use only to roll back to an exact snapshot.'}
        </div>

        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFileSelected} className="hidden" />
        <button onClick={handleImportClick} disabled={importing} className="inline-flex items-center gap-2 bg-blue-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Choose Backup File
        </button>
      </div>

      {/* Note */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
        <Database className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Login accounts (Google sign-ins) and Razorpay keys are <strong>not</strong> included — they live outside the database. Backups cover your app data only.</span>
      </div>

      {status && (
        <div className={`mt-4 rounded-xl p-3 text-sm font-medium flex items-center gap-2 ${status.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {status.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} {status.msg}
        </div>
      )}
    </div>
  );
}