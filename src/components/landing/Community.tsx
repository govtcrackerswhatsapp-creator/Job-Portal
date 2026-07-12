import { useEffect, useState } from 'react';
import { SocialLink, LandingSettings } from '../../types';
import { getVisibleSocialLinks } from '../../lib/socialData';
import { socialIconFor } from '../../lib/socialIcons';
import { Loader2, Share2, ExternalLink, ArrowUpRight } from 'lucide-react';

export default function Community({ settings }: { settings: LandingSettings }) {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await getVisibleSocialLinks(); // cached
        setLinks(list);
        if (list.length > 0) setSelectedId(list[0].id || null);
      } catch (e) {
        console.error('Error loading social links:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!loading && links.length === 0) return null;
  const selected = links.find((l) => l.id === selectedId) || links[0] || null;
  const accent = selected?.color || '#8b2df2';

  return (
    <section id="community" className="max-w-6xl mx-auto px-4 py-20 scroll-mt-24">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <div className="lg:col-span-7 relative flex items-center justify-center p-12 rounded-3xl min-h-[380px] overflow-hidden bg-gradient-to-b from-white to-[#f5f5f7] border border-black/5 shadow-soft">
          {loading ? <Loader2 className="w-8 h-8 text-[#8b2df2] animate-spin" /> : selected ? (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-72 h-72 rounded-full blur-[100px] opacity-20 transition-all duration-700" style={{ backgroundColor: accent }} /></div>
              <div className="relative z-10 flex flex-col items-center text-center">
                {(() => { const Icon = socialIconFor(selected.icon); return <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-5 shadow-lg transition-all duration-500" style={{ backgroundColor: accent }}><Icon className="w-11 h-11 text-white" /></div>; })()}
                <h3 className="font-heading text-2xl font-bold text-zinc-900 mb-1">{selected.platform}</h3>
                {selected.handle ? <p className="text-sm font-semibold mb-3" style={{ color: accent }}>{selected.handle}</p> : null}
                {selected.description ? <p className="text-zinc-600 text-sm max-w-sm mb-6 leading-relaxed">{selected.description}</p> : null}
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-md hover:scale-[1.03] transition-all" style={{ backgroundColor: accent }}>Visit {selected.platform} <ExternalLink className="w-4 h-4" /></a>
              </div>
            </>
          ) : null}
        </div>
        <div className="lg:col-span-5 flex flex-col justify-center">
          <span className="text-xs font-bold uppercase tracking-[0.15em] mb-3 block" style={{ color: accent }}>Stay connected</span>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight mb-4">{settings.communityTitle}</h2>
          {settings.communitySubtext ? <p className="text-zinc-600 mb-8 leading-relaxed">{settings.communitySubtext}</p> : null}
          <div className="flex flex-wrap gap-3">
            {loading ? <Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /> : links.map((link) => {
              const Icon = socialIconFor(link.icon);
              const isActive = selected?.id === link.id;
              return <button key={link.id} onClick={() => setSelectedId(link.id || null)} title={link.platform} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 border-2 ${isActive ? 'scale-110 shadow-lg' : 'hover:scale-105 bg-white'}`} style={isActive ? { backgroundColor: link.color || '#8b2df2', borderColor: link.color || '#8b2df2' } : { borderColor: '#e4e4e7' }}><Icon className="w-6 h-6" style={{ color: isActive ? '#ffffff' : (link.color || '#71717a') }} /></button>;
            })}
          </div>
          {selected ? <div className="mt-8 text-sm font-semibold text-zinc-800 bg-zinc-100/80 border border-zinc-200 px-4 py-2.5 rounded-xl inline-flex items-center gap-2 self-start"><Share2 className="w-4 h-4" style={{ color: accent }} /> Currently viewing: <span className="uppercase tracking-wider" style={{ color: accent }}>{selected.platform}</span> <ArrowUpRight className="w-4 h-4 text-zinc-400" /></div> : null}
        </div>
      </div>
    </section>
  );
}