import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';

const FIREBASE_PROJECT_ID = 'job-portal-b0c35';
const FIREBASE_API_KEY = 'AIzaSyCqrCmNWXvd7PzWSUYCugbHMpIIsKLClms';

interface Tier { id: string; label: string; days: number; price: number; }
interface Plan { price: number; annualPrice: number | null; durationInDays: number; tiers: Tier[]; }

// Firestore REST returns numbers as either integerValue (string) or doubleValue.
function numFrom(field: any): number | null {
  if (!field) return null;
  if (field.integerValue != null) return parseInt(field.integerValue, 10);
  if (field.doubleValue != null) return Math.round(field.doubleValue);
  return null;
}

// Read a plan from the public 'plans' collection via Firestore REST (no admin SDK needed).
async function getPlan(planId: string): Promise<Plan | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/plans/${planId}?key=${FIREBASE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data: any = await resp.json();
  const fields = data.fields;
  if (!fields) return null;

  const price = numFrom(fields.price);
  const annual = numFrom(fields.annualPrice);
  const durationInDays = numFrom(fields.durationInDays) ?? 30;
  if (price == null) return null;

  // Parse the optional tiers array. Firestore encodes an array as
  // arrayValue.values[], each element a mapValue.fields with id/label/days/price.
  const tiers: Tier[] = [];
  const rawTiers = fields.tiers?.arrayValue?.values;
  if (Array.isArray(rawTiers)) {
    for (const el of rawTiers) {
      const tf = el?.mapValue?.fields;
      if (!tf) continue;
      const id = tf.id?.stringValue;
      const days = numFrom(tf.days);
      const tprice = numFrom(tf.price);
      const label = tf.label?.stringValue ?? '';
      if (id && days != null && days >= 1 && tprice != null && tprice >= 1) {
        tiers.push({ id, label, days, price: tprice });
      }
    }
  }

  return { price, annualPrice: annual, durationInDays, tiers };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { planId, billingCycle, tierId } = req.body || {};
    if (!planId) return res.status(400).json({ error: 'Missing planId' });

    const plan = await getPlan(planId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    // Server decides the real amount AND the real duration. Never trust a client-sent price.
    let amount: number;
    let days: number;

    if (tierId) {
      // Tier purchase: the tier MUST exist on this plan. If it does not, reject —
      // never fall back to base price or the cheapest tier (that would let a client
      // pay for one period and receive another).
      const tier = plan.tiers.find((t) => t.id === tierId);
      if (!tier) return res.status(400).json({ error: 'Invalid or unknown plan tier' });
      amount = tier.price;
      days = tier.days;
    } else {
      // No tier sent: original monthly/annual behaviour, unchanged.
      const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
      amount = isAnnual ? (plan.annualPrice as number) : plan.price;
      days = isAnnual ? 365 : plan.durationInDays;
    }

    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid plan amount' });

    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) return res.status(500).json({ error: 'Payment keys not configured on server' });

    const instance = new Razorpay({ key_id, key_secret });
    const order = await instance.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`.slice(0, 40),
    });

    return res.status(200).json({ ...order, verifiedAmount: amount, verifiedDays: days });
  } catch (error: any) {
    console.error('create-order error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Failed to create order' });
  }
}