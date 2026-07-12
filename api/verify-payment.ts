import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import Razorpay from 'razorpay';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing verification fields' });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) return res.status(500).json({ success: false, error: 'Server not configured' });

    const expected = crypto
      .createHmac('sha256', key_secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    } catch {
      valid = expected === razorpay_signature;
    }

    if (!valid) return res.status(400).json({ success: false, error: 'Invalid payment signature' });

    // Best-effort: fetch contact/email for the payment record.
    let contact: string | null = null;
    let email: string | null = null;
    try {
      const key_id = process.env.RAZORPAY_KEY_ID!;
      const instance = new Razorpay({ key_id, key_secret });
      const payment: any = await instance.payments.fetch(razorpay_payment_id);
      contact = payment?.contact || null;
      email = payment?.email || null;
    } catch { /* ignore */ }

    return res.status(200).json({ success: true, contact, email });
  } catch (error: any) {
    console.error('verify-payment error:', error?.message || error);
    return res.status(500).json({ success: false, error: error?.message || 'Verification failed' });
  }
}