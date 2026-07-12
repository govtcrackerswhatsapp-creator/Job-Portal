import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Briefcase, LogIn, Mail, Phone } from 'lucide-react';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import PlansPreview from '../components/landing/PlansPreview';
import { LandingSettings } from '../types';
import { DEFAULT_LANDING, loadLandingSettings } from '../lib/landingSettings';

export default function LandingPage() {
  const { signInWithGoogle } = useAuth();
  const [settings, setSettings] = useState<LandingSettings>(DEFAULT_LANDING);

  useEffect(() => {
    loadLandingSettings().then(setSettings);
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', error);
      }
    }
  };

  const hasLogo = !!settings.logoUrl?.trim();

  // Brand block, used in nav and footer. `logoSize` and `dark` differ per location.
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

  // Nav styling: use admin colors if set, else keep the default translucent white nav.
  const navHasCustomBg = !!settings.navBgColor?.trim();
  const navStyle: React.CSSProperties = navHasCustomBg ? { backgroundColor: settings.navBgColor } : {};
  const navClass = navHasCustomBg
    ? 'sticky top-0 z-30 border-b border-black/5'
    : 'sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-zinc-100';
  const navTextColor = settings.navTextColor?.trim() || '';

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Nav */}
      <header className={navClass} style={navStyle}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Brand logoSize={settings.logoSizeNav ?? 32} />
          <button
            onClick={handleSignIn}
            className="inline-flex items-center gap-2 bg-white border border-zinc-200 shadow-soft hover:shadow-soft-hover rounded-full px-5 py-2 text-sm font-medium text-zinc-700 transition"
            style={navTextColor ? { color: navTextColor } : undefined}
          >
            <LogIn className="w-4 h-4" style={{ color: navTextColor || '#8b2df2' }} /> Sign in with Google
          </button>
        </div>
      </header>

      <Hero settings={settings} />
      <Features settings={settings} />
      <PlansPreview onSignIn={handleSignIn} />

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-10">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center mb-4"><Brand logoSize={settings.logoSizeFooter ?? 28} dark /></div>

          {(settings.footerContactEmail || settings.footerContactPhone) && (
            <div className="flex items-center justify-center gap-6 mb-4 flex-wrap text-sm">
              {settings.footerContactEmail && (
                <a href={`mailto:${settings.footerContactEmail}`} className="inline-flex items-center gap-1.5 hover:text-white transition">
                  <Mail className="w-4 h-4" /> {settings.footerContactEmail}
                </a>
              )}
              {settings.footerContactPhone && (
                <a href={`tel:${settings.footerContactPhone}`} className="inline-flex items-center gap-1.5 hover:text-white transition">
                  <Phone className="w-4 h-4" /> {settings.footerContactPhone}
                </a>
              )}
            </div>
          )}

          {footerLinks.length > 0 && (
            <div className="flex items-center justify-center gap-5 mb-4 flex-wrap text-sm">
              {footerLinks.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">{l.label}</a>
              ))}
            </div>
          )}

          <p className="text-sm">{settings.footerCopyright}</p>
        </div>
      </footer>
    </div>
  );
}