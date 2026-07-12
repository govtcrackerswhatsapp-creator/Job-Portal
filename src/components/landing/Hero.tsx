import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { LandingSettings } from '../../types';

export default function Hero({ settings, onSignIn }: { settings: LandingSettings; onSignIn: () => void }) {
  const images = (settings.heroImages || []).filter((u) => u.trim());
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = Math.max(1, settings.heroImageInterval || 5) * 1000;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % images.length), interval);
    return () => clearInterval(timer);
  }, [images.length, settings.heroImageInterval]);

  const hasImages = images.length > 0;

  return (
    <section className="relative overflow-hidden">
      {/* Background carousel (if images provided) */}
      {hasImages && (
        <div className="absolute inset-0">
          {images.map((url, i) => (
            <div
              key={i}
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
              style={{ backgroundImage: `url(${url})`, opacity: i === current ? 1 : 0 }}
            />
          ))}
          {/* Overlay so text stays readable over any image */}
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px]" />
        </div>
      )}
      {!hasImages && <div className="absolute inset-0 bg-gradient-to-b from-[#8b2df2]/5 to-transparent pointer-events-none" />}

      <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 text-center">
        {settings.heroBadge && (
          <div className="inline-flex items-center gap-2 bg-[#8b2df2]/10 text-[#8b2df2] rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> {settings.heroBadge}
          </div>
        )}
        <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-zinc-900 tracking-tight leading-[1.1]">
          {settings.heroHeadline}
          {settings.heroHeadlineAccent && (
            <span className="block bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">{settings.heroHeadlineAccent}</span>
          )}
        </h1>
        {settings.heroSubtext && (
          <p className="mt-6 text-lg text-zinc-600 max-w-2xl mx-auto">{settings.heroSubtext}</p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={onSignIn}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white rounded-xl px-7 py-3.5 font-semibold shadow-soft hover:opacity-90 transition text-base"
          >
            {settings.heroCtaText || 'Get Started'} <ArrowRight className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-4 text-sm text-zinc-400">Sign in with Google — free to browse.</p>

        {/* Carousel dots */}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {images.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`w-2 h-2 rounded-full transition ${i === current ? 'bg-[#8b2df2] w-6' : 'bg-zinc-300'}`} aria-label={`Slide ${i + 1}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}