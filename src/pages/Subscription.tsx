import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { getPlans } from '../lib/plansData';
import { claimAccess } from '../lib/subscription';
import { SubscriptionPlan, PlanTier } from '../types';
import { formatRupees } from '../lib/format';
import { Check, Loader2, ArrowLeft, Sparkles, Crown } from 'lucide-react';

declare global {
  interface Window { Razorpay: any; }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Subscription() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  // Per-plan chosen tier id (only used by plans that define tiers).
  const [selectedTier, setSelectedTier] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const all = await getPlans(); // cached
      const active = all.filter((p) => p.active).sort((a, b) => a.price - b.price);
      setPlans(active);
      // Default each tiered plan's selection to its first tier (the base).
      const defaults: Record<string, string> = {};
      active.forEach((pl) => { if (pl.tiers && pl.tiers.length > 0 && pl.id) defaults[pl.id] = pl.tiers[0].id; });
      setSelectedTier(defaults);
    } catch (e) {
      console.error('Error loading plans:', e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 6000);
  };

  const anyAnnual = plans.some((p) => p.annualPrice != null);

  // The tier the user has selected for a plan (undefined if the plan has no tiers).
  const chosenTier = (p: SubscriptionPlan): PlanTier | undefined => {
    if (!p.tiers || p.tiers.length === 0 || !p.id) return undefined;
    return p.tiers.find((t) => t.id === selectedTier[p.id!]) || p.tiers[0];
  };

  // Price/period shown on the card. Tiered plans use the chosen tier; others keep
  // the original monthly/annual behaviour.
  const priceFor = (p: SubscriptionPlan) => {
    const t = chosenTier(p);
    if (t) return t.price;
    return cycle === 'annual' && p.annualPrice != null ? p.annualPrice : p.price;
  };
  const periodFor = (p: SubscriptionPlan) => {
    const t = chosenTier(p);
    if (t) return t.label;
    return cycle === 'annual' && p.annualPrice != null ? 'year' : `${p.durationInDays} days`;
  };

  // Small helper: per-month figure + saving vs the first tier, for the hint line.
  const tierSaving = (p: SubscriptionPlan, t: PlanTier): string => {
    const base = p.tiers && p.tiers[0];
    const perMonth = t.price / (t.days / 30);
    if (!base || base.id === t.id) return `${t.days} days of access`;
    const pct = Math.round((1 - (t.price / t.days) / (base.price / base.days)) * 100);
    return pct > 0 ? `${formatRupees(Math.round(perMonth))}/mo · save ${pct}%` : `${formatRupees(Math.round(perMonth))}/mo`;
  };

  // A full reload is deliberate: it re-reads the user profile from Firestore so
  // the new expiry is reflected everywhere, which an in-app navigate would not do.
  const goToDashboard = (delayMs: number) => {
    setTimeout(() => { window.location.assign('/dashboard'); }, delayMs);
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!user) return;
    const tier = chosenTier(plan); // undefined for non-tier plans
    try {
      setProcessing(plan.id || '');

      const ok = await loadRazorpay();
      if (!ok) { showToast('err', 'Could not load payment gateway. Try again.'); setProcessing(null); return; }

      // Proves to the server who is buying. The server stamps this identity onto
      // the Razorpay order, and that is what the webhook later trusts.
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { showToast('err', 'Your session expired. Please sign in again.'); setProcessing(null); return; }

      const orderResp = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, billingCycle: cycle, tierId: tier?.id, idToken }),
      });
      const order = await orderResp.json();
      if (!orderResp.ok || !order.id) { showToast('err', order.error || 'Could not start payment.'); setProcessing(null); return; }

      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string;

      const rzp = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: 'INR',
        name: 'TecKosh',
        description: tier ? `${plan.name} — ${tier.label}` : `${plan.name} — ${cycle === 'annual' ? 'Annual' : 'Monthly'}`,
        order_id: order.id,
        prefill: { email: user.email, name: user.name || '' },
        theme: { color: '#8b2df2' },
        // Mirror the order notes onto the payment entity so the webhook usually
        // resolves the buyer without a second API call to fetch the order.
        notes: {
          uid: user.uid,
          planId: plan.id || '',
          planLabel: order.planLabel || plan.name,
          days: String(order.verifiedDays ?? plan.durationInDays),
          email: user.email || '',
        },
        handler: async (response: any) => {
          // Fast path only. If any of this fails the webhook still grants access,
          // so the customer is never left stranded the way they were before.
          showToast('ok', 'Payment received. Activating your access…');
          const result = await claimAccess(response);

          if (result.ok) {
            showToast('ok', 'Access unlocked. Redirecting…');
            goToDashboard(1200);
          } else {
            console.error('claim failed, relying on webhook:', result.error);
            showToast('ok', 'Payment received. Finishing activation — this page will refresh.');
            goToDashboard(6000);
          }
        },
        modal: { ondismiss: () => setProcessing(null) },
      });

      rzp.on('payment.failed', (resp: any) => {
        console.error('payment.failed', resp?.error);
        showToast('err', resp?.error?.description || 'Payment failed. No money was taken.');
        setProcessing(null);
      });

      rzp.open();
    } catch (e) {
      console.error('Subscribe error:', e);
      showToast('err', 'Something went wrong. Please try again.');
      setProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-4 sm:p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Choose your plan</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">Unlock every job's full details</h1>
          <p className="text-zinc-500 mt-2">Get exam details, study material, and more for every listing.</p>
        </div>

        {anyAnnual && !plans.every((p) => p.tiers && p.tiers.length > 0) && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-white rounded-full p-1 shadow-soft">
              <button onClick={() => setCycle('monthly')} className={`px-5 py-2 rounded-full text-sm font-medium transition ${cycle === 'monthly' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600'}`}>Monthly</button>
              <button onClick={() => setCycle('annual')} className={`px-5 py-2 rounded-full text-sm font-medium transition ${cycle === 'annual' ? 'bg-[#8b2df2] text-white' : 'text-zinc-600'}`}>Yearly</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#8b2df2] animate-spin" /></div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-soft p-12 text-center max-w-md mx-auto">
            <p className="text-zinc-500">No plans available right now. Please check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {plans.map((plan) => {
              const featured = !!plan.badge;
              return (
                <div key={plan.id} className={`relative bg-white rounded-3xl p-6 flex flex-col ${featured ? 'ring-2 ring-[#8b2df2] shadow-soft-hover' : 'shadow-soft'}`}>
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    {featured && <Crown className="w-4 h-4 text-[#8b2df2]" />}
                    <h3 className="font-heading text-lg font-bold text-zinc-900">{plan.name}</h3>
                  </div>
                  {plan.details && <p className="text-sm text-zinc-500 mb-4">{plan.details}</p>}

                  {/* Period chips — only for plans that define custom tiers. */}
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
                    onClick={() => handleSubscribe(plan)}
                    disabled={processing === plan.id}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${
                      featured ? 'bg-gradient-to-r from-[#8b2df2] to-[#00b4d8] text-white shadow-soft hover:opacity-90' : 'bg-white border-2 border-[#8b2df2] text-[#8b2df2] hover:bg-[#8b2df2]/5'
                    }`}
                  >
                    {processing === plan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Subscribe
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md text-center px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}