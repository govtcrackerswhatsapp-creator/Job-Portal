import { useAuth } from '../contexts/AuthContext';
import { Briefcase, LogIn } from 'lucide-react';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import PlansPreview from '../components/landing/PlansPreview';

export default function LandingPage() {
  const { signInWithGoogle } = useAuth();

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-[#8b2df2]" />
            <span className="font-heading text-xl font-bold">
              <span className="text-zinc-900">Tec</span>
              <span className="bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">Kosh</span>
            </span>
          </div>
          <button
            onClick={handleSignIn}
            className="inline-flex items-center gap-2 bg-white border border-zinc-200 shadow-soft hover:shadow-soft-hover rounded-full px-5 py-2 text-sm font-medium text-zinc-700 transition"
          >
            <LogIn className="w-4 h-4 text-[#8b2df2]" /> Sign in with Google
          </button>
        </div>
      </header>

      <Hero onSignIn={handleSignIn} />
      <Features />
      <PlansPreview onSignIn={handleSignIn} />

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-10">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Briefcase className="w-6 h-6 text-[#8b2df2]" />
            <span className="font-heading text-lg font-bold text-white">TecKosh</span>
          </div>
          <p className="text-sm">© 2026 TecKosh. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}