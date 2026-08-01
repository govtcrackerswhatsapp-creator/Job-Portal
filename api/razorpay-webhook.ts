/**
 * Razorpay webhook — the path that always fires.
 *
 * Razorpay calls this server-to-server when a payment is captured. It does not
 * care whether the customer's browser survived the UPI app switch, closed the
 * tab, or lost signal. This is what makes access reliable.
 *
 * Register in the Razorpay dashboard:
 *   URL     https://teckoshjob.vercel.app/api/razorpay-webhook
 *   Secret  the value of RAZORPAY_WEBHOOK_SECRET (NOT RAZORPAY_KEY_SECRET)
 *   Event   payment.captured
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { grantSubscription, parseNotes } from './_lib/grant.js';

// The signature is computed over the exact bytes Razorpay sent, so the body must
// not be re-serialised before verification.
export const config = { api: { bodyParser: false } };

async function getRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    // Stream already consumed by a body parser — fall through.
  }
  if (chunks.length > 0) return Buffer.concat(chunks).toString('utf8');

  const parsed = (req as any).body;
  if (typeof parsed === 'string') return parsed;
  if (parsed) return JSON.stringify(parsed);
  return '';
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('webhook: RAZORPAY_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const rawBody = await getRawBody(req);
  const signature = (req.headers['x-razorpay-signature'] as string) || '';

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!signature || !safeEqual(expected, signature)) {
    console.error('webhook: signature mismatch — check RAZORPAY_WEBHOOK_SECRET matches the dashboard');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 200 on anything we deliberately ignore, so Razorpay does not retry it forever.
  if (event?.event !== 'payment.captured') {
    return res.status(200).json({ ignored: event?.event || 'unknown' });
  }

  const payment = event?.payload?.payment?.entity;
  if (!payment?.id || !payment?.order_id) {
    return res.status(200).json({ ignored: 'missing payment entity' });
  }

  try {
    // Notes are set on the ORDER by create-order and mirrored onto the payment by
    // checkout. Prefer the payment's copy; fall back to fetching the order when a
    // payment arrives without them.
    let notes = parseNotes(payment.notes);
    if (!notes) {
      const key_id = process.env.RAZORPAY_KEY_ID;
      const key_secret = process.env.RAZORPAY_KEY_SECRET;
      if (key_id && key_secret) {
        const instance = new Razorpay({ key_id, key_secret });
        const order: any = await instance.orders.fetch(payment.order_id);
        notes = parseNotes(order?.notes);
      }
    }

    if (!notes) {
      // An order created before this feature shipped, paid late. Nothing to retry.
      console.error(`webhook: no uid on payment ${payment.id} / order ${payment.order_id} — grant manually`);
      return res.status(200).json({ ok: false, reason: 'no_uid_in_notes', paymentId: payment.id });
    }

    const result = await grantSubscription({
      paymentId: payment.id,
      orderId: payment.order_id,
      uid: notes.uid,
      amountPaise: Number(payment.amount) || 0,
      days: notes.days,
      planId: notes.planId,
      planLabel: notes.planLabel,
      contact: payment.contact || null,
      email: payment.email || notes.email,
    });

    console.log(`webhook: ${result.status} for ${notes.uid} via ${payment.id}`);
    return res.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    const message = error?.message || String(error);

    // Permanent failures must not be retried — a missing user will still be
    // missing in five minutes, and repeated retries only bury the real signal.
    if (message.startsWith('PERMANENT:')) {
      console.error(`webhook: ${message} (payment ${payment.id})`);
      return res.status(200).json({ ok: false, reason: message });
    }

    // Anything else is treated as transient. A non-2xx makes Razorpay retry.
    console.error('webhook error:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}