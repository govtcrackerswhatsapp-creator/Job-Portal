import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { SocialLink, LandingSettings } from '../types';
import { getSocialLinks, addSocialLink, updateSocialLink, deleteSocialLink } from '../lib/socialData';
import { socialIconFor, SOCIAL_PRESETS, ICON_STYLE_OPTIONS } from '../lib/socialIcons';
import { DEFAULT_LANDING, loadLandingSettings, clearLandingCache } from '../lib/landingSettings';
import { Plus, Pencil, Trash2, X, Loader2, Save, Eye, EyeOff, ArrowUp, ArrowDown, Sparkles, ExternalLink, Share2, CheckCircle2 } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';

interface FormState { platform: string; icon: string; url: string; handle: string; description: string; color: string; enabled: boolean; }
const EMPTY: FormState = { platform: '', icon: 'instagram', url: '', handle: '', description: '', color: '#8b2df2', enabled: true };

export default function SocialSettings() {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });

  const [text, setText] = useState<{ communityTitle: string; communitySubtext: string }>({ communityTitle: '', communitySubtext: '' });
  const [savingText, setSavingText] = useState(false);
  const [savedText, setSavedText] = useState(false);

  useEffect(() => { load(); loadText(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const list = await getSocialLinks(true);
      setLinks(list);
    } catch (e) {
      console.error('Error loading social links:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadText = async () => {
    try {
      const s = await loadLandingSettings(true);
      setText({ communityTitle: s.communityTitle ?? DEFAULT_LANDING.communityTitle, communitySubtext: s.communitySubtext ?? DEFAULT_LANDING.communitySubtext });
    } catch (e) {
      console.error('Error loading community text:', e);
    }
  };

  const saveText = async () => {
    try {
      setSavingText(true);
      await setDoc(doc(db, 'settings', 'landing'), { communityTitle: text.communityTitle.trim() || DEFAULT_LANDING.communityTitle, communitySubtext: text.communitySubtext.trim() }, { merge: true });
      clearLandingCache();
      setSavedText(true);
      setTimeout(() => setSavedText(false), 3000);
    } catch (e) {
      console.error('Error saving community text:', e);
      alert('Failed to save text.');
    } finally {
      setSavingText(false);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const applyPreset = (p: { platform: string; icon: string; color: string }) => setForm((f) => ({ ...f, platform: p.platform, icon: p.icon, color: p.color }));
  const openCreate = () => { setForm({ ...EMPTY }); setEditingId(null); setShowForm(true); };
  const openEdit = (l: SocialLink) => {
    setForm({ platform: l.platform, icon: l.icon, url: l.url, handle: l.handle || '', description: l.description || '', color: l.color || '#8b2df2', enabled: l.enabled });
    setEditingId(l.id || null); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.platform.trim() || !form.url.trim()) { alert('Platform name and URL are required.'); return; }
    try {
      setSaving(true);
      if (editingId) {
        await updateSocialLink(editingId, { platform: form.platform.trim(), icon: form.icon, url: form.url.trim(), handle: form.handle.trim(), description: form.description.trim(), color: form.color, enabled: form.enabled });
      } else {
        const maxOrder = links.reduce((m, l) => Math.max(m, l.order ?? 0), 0);
        await addSocialLink({ platform: form.platform.trim(), icon: form.icon, url: form.url.trim(), handle: form.handle.trim(), description: form.description.trim(), color: form.color, enabled: form.enabled, order: maxOrder + 1 });
      }
      setShowForm(false); await load();
    } catch (e) {
      console.error('Error saving social link:', e); alert('Failed to save. Check permissions.');
    } finally { setSaving(false); }
  };

  const toggleVisible = async (l: SocialLink) => {
    if (!l.id) return;
    try { setActing(l.id); await updateSocialLink(l.id, { enabled: !l.enabled }); await load(); }
    catch (e) { console.error(e); } finally { setActing(null); }
  };
  const remove = async (l: SocialLink) => {
    if (!l.id || !confirm(`Delete ${l.platform}?`)) return;
    try { setActing(l.id); await deleteSocialLink(l.id); await load(); }
    catch (e) { console.error(e); } finally { setActing(null); }
  };
  const move = async (l: SocialLink, dir: -1 | 1) => {
    const idx = links.findIndex((x) => x.id === l.id); const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= links.length) return;
    const other = links[swapIdx];
    if (!l.id || !other.id) return;
    try { setActing(l.id); const lOrder = l.order ?? idx; const oOrder = other.order ?? swapIdx; await updateSocialLink(l.id, { order: oOrder }); await updateSocialLink(other.id, { order: lOrder }); await load(); }
    catch (e) { console.error(e); } finally { setActing(null); }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-heading text-lg font-semibold text-zinc-900">Community / Social Media</h2>
        <p className="text-sm text-zinc-500">Platforms shown in the Community section of the landing page.</p>
      </div>

      <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-4">
        <h3 className="font-medium text-zinc-900 mb-3">Section Text</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Section heading</label>
            <input className={inputCls} value={text.communityTitle} onChange={(e) => setText((t) => ({ ...t, communityTitle: e.target.value }))} placeholder="Join our community" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Subtext</label>
            <textarea className={inputCls} rows={2} value={text.communitySubtext} onChange={(e) => setText((t) => ({ ...t, communitySubtext: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={saveText} disabled={savingText} className="inline-flex items-center gap-2 bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-900 transition disabled:opacity-50">{savingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Text</button>
            {savedText ? <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Saved!</span> : null}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="font-medium text-zinc-900">Platforms</h3>
        {!showForm ? <button onClick={openCreate} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition"><Plus className="w-4 h-4" /> Add Social Media</button> : null}
      </div>

      {showForm ? (
        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-zinc-900 inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#8b2df2]" /> {editingId ? 'Edit Social Link' : 'Add New Social Link'}</h3>
            <button onClick={() => setShowForm(false)} className="p-1 text-zinc-400 hover:text-zinc-700"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Quick presets</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {SOCIAL_PRESETS.map((p) => { const Icon = socialIconFor(p.icon); return <button key={p.platform} onClick={() => applyPreset(p)} className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-zinc-200 hover:border-[#8b2df2] rounded-lg px-3 py-1.5 transition"><Icon className="w-3.5 h-3.5" style={{ color: p.color }} /> {p.platform}</button>; })}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-zinc-700 mb-1">Platform Name *</label><input className={inputCls} value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder="e.g. Instagram" /></div>
            <div><label className="block text-sm font-medium text-zinc-700 mb-1">Icon Style *</label><select className={inputCls} value={form.icon} onChange={(e) => set('icon', e.target.value)}>{ICON_STYLE_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</select></div>
          </div>
          <div className="mt-3"><label className="block text-sm font-medium text-zinc-700 mb-1">Link URL *</label><input className={inputCls} value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://youtube.com/@channel" /></div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div><label className="block text-sm font-medium text-zinc-700 mb-1">Display Label / Handle <span className="text-zinc-400 font-normal">optional</span></label><input className={inputCls} value={form.handle} onChange={(e) => set('handle', e.target.value)} placeholder="e.g. @mychannel" /></div>
            <div><label className="block text-sm font-medium text-zinc-700 mb-1">Brand Color</label><div className="flex items-center gap-2"><input type="color" value={form.color} onChange={(e) => set('color', e.target.value)} className="w-10 h-10 rounded-lg border border-zinc-200 bg-white cursor-pointer p-0.5" /><input className={inputCls + ' flex-1'} value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="#E1306C" /></div></div>
          </div>
          <div className="mt-3"><label className="block text-sm font-medium text-zinc-700 mb-1">Description / Tagline <span className="text-zinc-400 font-normal">optional</span></label><input className={inputCls} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Shown in the community section" /></div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 mt-3"><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} className="rounded" /> Show on public landing page</label>
          <div className="flex items-center gap-3 pt-4">
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Configuration</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>
      ) : links.length === 0 ? (
        <div className="bg-zinc-50 rounded-xl p-8 text-center border border-zinc-100"><Share2 className="w-8 h-8 text-zinc-300 mx-auto mb-2" /><p className="text-zinc-500 text-sm">No social platforms yet. Add one to show the Community section.</p></div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-3 font-medium">Order</th><th className="text-left px-4 py-3 font-medium">Platform</th><th className="text-left px-4 py-3 font-medium">Label / Handle</th><th className="text-left px-4 py-3 font-medium">URL</th><th className="text-left px-4 py-3 font-medium">Status</th><th className="text-right px-4 py-3 font-medium"></th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {links.map((l, i) => {
                const Icon = socialIconFor(l.icon);
                return (
                  <tr key={l.id} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3"><div className="flex items-center gap-1"><div className="flex flex-col"><button onClick={() => move(l, -1)} disabled={i === 0 || acting === l.id} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button><button onClick={() => move(l, 1)} disabled={i === links.length - 1 || acting === l.id} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button></div><span className="text-zinc-600">{i + 1}</span></div></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: (l.color || '#8b2df2') + '20' }}><Icon className="w-4 h-4" style={{ color: l.color || '#8b2df2' }} /></div><span className="font-medium text-zinc-900">{l.platform}</span></div></td>
                    <td className="px-4 py-3 text-zinc-600">{l.handle || '—'}</td>
                    <td className="px-4 py-3"><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[#8b2df2] hover:underline inline-flex items-center gap-1 max-w-[220px] truncate">{l.url} <ExternalLink className="w-3 h-3 shrink-0" /></a></td>
                    <td className="px-4 py-3"><button onClick={() => toggleVisible(l)} disabled={acting === l.id} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${l.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{l.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {l.enabled ? 'Visible' : 'Hidden'}</button></td>
                    <td className="px-4 py-3 text-right"><div className="inline-flex items-center gap-1"><button onClick={() => openEdit(l)} className="p-1.5 text-zinc-400 hover:text-[#8b2df2]"><Pencil className="w-4 h-4" /></button><button onClick={() => remove(l)} disabled={acting === l.id} className="p-1.5 text-zinc-400 hover:text-red-600">{acting === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}