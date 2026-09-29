'use strict';
// Collector Pass — M2 scaffolding.
//
// +--------------------------------------------------------------------------+
// | REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk)             |
// |                                                                          |
// | The Collector Pass is a recurring subscription that issues CREDITS.      |
// | Credits are:                                                             |
// |   - NON-TRANSFERABLE: no API endpoint, UI control, or ledger operation   |
// |     can move credits from one pass/email to another. redeemCredit()      |
// |     refuses any email that does not match the pass holder (403).        |
// |   - NON-CASHABLE: every ledger entry carries cash_value_usd_cents: 0.    |
// |     Credits can only be redeemed for film entitlements; they can never   |
// |     be converted back to money, refunded to a card, or paid out.        |
// | A redeemed film becomes a PERMANENT entitlement (same grantEntitlement   |
// | path as a purchase) and grants a permanent DRM-free download (yours  |
// | to keep — wording pending counsel review; NOT copyright ownership).    |
// |                                                                          |
// | Real subscription billing is a Stripe shape only (lib/stripe.js) until   |
// | Dino provides keys AND counsel reviews the money-transmission /          |
// | marketplace-facilitator exposure. Do NOT launch this without that.      |
// +--------------------------------------------------------------------------+

const crypto = require('node:crypto');
const store = require('./store');

// The price the Stripe subscription WILL charge once keys + legal review land.
// Nothing charges today: createSubscriptionCheckout throws "not configured".
const PASS_PRICE_USD_CENTS = 999; // $9.99 / month
const CREDITS_PER_BILLING_PERIOD = 1; // 1 credit per month; 1 credit = 1 film

const LEGAL_NOTICE = 'REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk)';

// Unit-economics warning (verified 2026-09-28, research update 5). The pass
// does NOT pencil on autopilot:
//   - A $10/mo pass with two $8 credits costs $12 in creator payouts alone
//     at a 75% creator share — before card processing (~2.9% + $0.30) and
//     delivery. At the current test config ($9.99/mo, 1 credit redeemable
//     for any film), a single redemption of a film priced above ~$12 already
//     exceeds the subscription price in creator payout at 75%.
//   - The model only works with a different price, allocation basis,
//     included catalog, or usage design. Do NOT quietly rely on subscribers
//     forgetting to redeem (breakage).
//   - Before ANY real-money launch, these must be defined: creator
//     allocations, credit expiration/rollover, refunds, cancellation terms,
//     and whether redeemed access survives membership end.
const ECONOMICS_WARNING =
  'COLLECTOR PASS ECONOMICS (test-mode only): a $10/mo pass with two $8 credits ' +
  'costs $12 in creator payouts at a 75% creator share — before processing and delivery. ' +
  'This model only works with a different price, allocation basis, included catalog, or ' +
  'usage design; do not rely on subscribers forgetting to redeem. Creator allocations, ' +
  'credit expiration/rollover, refunds, cancellation, and post-membership access survival ' +
  'must all be defined before any real-money launch.';

function nowIso() {
  return new Date().toISOString();
}

function getPass(passId) {
  return store.get('passes', passId);
}

function getPassByEmail(email) {
  const norm = String(email).trim().toLowerCase();
  return store.all('passes').find((p) => p.email === norm) || null;
}

// Creates a pass record. testMode=true marks simulated subscriptions
// (no Stripe, no money) — the only kind possible until keys exist.
function createPass({ email, testMode }) {
  const norm = String(email).trim().toLowerCase();
  const pass = {
    pass_id: 'pass_' + crypto.randomBytes(6).toString('hex'),
    email: norm,
    status: 'active',
    stripe_subscription_id: null, // filled by the Stripe webhook once configured
    test_mode: Boolean(testMode),
    created_at: nowIso(),
  };
  store.insert('passes', pass);
  return pass;
}

// Appends an immutable ledger entry. delta is +n (grant) or -n (redemption).
// Every entry is stamped transferable:false and cash_value_usd_cents:0 —
// credits can never be moved to another holder or converted to cash.
function ledgerEntry({ pass_id, delta, reason, film_id, stripe_invoice_id, txn }) {
  const entry = {
    ledger_id: 'led_' + crypto.randomBytes(6).toString('hex'),
    pass_id,
    delta,
    reason,
    film_id: film_id || null,
    stripe_invoice_id: stripe_invoice_id || null,
    transferable: false,
    cash_value_usd_cents: 0,
    created_at: nowIso(),
  };
  // DAT-002: when a caller is building a wider atomic unit (pass redemption:
  // debit + entitlement grant), stage the entry instead of writing it now.
  if (txn) store.txnInsert(txn, 'credit_ledger', entry);
  else store.insert('credit_ledger', entry);
  return entry;
}

function issueCredits({ pass_id, credits, reason, stripe_invoice_id }) {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error('credits must be a positive integer');
  }
  return ledgerEntry({ pass_id, delta: credits, reason, stripe_invoice_id });
}

function balance(pass_id) {
  return store
    .all('credit_ledger')
    .filter((e) => e.pass_id === pass_id)
    .reduce((sum, e) => sum + e.delta, 0);
}

function ledger(pass_id) {
  return store.all('credit_ledger').filter((e) => e.pass_id === pass_id);
}

// F-DFLIX-6: webhook dedup. Stripe delivers webhooks at-least-once (retries
// on non-2xx/timeout), so a retried invoice.payment_succeeded must not issue
// a second credit for the same invoice. The stripe_invoice_id is the
// idempotency key for the economic effect (mirrors the
// checkout.session.completed alreadyEntitled guard at its call site).
// Without an invoice id we cannot dedup: return false so the caller credits
// (a missed credit for a paid period is worse than a bounded $0-value
// duplicate), and Stripe always sets the invoice id in practice.
function invoiceCredited({ pass_id, stripe_invoice_id }) {
  if (!stripe_invoice_id) return false;
  return store
    .all('credit_ledger')
    .some((e) => e.pass_id === pass_id && e.stripe_invoice_id === stripe_invoice_id);
}

// Redeems ONE credit for a film. Hard rules:
//  - pass must be active
//  - email must match the pass holder exactly (else 403 — no gifting, no transfers)
//  - balance must cover the redemption (else 409)
// Returns the redemption ledger entry. The caller converts it into a permanent
// film entitlement via grantEntitlement().
function redeemCredit({ pass_id, film_id, email, txn }) {
  const pass = getPass(pass_id);
  if (!pass) {
    const err = new Error('pass not found');
    err.status = 404;
    throw err;
  }
  if (pass.status !== 'active') {
    const err = new Error('pass is not active');
    err.status = 409;
    throw err;
  }
  const norm = String(email || '').trim().toLowerCase();
  if (norm !== pass.email) {
    // Non-transferability enforced: credits stay with the pass holder.
    const err = new Error('credits are non-transferable: redemption email must match the pass holder');
    err.status = 403;
    throw err;
  }
  if (balance(pass_id) < 1) {
    const err = new Error('insufficient credits');
    err.status = 409;
    throw err;
  }
  return ledgerEntry({ pass_id, delta: -1, reason: 'redemption', film_id, txn });
}

// Deliberately absent: there is NO transferCredits(). Credits cannot be moved
// between passes, gifted, sold, or cashed out — by design, in code.

module.exports = {
  PASS_PRICE_USD_CENTS,
  CREDITS_PER_BILLING_PERIOD,
  LEGAL_NOTICE,
  ECONOMICS_WARNING,
  createPass,
  getPass,
  getPassByEmail,
  issueCredits,
  invoiceCredited,
  redeemCredit,
  balance,
  ledger,
};
