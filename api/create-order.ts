import type { VercelRequest, VercelResponse } from '@vercel/node';
import Razorpay from 'razorpay';

const FIREBASE_PROJECT_ID = 'job-portal-b0c35';
const FIREBASE_API_KEY = 'AIzaSyCqrCmNWXvd7PzWSUYCugbHMpIIsKLClms';

// Read a plan from the public 'plans' collection via Firestore REST (no admin SDK needed).
async function getPlan(planId: string): Promise<{ price: number; annualPrice: number | null } | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/plans/${planId}?key=${FIREBASE_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data: any = await resp.json();
  const fields = data.fields;
  if (!fields) return null;
  const price = fields.price?.integerValue != null ? parseInt(fields.price.integerValue, 10)
    : fields.price?.doubleValue != null ? Math.round(fields.price.doubleValue) : null;
  const annual = fields.annualPrice?.integerValue != null ? parseInt(fields.annualPrice.integerValue, 10)
    : fields.annualPrice?.doubleValue != null ? Math.round(fields.annualPrice.doubleValue) : null;
  if (price == null) return null;
  return { price, annualPrice: annual };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { planId, billingCycle } = req.body || {};
    if (!planId) return res.status(400).json({ error: 'Missing planId' });

    const plan = await getPlan(planId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    // Server decides the real amount. Never trust a client-sent price.
    const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
    const amount = isAnnual ? (plan.annualPrice as number) : plan.price;
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

    return res.status(200).json({ ...order, verifiedAmount: amount });
  } catch (error: any) {
    console.error('create-order error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Failed to create order' });
  }
}