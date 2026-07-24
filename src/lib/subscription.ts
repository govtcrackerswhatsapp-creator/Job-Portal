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
  payment: { orderId: string; paymentId: string; amount: number; contact?: string | null },
): Promise<number> {
  const now = Date.now();
  // IMPORTANT: this condition must stay identical to the one in api/create-order.ts,
  // which decides what the user is actually charged:
  //     const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
  // If the two ever disagree, the user is charged for one period and granted
  // another. A plan with no annual price is always billed — and so must always
  // be granted — at its monthly duration, even when the Yearly toggle is on.
  const isAnnual = billingCycle === 'annual' && plan.annualPrice != null;
  const days = isAnnual ? 365 : plan.durationInDays;
  const durationMs = days * 24 * 60 * 60 * 1000;

  // Extend from remaining time if the subscription is still active (don't lose paid days).
  const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > now ? user.subscriptionExpiry : now;
  const newExpiry = currentExpiry + durationMs;

  // Update the user's access.
  await updateDoc(doc(db, 'users', user.uid), {
    subscriptionStatus: 'active',
    subscriptionExpiry: newExpiry,
    subscriptionStart: now,
    planName: plan.name,
    contact: payment.contact || user.contact || null,
  });

  // Record the payment.
  await addDoc(collection(db, 'payments'), {
    userId: user.uid,
    email: user.email,
    planId: plan.id || '',
    planName: plan.name,
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