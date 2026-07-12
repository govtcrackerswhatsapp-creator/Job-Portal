import { Star } from 'lucide-react';
import { LandingSettings } from '../../types';

export default function Reviews({ settings }: { settings: LandingSettings }) {
  const reviews = (settings.reviews || []).filter((r) => r.text.trim() && r.name.trim());
  if (reviews.length === 0) return null; // hide section until admin adds reviews

  return (
    <section id="reviews" className="bg-white py-16 scroll-mt-24">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Success stories</p>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">{settings.reviewsTitle}</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.map((r, i) => {
            const stars = Math.max(1, Math.min(5, r.stars || 5));
            return (
              <div key={i} className="bg-[#f5f5f7] rounded-2xl p-6 flex flex-col">
                <div className="flex gap-1 mb-3 text-amber-400">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} className={`w-4 h-4 ${s < stars ? 'fill-current' : 'text-zinc-300'}`} />
                  ))}
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed flex-1">"{r.text}"</p>
                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-zinc-200">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8b2df2] to-[#00b4d8] flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 text-sm truncate">{r.name}</p>
                    {r.title && <p className="text-xs text-zinc-500 truncate">{r.title}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}