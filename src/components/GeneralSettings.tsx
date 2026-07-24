import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AppSettings, MaintenanceMode, MaintenanceAudience } from '../types';
import { DEFAULT_APP_SETTINGS, clearAppSettingsCache } from '../lib/appSettings';
import { isMaintenanceActiveNow } from '../lib/maintenance';
import { Loader2, Save, CheckCircle2, Wrench, BarChart3, Clock, Info } from 'lucide-react';

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

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    try {
      setSaving(true);
      await setDoc(doc(db, 'settings', 'general'), form, { merge: true });
      clearAppSettingsCache();
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

  const mode = form.maintenanceScheduleMode || 'manual';
  const liveNow = isMaintenanceActiveNow(form); // preview: is maintenance active right now?

  const modeBtn = (m: MaintenanceMode, label: string) => (
    <button
      onClick={() => set('maintenanceScheduleMode', m)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${mode === m ? 'bg-[#8b2df2] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold text-zinc-900 mb-4">General Settings</h2>

      <div className="space-y-4">
        {/* Maintenance */}
        <div className="border border-zinc-100 rounded-xl p-4 sm:p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Wrench className="w-5 h-5 text-amber-600" /></div>
            <div className="flex-1">
              <h3 className="font-medium text-zinc-900">Maintenance Mode</h3>
              <p className="text-sm text-zinc-500">Show a maintenance page to visitors. All times are in India Standard Time (IST). Superadmin is never blocked.</p>
            </div>
          </div>

          {/* Live status pill */}
          <div className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full mb-4 ${liveNow ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            <span className={`w-2 h-2 rounded-full ${liveNow ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            {liveNow ? 'Maintenance is ACTIVE right now' : 'Site is live (no maintenance active)'}
          </div>

          {/* Mode selector */}
          <label className="block text-sm font-medium text-zinc-700 mb-2">Trigger</label>
          <div className="flex gap-2 mb-4 flex-wrap">
            {modeBtn('manual', 'Manual (on/off now)')}
            {modeBtn('onetime', 'One-time window')}
            {modeBtn('daily', 'Daily recurring')}
          </div>

          {/* Manual */}
          {mode === 'manual' && (
            <div className="flex items-center justify-between gap-3 bg-zinc-50 rounded-lg p-4">
              <span className="text-sm text-zinc-700 min-w-0">Turn maintenance {form.maintenanceMode ? 'OFF' : 'ON'} immediately</span>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" className="sr-only peer" checked={!!form.maintenanceMode} onChange={(e) => set('maintenanceMode', e.target.checked)} />
                <div className="w-11 h-6 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          )}

          {/* One-time */}
          {mode === 'onetime' && (
            <div className="bg-zinc-50 rounded-lg p-4 space-y-3">
              <p className="text-xs text-zinc-500 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Maintenance shows continuously between these two IST date-times.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Start (IST)</label>
                  <input type="datetime-local" className={inputCls} value={form.maintenanceStart || ''} onChange={(e) => set('maintenanceStart', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">End (IST)</label>
                  <input type="datetime-local" className={inputCls} value={form.maintenanceEnd || ''} onChange={(e) => set('maintenanceEnd', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Daily recurring */}
          {mode === 'daily' && (
            <div className="bg-zinc-50 rounded-lg p-4 space-y-3">
              <p className="text-xs text-zinc-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Every day within the date range, maintenance shows during the daily time window (IST). Overnight windows (e.g. 23:00–02:00) are supported.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Daily start time (IST)</label>
                  <input type="time" className={inputCls} value={form.maintenanceDailyStartTime || ''} onChange={(e) => set('maintenanceDailyStartTime', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Daily end time (IST)</label>
                  <input type="time" className={inputCls} value={form.maintenanceDailyEndTime || ''} onChange={(e) => set('maintenanceDailyEndTime', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Repeat from (date)</label>
                  <input type="date" className={inputCls} value={form.maintenanceDailyFrom || ''} onChange={(e) => set('maintenanceDailyFrom', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Repeat until (date)</label>
                  <input type="date" className={inputCls} value={form.maintenanceDailyTo || ''} onChange={(e) => set('maintenanceDailyTo', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Audience */}
          <label className="block text-sm font-medium text-zinc-700 mt-4 mb-1">Who sees the maintenance page?</label>
          <select className={inputCls} value={form.maintenanceAudience || 'users'} onChange={(e) => set('maintenanceAudience', e.target.value as MaintenanceAudience)}>
            <option value="users">Regular users only (staff keep access)</option>
            <option value="users_and_managers">Users and managers (only superadmin keeps access)</option>
          </select>

          {/* Message */}
          <label className="block text-sm font-medium text-zinc-700 mt-4 mb-1">Message shown to blocked visitors</label>
          <textarea className={inputCls} rows={2} value={form.maintenanceMessage || ''} onChange={(e) => set('maintenanceMessage', e.target.value)} />
        </div>

        {/* Manager analytics access */}
        <div className="border border-zinc-100 rounded-xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-[#8b2df2]/10 flex items-center justify-center shrink-0"><BarChart3 className="w-5 h-5 text-[#8b2df2]" /></div>
              <div>
                <h3 className="font-medium text-zinc-900">Manager Analytics Access</h3>
                <p className="text-sm text-zinc-500">Allow managers to view the Analytics (revenue) page. Off by default — only superadmin sees revenue.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" className="sr-only peer" checked={!!form.allowManagerAnalytics} onChange={(e) => set('allowManagerAnalytics', e.target.checked)} />
              <div className="w-11 h-6 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8b2df2]"></div>
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