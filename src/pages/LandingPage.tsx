import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Briefcase, Mail, Phone } from 'lucide-react';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import PlansPreview from '../components/landing/PlansPreview';
import Community from '../components/landing/Community';
import Reviews from '../components/landing/Reviews';
import { LandingSettings } from '../types';
import { DEFAULT_LANDING, loadLandingSettings } from '../lib/landingSettings';

const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'community', label: 'Community' },
  { id: 'reviews', label: 'Reviews' },
];

function GoogleG({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export default function LandingPage() {
  const { signInWithGoogle } = useAuth();
  const [settings, setSettings] = useState<LandingSettings>(DEFAULT_LANDING);
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => { loadLandingSettings().then(setSettings); }, []);

  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.id);
    const onScroll = () => {
      let current = 'home';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [settings]);

  const handleSignIn = async () => {
    try { await signInWithGoogle(); } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') console.error('Sign-in error:', error);
    }
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasLogo = !!settings.logoUrl?.trim();

  const Brand = ({ logoSize, dark = false }: { logoSize: number; dark?: boolean }) => (
    <div className="flex items-center gap-2">
      {hasLogo ? (
        <img src={settings.logoUrl} alt="Logo" style={{ height: `${logoSize}px`, width: 'auto' }} className="object-contain" />
      ) : (
        <Briefcase className="w-7 h-7 text-[#8b2df2]" />
      )}
      <span className="font-heading text-xl font-bold">
        <span style={{ color: settings.brandColorStart || (dark ? '#ffffff' : '#18181b') }}>{settings.brandNameStart}</span>
        <span style={{ color: settings.brandColorEnd || '#8b2df2' }}>{settings.brandNameEnd}</span>
      </span>
    </div>
  );

  const footerLinks = (settings.footerLinks || []).filter((l) => l.label.trim() && l.url.trim());

  const navHasCustomBg = !!settings.navBgColor?.trim();
  const navStyle: React.CSSProperties = navHasCustomBg ? { backgroundColor: settings.navBgColor } : {};
  const navClass = navHasCustomBg
    ? 'sticky top-0 z-30 border-b border-black/5'
    : 'sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-zinc-100';
  const navTextColor = settings.navTextColor?.trim() || '';

  // Sign-in button styling (separate from nav text)
  const btnBg = settings.signInBtnBgColor?.trim();
  const btnText = settings.signInBtnTextColor?.trim();
  const btnLabel = settings.signInButtonText?.trim() || 'Sign in';
  const btnStyle: React.CSSProperties = {};
  if (btnBg) { btnStyle.backgroundColor = btnBg; btnStyle.borderColor = btnBg; }
  if (btnText) btnStyle.color = btnText;

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className={navClass} style={navStyle}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => scrollTo('home')} className="shrink-0"><Brand logoSize={settings.logoSizeNav ?? 32} /></button>

          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((l) => (
              <button key={l.id} onClick={() => scrollTo(l.id)} className="text-sm font-medium transition-colors relative py-1" style={{ color: navTextColor || (activeSection === l.id ? '#8b2df2' : '#52525b') }}>
                {l.label}
                <span className={`absolute -bottom-0.5 left-0 h-[2px] bg-[#8b2df2] transition-all duration-300 ${activeSection === l.id ? 'w-full' : 'w-0'}`} />
              </button>
            ))}
          </nav>

          <button onClick={handleSignIn} className="inline-flex items-center gap-1.5 bg-white border border-zinc-200 shadow-soft hover:shadow-soft-hover rounded-full px-3.5 py-1.5 text-sm font-medium text-zinc-700 transition shrink-0" style={btnStyle}>
            <GoogleG size={16} /> {btnLabel}
          </button>
        </div>
      </header>

      <div id="home"><Hero settings={settings} /></div>
      <Features settings={settings} />
      <div id="pricing"><PlansPreview onSignIn={handleSignIn} /></div>
      <Community settings={settings} />
      <Reviews settings={settings} />

      <footer className="bg-zinc-900 text-zinc-400 py-10">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center mb-4"><Brand logoSize={settings.logoSizeFooter ?? 28} dark /></div>
          {(settings.footerContactEmail || settings.footerContactPhone) && (
            <div className="flex items-center justify-center gap-6 mb-4 flex-wrap text-sm">
              {settings.footerContactEmail && <a href={`mailto:${settings.footerContactEmail}`} className="inline-flex items-center gap-1.5 hover:text-white transition"><Mail className="w-4 h-4" /> {settings.footerContactEmail}</a>}
              {settings.footerContactPhone && <a href={`tel:${settings.footerContactPhone}`} className="inline-flex items-center gap-1.5 hover:text-white transition"><Phone className="w-4 h-4" /> {settings.footerContactPhone}</a>}
            </div>
          )}
          {footerLinks.length > 0 && (
            <div className="flex items-center justify-center gap-5 mb-4 flex-wrap text-sm">
              {footerLinks.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">{l.label}</a>)}
            </div>
          )}
          <p className="text-sm">{settings.footerCopyright}</p>
        </div>
      </footer>
    </div>
  );
}