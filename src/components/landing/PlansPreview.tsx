import { useEffect, useState } from 'react';
import { getPlans } from '../../lib/plansData';
import { SubscriptionPlan } from '../../types';
import { formatRupees } from '../../lib/format';
import { Check, Loader2, Crown } from 'lucide-react';

export default function PlansPreview({ onSignIn }: { onSignIn: () => void }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const all = await getPlans(); // cached
        setPlans(all.filter((p) => p.active).sort((a, b) => a.price - b.price));
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

  return (
    <section className="bg-white py-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Pricing</p>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">Simple, transparent plans</h2>
          <p className="text-zinc-500 mt-2">Unlock full details for every job. Cancel anytime.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
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
                <div className="mb-5">
                  <span className="font-heading text-3xl font-bold text-zinc-900">{formatRupees(plan.price)}</span>
                  <span className="text-sm text-zinc-400"> / {plan.durationInDays} days</span>
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