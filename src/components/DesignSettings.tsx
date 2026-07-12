import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LandingSettings, LandingFeature, FooterLink } from '../types';
import { DEFAULT_LANDING, clearLandingCache } from '../lib/landingSettings';
import { Loader2, Save, Plus, Trash2, CheckCircle2, ExternalLink, Image as ImageIcon, ArrowUp, ArrowDown, Link as LinkIcon } from 'lucide-react';

const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#8b2df2]/30 focus:border-[#8b2df2] bg-white';
const ICON_OPTIONS = ['bell', 'file-text', 'book-open', 'clock', 'shield', 'star', 'zap', 'award', 'users', 'trending-up'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-100 rounded-xl p-5">
      <h3 className="font-heading text-base font-semibold text-zinc-900 mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function DesignSettings() {
  const [form, setForm] = useState<LandingSettings>(DEFAULT_LANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'landing'));
        if (snap.exists()) setForm({ ...DEFAULT_LANDING, ...(snap.data() as Partial<LandingSettings>) });
      } catch (e) {
        console.error('Error loading design settings:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof LandingSettings>(key: K, value: LandingSettings[K]) => setForm((f) => ({ ...f, [key]: value }));

  const updateFeature = (i: number, key: keyof LandingFeature, value: string) => {
    const features = [...form.features];
    features[i] = { ...features[i], [key]: value };
    set('features', features);
  };
  const addFeature = () => set('features', [...form.features, { icon: 'star', title: 'New Feature', description: 'Describe this feature.' }]);
  const removeFeature = (i: number) => { const f = [...form.features]; f.splice(i, 1); set('features', f); };

  const images = form.heroImages || [];
  const updateImage = (i: number, value: string) => { const arr = [...images]; arr[i] = value; set('heroImages', arr); };
  const addImage = () => set('heroImages', [...images, '']);
  const removeImage = (i: number) => { const arr = [...images]; arr.splice(i, 1); set('heroImages', arr); };
  const moveImage = (i: number, dir: -1 | 1) => {
    const arr = [...images]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; set('heroImages', arr);
  };

  // Footer links
  const links = form.footerLinks || [];
  const updateLink = (i: number, key: keyof FooterLink, value: string) => {
    const arr = [...links]; arr[i] = { ...arr[i], [key]: value }; set('footerLinks', arr);
  };
  const addLink = () => set('footerLinks', [...links, { label: '', url: '' }]);
  const removeLink = (i: number) => { const arr = [...links]; arr.splice(i, 1); set('footerLinks', arr); };
  const moveLink = (i: number, dir: -1 | 1) => {
    const arr = [...links]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; set('footerLinks', arr);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const cleaned = {
        ...form,
        features: form.features.filter((f) => f.title.trim() || f.description.trim()),
        heroImages: (form.heroImages || []).filter((u) => u.trim()),
        heroImageInterval: Math.max(1, Number(form.heroImageInterval) || 5),
        footerLinks: (form.footerLinks || []).filter((l) => l.label.trim() && l.url.trim()),
      };
      await setDoc(doc(db, 'settings', 'landing'), cleaned, { merge: true });
      clearLandingCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Error saving design settings:', e);
      alert('Failed to save. Check your permissions.');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (confirm('Reset all landing page content to defaults? This overwrites your current text.')) setForm(DEFAULT_LANDING);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-semibold text-zinc-900">Landing Page Design</h2>
          <p className="text-sm text-zinc-500">Edit what logged-out visitors see. Changes go live after saving.</p>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#8b2df2] hover:underline">
          <ExternalLink className="w-4 h-4" /> Preview
        </a>
      </div>

      <div className="space-y-4">
        <Section title="Branding">
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label="Brand name (first part)"><input className={inputCls} value={form.brandNameStart} onChange={(e) => set('brandNameStart', e.target.value)} placeholder="Tec" /></Row>
            <Row label="Brand name (colored part)"><input className={inputCls} value={form.brandNameEnd} onChange={(e) => set('brandNameEnd', e.target.value)} placeholder="Kosh" /></Row>
          </div>
        </Section>

        <Section title="Hero Section">
          <Row label="Badge text (blank = hidden)"><input className={inputCls} value={form.heroBadge} onChange={(e) => set('heroBadge', e.target.value)} /></Row>
          <Row label="Headline"><input className={inputCls} value={form.heroHeadline} onChange={(e) => set('heroHeadline', e.target.value)} /></Row>
          <Row label="Headline accent (colored line)"><input className={inputCls} value={form.heroHeadlineAccent} onChange={(e) => set('heroHeadlineAccent', e.target.value)} /></Row>
          <Row label="Subtext"><textarea className={inputCls} rows={2} value={form.heroSubtext} onChange={(e) => set('heroSubtext', e.target.value)} /></Row>
          <Row label="Call-to-action button text"><input className={inputCls} value={form.heroCtaText} onChange={(e) => set('heroCtaText', e.target.value)} /></Row>
        </Section>

        <Section title="Hero Background Images (carousel)">
          <p className="text-xs text-zinc-500">Paste image URLs (host them free on ImgBB, Postimages, etc.). Multiple images rotate as a carousel. Leave empty for a clean gradient.</p>
          <Row label="Seconds between image changes">
            <input type="number" min="1" className={inputCls + ' w-40'} value={form.heroImageInterval} onChange={(e) => set('heroImageInterval', Number(e.target.value))} />
          </Row>
          <div className="space-y-2">
            {images.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                <input className={inputCls + ' flex-1'} value={url} onChange={(e) => updateImage(i, e.target.value)} placeholder="https://i.ibb.co/..." />
                <button onClick={() => moveImage(i, -1)} disabled={i === 0} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => removeImage(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button onClick={addImage} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Image URL</button>
          </div>
        </Section>

        <Section title="Features Section">
          <Row label="Section heading"><input className={inputCls} value={form.featuresTitle} onChange={(e) => set('featuresTitle', e.target.value)} /></Row>
          <div className="space-y-3 pt-2">
            {form.features.map((f, i) => (
              <div key={i} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                <div className="flex items-center gap-2 mb-2">
                  <select className={inputCls + ' w-32'} value={f.icon} onChange={(e) => updateFeature(i, 'icon', e.target.value)}>
                    {ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                  <input className={inputCls + ' flex-1'} value={f.title} onChange={(e) => updateFeature(i, 'title', e.target.value)} placeholder="Feature title" />
                  <button onClick={() => removeFeature(i)} className="p-2 text-red-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
                <textarea className={inputCls} rows={2} value={f.description} onChange={(e) => updateFeature(i, 'description', e.target.value)} placeholder="Feature description" />
              </div>
            ))}
            <button onClick={addFeature} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Feature</button>
          </div>
        </Section>

        <Section title="Footer">
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label="Contact email (blank = hidden)"><input className={inputCls} value={form.footerContactEmail} onChange={(e) => set('footerContactEmail', e.target.value)} placeholder="support@example.com" /></Row>
            <Row label="Contact phone (blank = hidden)"><input className={inputCls} value={form.footerContactPhone} onChange={(e) => set('footerContactPhone', e.target.value)} placeholder="+91 98765 43210" /></Row>
          </div>
          <Row label="Copyright text"><input className={inputCls} value={form.footerCopyright} onChange={(e) => set('footerCopyright', e.target.value)} /></Row>

          {/* Footer links — editable label + hosted URL */}
          <div className="pt-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">Footer Links</label>
            <p className="text-xs text-zinc-500 mb-2">Add links like "Privacy Policy", "Refund Policy", "About Us". Set the visible text and the URL where the document is hosted (Google Drive, hosted PDF, etc.). Opens in a new tab.</p>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <LinkIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                  <input className={inputCls + ' sm:w-44'} value={l.label} onChange={(e) => updateLink(i, 'label', e.target.value)} placeholder="Link text (e.g. Privacy Policy)" />
                  <input className={inputCls + ' flex-1'} value={l.url} onChange={(e) => updateLink(i, 'url', e.target.value)} placeholder="https://... (hosted document URL)" />
                  <button onClick={() => moveLink(i, -1)} disabled={i === 0} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveLink(i, 1)} disabled={i === links.length - 1} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => removeLink(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={addLink} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Footer Link</button>
            </div>
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2 sticky bottom-0 bg-white py-3">
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
          </button>
          {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Saved!</span>}
          <button onClick={resetDefaults} className="text-sm text-zinc-500 hover:text-zinc-800 ml-auto">Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}