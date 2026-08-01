import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';
import { adminAuth } from './_lib/grant';

const FIREBASE_PROJECT_ID = 'job-portal-b0c35';
const FIREBASE_API_KEY = 'AIzaSyCqrCmNWXvd7PzWSUYCugbHMpIIsKLClms';

interface Tier { id: string; label: string; days: number; price: number; }
interface Plan { name: string; price: number; annualPrice: number | null; durationInDays: number; tiers: Tier[]; }

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
  const name = fields.name?.stringValue ?? 'Subscription';
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

  return { name, price, annualPrice: annual, durationInDays, tiers };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { planId, billingCycle, tierId, idToken } = req.body || {};
    if (!planId) return res.status(400).json({ error: 'Missing planId' });

    // WHO is buying. Taken from a verified Firebase ID token, never from a
    // client-sent uid — this value is stamped onto the order and is what the
    // webhook later trusts to decide whose account to activate.
    if (!idToken || typeof idToken !== 'string') {
      return res.status(401).json({ error: 'Please sign in again and retry.' });
    }
    let uid: string;
    let tokenEmail: string | null = null;
    try {
      const decoded = await adminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
      tokenEmail = decoded.email ?? null;
    } catch {
      return res.status(401).json({ error: 'Your session expired. Sign in again and retry.' });
    }

    const plan = await getPlan(planId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    // Server decides the real amount AND the real duration. Never trust a client-sent price.
    let amount: number;
    let days: number;
    let planLabel: string;

    if (tierId) {
      // Tier purchase: the tier MUST exist on this plan. If it does not, reject —
      // never fall back to base price or the cheapest tier (that would let a client
      // pay for one period and receive another).
      const tier = plan.tiers.find((t) => t.id === tierId);
      if (!tier) return res.status(400).json({ error: 'Invalid or unknown plan tier' });
      amount = tier.price;
      days = tier.days;
      planLabel = `${plan.name} — ${tier.label}`;
    } else {
      // No tier sent: original monthly/annual behaviour, unchanged.
      const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
      amount = isAnnual ? (plan.annualPrice as number) : plan.price;
      days = isAnnual ? 365 : plan.durationInDays;
      planLabel = plan.name;
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
      // The identity of the purchase, decided here on the server and carried by
      // Razorpay all the way to the webhook. Razorpay note values must be strings.
      notes: {
        uid,
        planId: String(planId),
        planLabel,
        days: String(days),
        email: tokenEmail || '',
      },
    });

    return res.status(200).json({ ...order, verifiedAmount: amount, verifiedDays: days, planLabel });
  } catch (error: any) {
    console.error('create-order error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Failed to create order' });
  }
}