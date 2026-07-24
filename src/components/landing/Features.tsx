import { Bell, FileText, BookOpen, Clock, Shield, Star, Zap, Award, Users, TrendingUp, LucideIcon } from 'lucide-react';
import { LandingSettings } from '../../types';

const ICON_MAP: Record<string, LucideIcon> = {
  bell: Bell, 'file-text': FileText, 'book-open': BookOpen, clock: Clock,
  shield: Shield, star: Star, zap: Zap, award: Award, users: Users, 'trending-up': TrendingUp,
};
const COLORS = ['#8b2df2', '#00b4d8', '#f43f5e', '#f59e0b', '#10b981', '#6366f1'];

export default function Features({ settings }: { settings: LandingSettings }) {
  if (!settings.features || settings.features.length === 0) return null;
  return (
    <section className="max-w-5xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Why {settings.brandNameStart}{settings.brandNameEnd}</p>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">{settings.featuresTitle}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {settings.features.map((f, i) => {
          const Icon = ICON_MAP[f.icon] || Bell;
          const color = COLORS[i % COLORS.length];
          return (
            <div key={i} className="bg-white rounded-2xl shadow-soft hover:shadow-soft-hover transition p-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${color}15` }}>
                <Icon className="w-6 h-6" style={{ color }} />
              </div>
              <h3 className="font-heading text-lg font-semibold text-zinc-900 mb-1">{f.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{f.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}