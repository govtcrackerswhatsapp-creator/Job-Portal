import { Instagram, Facebook, Twitter, Youtube, Linkedin, Github, Send, MessageCircle, Globe, Mail, Link as LinkIcon } from 'lucide-react';
import { LandingSettings } from '../../types';

const ICON_MAP: Record<string, any> = {
  instagram: Instagram, facebook: Facebook, twitter: Twitter, youtube: Youtube,
  linkedin: Linkedin, github: Github, telegram: Send, whatsapp: MessageCircle,
  globe: Globe, mail: Mail,
};

export default function Community({ settings }: { settings: LandingSettings }) {
  const links = (settings.communityLinks || []).filter((l) => l.platform.trim() && l.url.trim());
  if (links.length === 0) return null;

  return (
    <section id="community" className="max-w-5xl mx-auto px-4 py-16 scroll-mt-24">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Stay connected</p>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">{settings.communityTitle}</h2>
        {settings.communitySubtext ? <p className="text-zinc-500 mt-2 max-w-xl mx-auto">{settings.communitySubtext}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {links.map((link, i) => {
          const Icon = ICON_MAP[link.icon] || LinkIcon;
          return (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" title={link.platform} className="group flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-soft hover:shadow-soft-hover border border-zinc-100 flex items-center justify-center text-zinc-600 group-hover:text-[#8b2df2] group-hover:-translate-y-1 transition-all">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-800 transition">{link.handle || link.platform}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}