import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LandingSettings } from '../../types';

export default function Hero({ settings }: { settings: LandingSettings }) {
  const desktopImages = (settings.heroImages || []).filter((u) => u.trim());
  const mobileImagesRaw = (settings.heroImagesMobile || []).filter((u) => u.trim());
  const [isMobile, setIsMobile] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // On mobile, use mobile images if provided, else fall back to the desktop images.
  const images = isMobile && mobileImagesRaw.length > 0 ? mobileImagesRaw : desktopImages;

  useEffect(() => {
    setCurrent(0);
  }, [isMobile, images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = Math.max(1, settings.heroImageInterval || 5) * 1000;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % images.length), interval);
    return () => clearInterval(timer);
  }, [images.length, settings.heroImageInterval]);

  const hasImages = images.length > 0;
  const overlay = Math.min(100, Math.max(0, settings.heroOverlayOpacity ?? 40)) / 100;
  const blur = Math.max(0, settings.heroBlur ?? 0);
  const position = settings.heroImagePosition || 'center';
  const minHeight = settings.heroMinHeight ?? 520;
  const padY = settings.heroPaddingY ?? 64;

  return (
    <section className="relative overflow-hidden flex items-center" style={{ minHeight: `${minHeight}px` }}>
      {hasImages && (
        <div className="absolute inset-0">
          {images.map((url, i) => (
            <div
              key={i}
              className="absolute inset-0 bg-cover transition-opacity duration-1000"
              style={{ backgroundImage: `url("${url}")`, backgroundPosition: position, opacity: i === current ? 1 : 0 }}
            />
          ))}
          {/* Adjustable overlay for text readability */}
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(255,255,255,${overlay})`, backdropFilter: blur ? `blur(${blur}px)` : undefined }} />
        </div>
      )}
      {!hasImages && <div className="absolute inset-0 bg-gradient-to-b from-[#8b2df2]/5 to-transparent pointer-events-none" />}

      <div className="relative max-w-5xl mx-auto px-4 text-center w-full" style={{ paddingTop: `${padY}px`, paddingBottom: `${padY}px` }}>
        {settings.heroBadge && (
          <div className="inline-flex items-center gap-2 bg-[#8b2df2]/10 text-[#8b2df2] rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> {settings.heroBadge}
          </div>
        )}
        <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-zinc-900 tracking-tight leading-[1.1] drop-shadow-sm">
          {settings.heroHeadline}
          {settings.heroHeadlineAccent && (
            <span className="block bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] bg-clip-text text-transparent">{settings.heroHeadlineAccent}</span>
          )}
        </h1>
        {settings.heroSubtext && (
          <p className="mt-6 text-lg text-zinc-700 max-w-2xl mx-auto">{settings.heroSubtext}</p>
        )}

        {images.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {images.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`w-2 h-2 rounded-full transition ${i === current ? 'bg-[#8b2df2] w-6' : 'bg-zinc-400/60'}`} aria-label={`Slide ${i + 1}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}