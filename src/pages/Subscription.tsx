import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { grantAccess } from '../lib/subscription';
import { SubscriptionPlan } from '../types';
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
  const [processing, setProcessing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'plans'));
      const list: SubscriptionPlan[] = [];
      snap.forEach((d) => {
        const p = { id: d.id, ...(d.data() as SubscriptionPlan) };
        if (p.active) list.push(p);
      });
      list.sort((a, b) => a.price - b.price);
      setPlans(list);
    } catch (e) {
      console.error('Error loading plans:', e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const anyAnnual = plans.some((p) => p.annualPrice != null);
  const priceFor = (p: SubscriptionPlan) => (cycle === 'annual' && p.annualPrice != null ? p.annualPrice : p.price);
  const periodFor = (p: SubscriptionPlan) => (cycle === 'annual' && p.annualPrice != null ? 'year' : `${p.durationInDays} days`);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!user) return;
    try {
      setProcessing(plan.id || '');

      const ok = await loadRazorpay();
      if (!ok) { showToast('err', 'Could not load payment gateway. Try again.'); return; }

      // 1) Create order server-side (price validated on the server).
      const orderResp = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, billingCycle: cycle }),
      });
      const order = await orderResp.json();
      if (!orderResp.ok || !order.id) { showToast('err', order.error || 'Could not start payment.'); return; }

      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string;

      // 2) Open Razorpay checkout.
      const rzp = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: 'INR',
        name: 'TecKosh',
        description: `${plan.name} — ${cycle === 'annual' ? 'Annual' : 'Monthly'}`,
        order_id: order.id,
        prefill: { email: user.email, name: user.name || '' },
        theme: { color: '#8b2df2' },
        handler: async (response: any) => {
          try {
            // 3) Verify signature server-side.
            const verifyResp = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            });
            const verify = await verifyResp.json();
            if (!verify.success) { showToast('err', 'Payment could not be verified. Contact support.'); return; }

            // 4) Grant access (Option 1: client-side via the grant boundary).
            await grantAccess(user, plan, cycle, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              amount: order.verifiedAmount ?? priceFor(plan),
              contact: verify.contact,
            });

            showToast('ok', 'Payment successful! Access unlocked. Redirecting…');
            setTimeout(() => navigate('/dashboard'), 1500);
          } catch (e) {
            console.error('Post-payment error:', e);
            showToast('err', 'Payment succeeded but activation failed. Contact support with your payment ID.');
          }
        },
        modal: { ondismiss: () => setProcessing(null) },
      });
      rzp.open();
    } catch (e) {
      console.error('Subscribe error:', e);
      showToast('err', 'Something went wrong. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b2df2]">Choose your plan</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-zinc-900 mt-1">Unlock every job's full details</h1>
          <p className="text-zinc-500 mt-2">Get exam details, study material, and more for every listing.</p>
        </div>

        {anyAnnual && (
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
          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
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
                  <div className="mb-5">
                    <span className="font-heading text-3xl font-bold text-zinc-900">{formatRupees(priceFor(plan))}</span>
                    <span className="text-sm text-zinc-400"> / {periodFor(plan)}</span>
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
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}