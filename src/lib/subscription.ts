/**
 * Client side of subscription activation.
 *
 * >>> OPTION 1 → OPTION 2: DONE
 * The grant no longer happens in the browser. This module asks the server to
 * activate the payment; the server verifies it against Razorpay and writes the
 * grant with the Admin SDK. A user can no longer forge access by writing to
 * their own document, and — more importantly for reliability — the same grant
 * also arrives via the Razorpay webhook when the browser never gets this far.
 *
 * Both paths are idempotent, so calling this after the webhook already ran is
 * harmless: it returns already_granted and changes nothing.
 */

export interface ClaimResult {
  ok: boolean;
  status?: 'granted' | 'already_granted';
  expiry?: number;
  error?: string;
}

export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature?: string;
}

/**
 * Activate a completed payment. Safe to retry.
 */
export async function claimAccess(response: RazorpayCheckoutResponse): Promise<ClaimResult> {
  try {
    const resp = await fetch('/api/claim-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'Activation failed' };
    }
    return { ok: true, status: data.status, expiry: data.expiry };
  } catch (e: any) {
    // Network failure here is NOT fatal any more: the webhook will still grant.
    return { ok: false, error: e?.message || 'Network error' };
  }
}