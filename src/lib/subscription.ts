import { db } from './firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { SubscriptionPlan, UserProfile } from '../types';

/**
 * Grant a subscription to a user after a verified payment.
 *
 * >>> OPTION 1 → OPTION 2 SWAP POINT 
 * Currently the grant is written from the client (Option 1). To upgrade to the
 * tamper-proof server-side grant (Option 2) later, change ONLY this function to
 * call a secure /api endpoint instead of writing to Firestore directly.
 * The rest of the app calls grantAccess() and never needs to change.
 */
export async function grantAccess(
  user: UserProfile,
  plan: SubscriptionPlan,
  billingCycle: 'monthly' | 'annual',
  payment: { orderId: string; paymentId: string; amount: number; contact?: string | null; verifiedDays?: number; planLabel?: string },
): Promise<number> {
  const now = Date.now();
  // PREFER the duration the server priced (create-order returns verifiedDays alongside
  // verifiedAmount). Price and duration are then decided ONCE, on the server, so the
  // granted period can never drift from what the user was charged — including for tiers.
  //
  // Fallback (verifiedDays absent): the original monthly/annual logic. This condition
  // must stay identical to the non-tier branch in api/create-order.ts:
  //     const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
  // A plan with no annual price is always billed — and so must always be granted —
  // at its monthly duration, even when the Yearly toggle is on.
  const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
  const days = (payment.verifiedDays != null && payment.verifiedDays >= 1)
    ? payment.verifiedDays
    : (isAnnual ? 365 : plan.durationInDays);
  const durationMs = days * 24 * 60 * 60 * 1000;

  // Label written to the user/record: the specific tier label if provided, else the plan name.
  const label = payment.planLabel && payment.planLabel.trim() ? payment.planLabel.trim() : plan.name;

  // Extend from remaining time if the subscription is still active (don't lose paid days).
  const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > now ? user.subscriptionExpiry : now;
  const newExpiry = currentExpiry + durationMs;

  // Update the user's access.
  await updateDoc(doc(db, 'users', user.uid), {
    subscriptionStatus: 'active',
    subscriptionExpiry: newExpiry,
    subscriptionStart: now,
    planName: label,
    contact: payment.contact || user.contact || null,
  });

  // Record the payment.
  await addDoc(collection(db, 'payments'), {
    userId: user.uid,
    email: user.email,
    planId: plan.id || '',
    planName: label,
    amount: payment.amount,
    razorpayOrderId: payment.orderId,
    razorpayPaymentId: payment.paymentId,
    status: 'success',
    createdAt: now,
    durationInDays: days,
    expiryDate: newExpiry,
    contact: payment.contact || null,
  });

  return newExpiry;
}