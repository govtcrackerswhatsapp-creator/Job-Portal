import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LandingSettings } from '../../types';

/**
 * Landing hero with a rotating background.
 *
 * TWO PERFORMANCE FIXES LIVE HERE, both about images that were downloading
 * when they had no business doing so:
 *
 * 1. Only the visible slide and the one after it carry a background-image URL.
 *    Previously every slide had one, and opacity:0 does NOT stop a download —
 *    the browser fetched all of them at once, so the image the visitor was
 *    actually looking at competed with every invisible one for bandwidth.
 *
 *    Note the divs all stay MOUNTED regardless. The crossfade works because the
 *    elements persist and only their opacity changes; unmounting the inactive
 *    ones would replace the fade with a hard cut.
 *
 * 2. isMobile is read from the window on the very first render instead of
 *    defaulting to false. It used to start false and flip in an effect, so a
 *    phone rendered the DESKTOP images first and began fetching them before
 *    switching — spending the worst connection's bandwidth twice.
 */
export default function Hero({ settings }: { settings: LandingSettings }) {
  const desktopImages = (settings.heroImages || []).filter((u) => u.trim());
  const mobileImagesRaw = (settings.heroImagesMobile || []).filter((u) => u.trim());

  // Read synchronously on first render — see note 2 above.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [current, setCurrent] = useState(0);

  /**
   * Indices whose background-image URL has been committed. Once primed an index
   * stays primed, so cycling back to a slide never re-triggers a fetch.
   */
  const [primed, setPrimed] = useState<number[]>([0]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // On mobile, use mobile images if provided, else fall back to the desktop images.
  const images = isMobile && mobileImagesRaw.length > 0 ? mobileImagesRaw : desktopImages;

  // Switching between the mobile and desktop sets is a different list of URLs,
  // so the primed indices no longer refer to the same images.
  useEffect(() => {
    setCurrent(0);
    setPrimed([0]);
  }, [isMobile, images.length]);

  /**
   * Prime the visible slide at once, and the following one after a short delay
   * so it never competes with the visible image during the first paint.
   */
  useEffect(() => {
    if (images.length === 0) return;
    setPrimed((prev) => (prev.indexOf(current) !== -1 ? prev : prev.concat(current)));
    if (images.length < 2) return;
    const nextIdx = (current + 1) % images.length;
    const t = setTimeout(() => {
      setPrimed((prev) => (prev.indexOf(nextIdx) !== -1 ? prev : prev.concat(nextIdx)));
    }, 1500);
    return () => clearTimeout(t);
  }, [current, images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = Math.max(1, settings.heroImageInterval || 5) * 1000;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % images.length), interval);
    return () => clearInterval(timer);
  }, [images.length, settings.heroImageInterval]);

  const hasImages = images.length > 0;

  // Pick display settings: mobile controls on phones, desktop controls on larger screens.
  const overlay = Math.min(100, Math.max(0, (isMobile ? settings.heroOverlayOpacityMobile : settings.heroOverlayOpacity) ?? 40)) / 100;
  const blur = Math.max(0, (isMobile ? settings.heroBlurMobile : settings.heroBlur) ?? 0);
  const position = (isMobile ? settings.heroImagePositionMobile : settings.heroImagePosition) || 'center';
  const minHeight = (isMobile ? settings.heroMinHeightMobile : settings.heroMinHeight) ?? 520;
  const padY = (isMobile ? settings.heroPaddingYMobile : settings.heroPaddingY) ?? 64;

  return (
    <section className="relative overflow-hidden flex items-center" style={{ minHeight: `${minHeight}px` }}>
      {/* Always painted, and always behind the images. On a cold load this is
          what fills the hero while the first image is still downloading, so the
          area is never blank. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#8b2df2]/5 to-transparent pointer-events-none" />

      {hasImages && (
        <div className="absolute inset-0">
          {images.map((url, i) => (
            <div
              key={i}
              className="absolute inset-0 bg-cover bg-no-repeat transition-opacity duration-1000"
              style={{
                // Undefined until primed: an unprimed slide is mounted (so the
                // crossfade has something to animate) but has nothing to fetch.
                backgroundImage: primed.indexOf(i) !== -1 ? `url("${url}")` : undefined,
                backgroundPosition: position,
                opacity: i === current ? 1 : 0,
              }}
            />
          ))}
          {/* Adjustable overlay for text readability */}
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(255,255,255,${overlay})`, backdropFilter: blur ? `blur(${blur}px)` : undefined }} />
        </div>
      )}

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