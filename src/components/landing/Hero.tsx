import { ArrowRight, Sparkles } from 'lucide-react';

export default function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#8b2df2]/5 to-transparent pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-[#8b2df2]/10 text-[#8b2df2] rounded-full px-4 py-1.5 text-sm font-medium mb-6">
          <Sparkles className="w-4 h-4" /> Never miss a job notification again
        </div>
        <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-zinc-900 tracking-tight leading-[1.1]">
          Your gateway to the latest
          <span className="block bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">government & private jobs</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-500 max-w-2xl mx-auto">
          Get exam details, study material, eligibility, and application dates for every opportunity — all in one place, updated daily.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={onSignIn}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-7 py-3.5 font-semibold shadow-soft hover:opacity-90 transition text-base"
          >
            Get Started Free <ArrowRight className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-4 text-sm text-zinc-400">Sign in with Google — free to browse.</p>
      </div>
    </section>
  );
}