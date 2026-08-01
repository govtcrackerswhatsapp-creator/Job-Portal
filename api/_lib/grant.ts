/**
 * Server-side subscription granting (Option 2).
 *
 * This module is the ONLY place access is granted. It is called from two places:
 *   1. api/razorpay-webhook.ts  — Razorpay calls us server-to-server. Always fires.
 *   2. api/claim-payment.ts     — the browser calls us right after checkout. Fast, but may be lost.
 *
 * Both may run for the same payment, in either order, possibly at the same time.
 * grantSubscription() is therefore IDEMPOTENT: the payment record uses the Razorpay
 * payment id as its document id, and the whole check-then-write runs in a Firestore
 * transaction. Whoever gets there first grants; everyone after that is a no-op.
 *
 * Files under api/_lib are ignored by Vercel's router (leading underscore), so this
 * is a shared module, not an endpoint.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

const DAY_MS = 24 * 60 * 60 * 1000;

let cachedApp: App | null = null;

/**
 * Initialise the Admin SDK once per warm serverless container.
 * The whole service account JSON lives in one env var, so the private key's
 * newlines survive JSON.parse untouched — no manual \n unescaping needed in the
 * normal case. The replace() below is a safety net for double-escaped pastes.
 */
function getApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole file, braces included.');
  }

  if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  cachedApp = initializeApp({ credential: cert(parsed) });
  return cachedApp;
}

export function db(): Firestore {
  return getFirestore(getApp());
}

export function adminAuth(): Auth {
  return getAuth(getApp());
}

/** What create-order stamped onto the Razorpay order, read back at grant time. */
export interface OrderNotes {
  uid: string;
  planId: string;
  planLabel: string;
  days: number;
  email: string | null;
}

/**
 * Parse the notes we wrote in create-order. Returns null when uid is missing,
 * which means the order predates this feature (an old order paid late) — the
 * caller decides what to do rather than guessing at an owner.
 */
export function parseNotes(notes: any): OrderNotes | null {
  if (!notes || typeof notes !== 'object') return null;
  const uid = typeof notes.uid === 'string' ? notes.uid.trim() : '';
  if (!uid) return null;

  const rawDays = parseInt(String(notes.days ?? ''), 10);
  return {
    uid,
    planId: typeof notes.planId === 'string' ? notes.planId : '',
    planLabel: typeof notes.planLabel === 'string' ? notes.planLabel : '',
    days: Number.isFinite(rawDays) && rawDays >= 1 ? rawDays : 30,
    email: typeof notes.email === 'string' && notes.email ? notes.email : null,
  };
}

export interface GrantInput {
  paymentId: string;
  orderId: string;
  uid: string;
  amountPaise: number;
  days: number;
  planId: string;
  planLabel: string;
  contact?: string | null;
  email?: string | null;
}

export interface GrantResult {
  status: 'granted' | 'already_granted';
  expiry: number;
}

/**
 * Grant (or confirm an existing grant of) a subscription.
 *
 * Idempotency key: the Razorpay payment id, used as the payments/ document id.
 * Razorpay retries webhooks on any non-2xx, and the browser fast path may race
 * the webhook, so this WILL be called more than once for a single payment.
 */
export async function grantSubscription(input: GrantInput): Promise<GrantResult> {
  const firestore = db();
  const paymentRef = firestore.collection('payments').doc(input.paymentId);
  const userRef = firestore.collection('users').doc(input.uid);

  return firestore.runTransaction(async (tx) => {
    // All reads must precede all writes inside a Firestore transaction.
    const existingPayment = await tx.get(paymentRef);
    if (existingPayment.exists) {
      const prev = existingPayment.data() as any;
      return {
        status: 'already_granted' as const,
        expiry: typeof prev?.expiryDate === 'number' ? prev.expiryDate : 0,
      };
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new Error(`PERMANENT: user ${input.uid} does not exist`);
    }
    const user = userSnap.data() as any;

    const now = Date.now();
    const days = input.days >= 1 ? input.days : 30;

    // Extend from remaining time when still active, so paid days are never lost.
    const currentExpiry =
      typeof user.subscriptionExpiry === 'number' && user.subscriptionExpiry > now
        ? user.subscriptionExpiry
        : now;
    const newExpiry = currentExpiry + days * DAY_MS;

    const label = input.planLabel && input.planLabel.trim() ? input.planLabel.trim() : (user.planName || 'Subscription');

    // Rupees, to match every existing record in this collection and the Analytics page.
    const amountRupees = Math.round(input.amountPaise) / 100;

    tx.set(paymentRef, {
      userId: input.uid,
      email: input.email || user.email || null,
      planId: input.planId || '',
      planName: label,
      amount: amountRupees,
      razorpayOrderId: input.orderId,
      razorpayPaymentId: input.paymentId,
      status: 'success',
      createdAt: now,
      durationInDays: days,
      expiryDate: newExpiry,
      contact: input.contact || null,
    });

    tx.update(userRef, {
      subscriptionStatus: 'active',
      subscriptionExpiry: newExpiry,
      subscriptionStart: now,
      planName: label,
      contact: input.contact || user.contact || null,
    });

    return { status: 'granted' as const, expiry: newExpiry };
  });
}