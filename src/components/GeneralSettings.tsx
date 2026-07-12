import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS } from '../lib/appSettings';
import { Loader2, Save, CheckCircle2, Wrench, BarChart3 } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';

export default function GeneralSettings() {
  const [form, setForm] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) setForm({ ...DEFAULT_APP_SETTINGS, ...(snap.data() as Partial<AppSettings>) });
      } catch (e) {
        console.error('Error loading settings:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await setDoc(doc(db, 'settings', 'general'), form, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Error saving settings:', e);
      alert('Failed to save. Check permissions.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>;

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-zinc-900 mb-4">General Settings</h2>

      <div className="space-y-4">
        {/* Maintenance mode */}
        <div className="border border-zinc-100 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Wrench className="w-5 h-5 text-amber-600" /></div>
              <div>
                <h3 className="font-medium text-zinc-900">Maintenance Mode</h3>
                <p className="text-sm text-zinc-500">Blocks regular users with a message. Staff and admin keep full access. The public landing page stays visible.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" className="sr-only peer" checked={!!form.maintenanceMode} onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })} />
              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
          {form.maintenanceMode && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 mb-1">Message shown to users</label>
              <textarea className={inputCls} rows={2} value={form.maintenanceMessage || ''} onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })} />
            </div>
          )}
        </div>

        {/* Manager analytics access */}
        <div className="border border-zinc-100 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#8b2df2]/10 flex items-center justify-center shrink-0"><BarChart3 className="w-5 h-5 text-[#8b2df2]" /></div>
              <div>
                <h3 className="font-medium text-zinc-900">Manager Analytics Access</h3>
                <p className="text-sm text-zinc-500">Allow managers to view the Analytics (revenue) page. Off by default — only superadmin sees revenue.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" className="sr-only peer" checked={!!form.allowManagerAnalytics} onChange={(e) => setForm({ ...form, allowManagerAnalytics: e.target.checked })} />
              <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8b2df2]"></div>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
          </button>
          {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Saved!</span>}
        </div>
      </div>
    </div>
  );
}