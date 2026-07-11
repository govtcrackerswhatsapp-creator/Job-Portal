import { useAuth } from '../contexts/AuthContext';
import { Briefcase, LogIn } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-[#f5f5f7] px-4">
      <div className="flex items-center gap-2">
        <Briefcase className="w-8 h-8 text-[#8b2df2]" />
        <span className="font-heading text-2xl font-bold">
          <span className="text-zinc-900">Tec</span>
          <span className="bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">Kosh</span>
        </span>
      </div>
      <div className="text-center max-w-lg">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold text-zinc-900 tracking-tight">
          Your gateway to the latest job notifications
        </h1>
        <p className="mt-4 text-lg text-zinc-500">
          Sign in to browse government, corporate, and internship opportunities.
        </p>
      </div>
      <button
        onClick={handleSignIn}
        className="inline-flex items-center gap-3 bg-white border border-zinc-200 shadow-soft hover:shadow-soft-hover rounded-full px-6 py-3 font-medium text-zinc-700 transition-all"
      >
        <LogIn className="w-5 h-5 text-[#8b2df2]" />
        Sign in with Google
      </button>
    </div>
  );
}