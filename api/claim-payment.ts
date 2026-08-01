/**
 * Claim a payment from the browser — the fast path.
 *
 * Called by the checkout handler the instant payment succeeds, so the customer
 * sees access unlock in about two seconds instead of waiting for the webhook.
 * It grants through the SAME idempotent function the webhook uses, so whichever
 * arrives second simply reports already_granted and writes nothing.
 *
 * Also doubles as the recovery endpoint: send an orderId + paymentId for a
 * payment that was captured but never granted and it will activate it, provided
 * Razorpay confirms the payment is real.
 *
 * Note there is no trusted uid in the request. The owner is read from the order
 * notes that create-order stamped server-side, so a caller cannot claim someone
 * else's payment or redirect a payment to their own account.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { grantSubscription, parseNotes } from './_lib/grant.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ ok: false, error: 'Missing order or payment id' });
    }

    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
      return res.status(500).json({ ok: false, error: 'Payment keys not configured on server' });
    }

    // When checkout supplied a signature, it must be valid.
    if (razorpay_signature) {
      const expected = crypto
        .createHmac('sha256', key_secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');
      if (!safeEqual(expected, razorpay_signature)) {
        return res.status(400).json({ ok: false, error: 'Invalid payment signature' });
      }
    }

    const instance = new Razorpay({ key_id, key_secret });

    // Ask Razorpay directly rather than trusting the request. This is what makes
    // the endpoint safe to call without a signature during recovery.
    const payment: any = await instance.payments.fetch(razorpay_payment_id);
    if (!payment || payment.order_id !== razorpay_order_id) {
      return res.status(400).json({ ok: false, error: 'Payment does not belong to that order' });
    }
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({ ok: false, error: `Payment is ${payment.status}, not captured` });
    }

    let notes = parseNotes(payment.notes);
    if (!notes) {
      const order: any = await instance.orders.fetch(razorpay_order_id);
      notes = parseNotes(order?.notes);
    }
    if (!notes) {
      return res.status(400).json({ ok: false, error: 'This order has no account attached. Contact support.' });
    }

    const result = await grantSubscription({
      paymentId: payment.id,
      orderId: razorpay_order_id,
      uid: notes.uid,
      amountPaise: Number(payment.amount) || 0,
      days: notes.days,
      planId: notes.planId,
      planLabel: notes.planLabel,
      contact: payment.contact || null,
      email: payment.email || notes.email,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error('claim-payment error:', message);
    return res.status(500).json({ ok: false, error: message.replace(/^PERMANENT:\s*/, '') });
  }
}