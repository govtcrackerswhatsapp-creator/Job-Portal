import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LandingSettings, LandingFeature, FooterLink, Review } from '../types';
import { DEFAULT_LANDING, clearLandingCache } from '../lib/landingSettings';
import { Loader2, Save, Plus, Trash2, CheckCircle2, ExternalLink, Image as ImageIcon, ArrowUp, ArrowDown, Link as LinkIcon, Star } from 'lucide-react';

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
function ColorField({ label, value, onChange, allowClear = false }: { label: string; value: string; onChange: (v: string) => void; allowClear?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-zinc-200 bg-white cursor-pointer p-0.5" />
        <input className={inputCls + ' flex-1'} value={value} onChange={(e) => onChange(e.target.value)} placeholder="#000000" />
        {allowClear && value ? <button onClick={() => onChange('')} className="text-xs text-zinc-500 hover:text-zinc-800 underline shrink-0">Default</button> : null}
      </div>
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

  const links = form.footerLinks || [];
  const updateLink = (i: number, key: keyof FooterLink, value: string) => { const arr = [...links]; arr[i] = { ...arr[i], [key]: value }; set('footerLinks', arr); };
  const addLink = () => set('footerLinks', [...links, { label: '', url: '' }]);
  const removeLink = (i: number) => { const arr = [...links]; arr.splice(i, 1); set('footerLinks', arr); };
  const moveLink = (i: number, dir: -1 | 1) => {
    const arr = [...links]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; set('footerLinks', arr);
  };

  const reviews = form.reviews || [];
  const updateReview = (i: number, key: keyof Review, value: string | number) => { const arr = [...reviews]; arr[i] = { ...arr[i], [key]: value }; set('reviews', arr); };
  const addReview = () => set('reviews', [...reviews, { name: '', title: '', stars: 5, text: '' }]);
  const removeReview = (i: number) => { const arr = [...reviews]; arr.splice(i, 1); set('reviews', arr); };
  const moveReview = (i: number, dir: -1 | 1) => {
    const arr = [...reviews]; const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; set('reviews', arr);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const cleaned = {
        ...form,
        features: form.features.filter((f) => f.title.trim() || f.description.trim()),
        heroImages: (form.heroImages || []).filter((u) => u.trim()),
        heroImageInterval: Math.max(1, Number(form.heroImageInterval) || 5),
        heroOverlayOpacity: Math.min(100, Math.max(0, Number(form.heroOverlayOpacity) || 0)),
        heroBlur: Math.max(0, Number(form.heroBlur) || 0),
        heroMinHeight: Math.max(300, Number(form.heroMinHeight) || 520),
        heroPaddingY: Math.max(0, Number(form.heroPaddingY) || 64),
        logoSizeNav: Math.max(16, Math.min(72, Number(form.logoSizeNav) || 32)),
        logoSizeFooter: Math.max(16, Math.min(72, Number(form.logoSizeFooter) || 28)),
        reviews: (form.reviews || []).filter((r) => r.name.trim() && r.text.trim()).map((r) => ({ ...r, stars: Math.max(1, Math.min(5, Number(r.stars) || 5)) })),
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
        <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#8b2df2] hover:underline"><ExternalLink className="w-4 h-4" /> Preview</a>
      </div>

      <div className="space-y-4">
        <Section title="Branding">
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label="Brand name (first part)"><input className={inputCls} value={form.brandNameStart} onChange={(e) => set('brandNameStart', e.target.value)} placeholder="Tec" /></Row>
            <Row label="Brand name (second part)"><input className={inputCls} value={form.brandNameEnd} onChange={(e) => set('brandNameEnd', e.target.value)} placeholder="Kosh" /></Row>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <ColorField label="First part color" value={form.brandColorStart} onChange={(v) => set('brandColorStart', v)} />
            <ColorField label="Second part color" value={form.brandColorEnd} onChange={(v) => set('brandColorEnd', v)} />
          </div>
          <p className="text-xs text-zinc-400">Preview: <span style={{ color: form.brandColorStart || '#18181b', fontWeight: 700 }}>{form.brandNameStart}</span><span style={{ color: form.brandColorEnd || '#8b2df2', fontWeight: 700 }}>{form.brandNameEnd}</span></p>
        </Section>

        <Section title="Brand Logo">
          <p className="text-xs text-zinc-500">Paste an image URL (host it free on ImgBB, filename with no spaces/special characters). If set, it replaces the default icon before your brand name — in both the nav and footer.</p>
          <Row label="Logo image URL (blank = use default icon)"><input className={inputCls} value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://i.ibb.co/..." /></Row>
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label={`Logo size in navigation (${form.logoSizeNav ?? 32}px)`}><input type="range" min="16" max="72" className="w-full accent-[#8b2df2]" value={form.logoSizeNav ?? 32} onChange={(e) => set('logoSizeNav', Number(e.target.value))} /></Row>
            <Row label={`Logo size in footer (${form.logoSizeFooter ?? 28}px)`}><input type="range" min="16" max="72" className="w-full accent-[#8b2df2]" value={form.logoSizeFooter ?? 28} onChange={(e) => set('logoSizeFooter', Number(e.target.value))} /></Row>
          </div>
        </Section>

        <Section title="Navigation Bar">
          <p className="text-xs text-zinc-500">Leave colors on "Default" to keep the current translucent white nav.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <ColorField label="Nav background color" value={form.navBgColor} onChange={(v) => set('navBgColor', v)} allowClear />
            <ColorField label="Nav text / button color" value={form.navTextColor} onChange={(v) => set('navTextColor', v)} allowClear />
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
          <p className="text-xs text-zinc-500">Paste image URLs (host them free on ImgBB, Postimages, etc.). Filenames must have no spaces or special characters. Multiple images rotate as a carousel. Leave empty for a clean gradient.</p>
          <Row label="Seconds between image changes"><input type="number" min="1" className={inputCls + ' w-40'} value={form.heroImageInterval} onChange={(e) => set('heroImageInterval', Number(e.target.value))} /></Row>
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <Row label={`Image fade / overlay (${form.heroOverlayOpacity ?? 40}%) — lower = clearer image`}><input type="range" min="0" max="100" className="w-full accent-[#8b2df2]" value={form.heroOverlayOpacity ?? 40} onChange={(e) => set('heroOverlayOpacity', Number(e.target.value))} /></Row>
            <Row label={`Image blur (${form.heroBlur ?? 0}px) — 0 = crisp`}><input type="range" min="0" max="12" className="w-full accent-[#8b2df2]" value={form.heroBlur ?? 0} onChange={(e) => set('heroBlur', Number(e.target.value))} /></Row>
            <Row label="Image focus (which part stays visible)"><select className={inputCls} value={form.heroImagePosition || 'center'} onChange={(e) => set('heroImagePosition', e.target.value)}><option value="center">Center</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></Row>
            <Row label={`Hero height (${form.heroMinHeight ?? 520}px)`}><input type="range" min="360" max="800" step="20" className="w-full accent-[#8b2df2]" value={form.heroMinHeight ?? 520} onChange={(e) => set('heroMinHeight', Number(e.target.value))} /></Row>
            <Row label={`Vertical padding (${form.heroPaddingY ?? 64}px)`}><input type="range" min="16" max="160" step="4" className="w-full accent-[#8b2df2]" value={form.heroPaddingY ?? 64} onChange={(e) => set('heroPaddingY', Number(e.target.value))} /></Row>
          </div>
          <div className="space-y-2 pt-2">
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
                  <select className={inputCls + ' w-32'} value={f.icon} onChange={(e) => updateFeature(i, 'icon', e.target.value)}>{ICON_OPTIONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}</select>
                  <input className={inputCls + ' flex-1'} value={f.title} onChange={(e) => updateFeature(i, 'title', e.target.value)} placeholder="Feature title" />
                  <button onClick={() => removeFeature(i)} className="p-2 text-red-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
                <textarea className={inputCls} rows={2} value={f.description} onChange={(e) => updateFeature(i, 'description', e.target.value)} placeholder="Feature description" />
              </div>
            ))}
            <button onClick={addFeature} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Feature</button>
          </div>
        </Section>

        <Section title="Reviews Section">
          <p className="text-xs text-zinc-500">Add review cards. Shows as a grid on the landing page. Leave empty to hide the section.</p>
          <Row label="Section heading"><input className={inputCls} value={form.reviewsTitle} onChange={(e) => set('reviewsTitle', e.target.value)} placeholder="Trusted by job seekers" /></Row>
          <div className="space-y-3 pt-1">
            {reviews.map((r, i) => (
              <div key={i} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100 space-y-2">
                <div className="flex items-center gap-2">
                  <input className={inputCls + ' flex-1'} value={r.name} onChange={(e) => updateReview(i, 'name', e.target.value)} placeholder="Reviewer name" />
                  <input className={inputCls + ' flex-1'} value={r.title} onChange={(e) => updateReview(i, 'title', e.target.value)} placeholder="Title / role" />
                  <button onClick={() => moveReview(i, -1)} disabled={i === 0} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => moveReview(i, 1)} disabled={i === reviews.length - 1} className="p-1.5 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  <button onClick={() => removeReview(i)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Stars:</span>
                  <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => updateReview(i, 'stars', n)} className="p-0.5"><Star className={`w-5 h-5 ${n <= (r.stars || 5) ? 'text-amber-400 fill-current' : 'text-zinc-300'}`} /></button>)}</div>
                </div>
                <textarea className={inputCls} rows={2} value={r.text} onChange={(e) => updateReview(i, 'text', e.target.value)} placeholder="Review text..." />
              </div>
            ))}
            <button onClick={addReview} className="inline-flex items-center gap-1 text-sm font-medium text-[#8b2df2] hover:underline"><Plus className="w-4 h-4" /> Add Review</button>
          </div>
        </Section>

        <Section title="Footer">
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label="Contact email (blank = hidden)"><input className={inputCls} value={form.footerContactEmail} onChange={(e) => set('footerContactEmail', e.target.value)} placeholder="support@example.com" /></Row>
            <Row label="Contact phone (blank = hidden)"><input className={inputCls} value={form.footerContactPhone} onChange={(e) => set('footerContactPhone', e.target.value)} placeholder="+91 98765 43210" /></Row>
          </div>
          <Row label="Copyright text"><input className={inputCls} value={form.footerCopyright} onChange={(e) => set('footerCopyright', e.target.value)} /></Row>
          <div className="pt-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">Footer Links</label>
            <p className="text-xs text-zinc-500 mb-2">Add links like "Privacy Policy", "Refund Policy", "About Us". Set the visible text and the URL where the document is hosted. Opens in a new tab.</p>
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
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-soft hover:opacity-90 transition disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes</button>
          {saved ? <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Saved!</span> : null}
          <button onClick={resetDefaults} className="text-sm text-zinc-500 hover:text-zinc-800 ml-auto">Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}