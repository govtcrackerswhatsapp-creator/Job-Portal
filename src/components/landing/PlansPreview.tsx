import { useEffect, useState } from 'react';
import { getPlans } from '../../lib/plansData';
import { SubscriptionPlan, PlanTier } from '../../types';
import { formatRupees } from '../../lib/format';
import { Check, Loader2, Crown } from 'lucide-react';

export default function PlansPreview({ onSignIn }: { onSignIn: () => void }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-plan chosen tier id (display only — the real purchase happens after sign-in).
  const [selectedTier, setSelectedTier] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const all = await getPlans(); // cached
        const active = all.filter((p) => p.active).sort((a, b) => a.price - b.price);
        setPlans(active);
        const defaults: Record<string, string> = {};
        active.forEach((pl) => { if (pl.tiers && pl.tiers.length > 0 && pl.id) defaults[pl.id] = pl.tiers[0].id; });
        setSelectedTier(defaults);
      } catch (e) {
        console.error('Error loading plans:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#8b2df2] animate-spin" /></div>;
  }
  if (plans.length === 0) return null;

  // The tier chosen for a plan (undefined if the plan has no tiers).
  const chosenTier = (p: SubscriptionPlan): PlanTier | undefined => {
    if (!p.tiers || p.tiers.length === 0 || !p.id) return undefined;
    return p.tiers.find((t) => t.id === selectedTier[p.id!]) || p.tiers[0];
  };
  const priceFor = (p: SubscriptionPlan) => { const t = chosenTier(p); return t ? t.price : p.price; };
  const periodFor = (p: SubscriptionPlan) => { const t = chosenTier(p); return t ? t.label : `${p.durationInDays} days`; };
  const tierSaving = (p: SubscriptionPlan, t: PlanTier): string => {
    const base = p.tiers && p.tiers[0];
    const perMonth = t.price / (t.days / 30);
    if (!base || base.id === t.id) return `${t.days} days of access`;
    const pct = Math.round((1 - (t.price / t.days) / (base.price / base.days)) * 100);
    return pct > 0 ? `${formatRupees(Math.round(perMonth))}/mo · save ${pct}%` : `${formatRupees(Math.round(perMonth))}/mo`;
  };

  return (
    <section className="bg-white py-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Pricing</p>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">Simple, transparent plans</h2>
          <p className="text-zinc-500 mt-2">Unlock full details for every job. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {plans.map((plan) => {
            const featured = !!plan.badge;
            return (
              <div key={plan.id} className={`relative rounded-3xl p-6 flex flex-col ${featured ? 'ring-2 ring-[#8b2df2] shadow-soft-hover bg-white' : 'bg-[#f5f5f7]'}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">{plan.badge}</div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  {featured && <Crown className="w-4 h-4 text-[#8b2df2]" />}
                  <h3 className="font-heading text-lg font-bold text-zinc-900">{plan.name}</h3>
                </div>
                {plan.details && <p className="text-sm text-zinc-500 mb-4">{plan.details}</p>}

                {/* Period chips — display only, for plans with custom tiers. */}
                {plan.tiers && plan.tiers.length > 1 && plan.id && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {plan.tiers.map((t) => {
                      const on = (selectedTier[plan.id!] || plan.tiers![0].id) === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTier((prev) => ({ ...prev, [plan.id!]: t.id }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${on ? 'bg-[#8b2df2] text-white border-[#8b2df2]' : 'bg-white text-zinc-600 border-zinc-200 hover:border-[#8b2df2]/40'}`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mb-5">
                  <span className="font-heading text-3xl font-bold text-zinc-900">{formatRupees(priceFor(plan))}</span>
                  <span className="text-sm text-zinc-400"> / {periodFor(plan)}</span>
                  {(() => { const t = chosenTier(plan); return t ? <p className="text-xs text-emerald-600 mt-1">{tierSaving(plan, t)}</p> : null; })()}
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                      <Check className="w-4 h-4 text-[#8b2df2] mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onSignIn}
                  className={`w-full rounded-xl px-5 py-3 text-sm font-semibold transition ${featured ? 'bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white shadow-soft hover:opacity-90' : 'bg-white border-2 border-[#8b2df2] text-[#8b2df2] hover:bg-[#8b2df2]/5'}`}
                >
                  Get Started
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}