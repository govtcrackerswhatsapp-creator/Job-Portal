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

  const Brand = ({ dark = false }: { dark?: boolean }) => (
    <div className="flex items-center gap-2">
      <Briefcase className="w-7 h-7 text-[#8b2df2]" />
      <span className="font-heading text-xl font-bold">
        <span className={dark ? 'text-white' : 'text-zinc-900'}>{settings.brandNameStart}</span>
        <span className="bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">{settings.brandNameEnd}</span>
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Brand />
          <button
            onClick={handleSignIn}
            className="inline-flex items-center gap-2 bg-white border border-zinc-200 shadow-soft hover:shadow-soft-hover rounded-full px-5 py-2 text-sm font-medium text-zinc-700 transition"
          >
            <LogIn className="w-4 h-4 text-[#8b2df2]" /> Sign in with Google
          </button>
        </div>
      </header>

      <Hero settings={settings} onSignIn={handleSignIn} />
      <Features settings={settings} />
      <PlansPreview onSignIn={handleSignIn} />

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-10">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center mb-4"><Brand dark /></div>

          {/* Contact — each hidden if blank */}
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

          {/* Policy links — hidden if blank */}
          {(settings.privacyUrl || settings.termsUrl) && (
            <div className="flex items-center justify-center gap-5 mb-4 text-sm">
              {settings.privacyUrl && <a href={settings.privacyUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Privacy Policy</a>}
              {settings.termsUrl && <a href={settings.termsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Terms of Service</a>}
            </div>
          )}

          <p className="text-sm">{settings.footerCopyright}</p>
        </div>
      </footer>
    </div>
  );
}