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
function ledgerEntry({ pass_id, delta, reason, film_id, stripe_invoice_id }) {
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
  store.insert('credit_ledger', entry);
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

// Redeems ONE credit for a film. Hard rules:
//  - pass must be active
//  - email must match the pass holder exactly (else 403 — no gifting, no transfers)
//  - balance must cover the redemption (else 409)
// Returns the redemption ledger entry. The caller converts it into a permanent
// film entitlement via grantEntitlement().
function redeemCredit({ pass_id, film_id, email }) {
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
  return ledgerEntry({ pass_id, delta: -1, reason: 'redemption', film_id });
}

// Deliberately absent: there is NO transferCredits(). Credits cannot be moved
// between passes, gifted, sold, or cashed out — by design, in code.

module.exports = {
  PASS_PRICE_USD_CENTS,
  CREDITS_PER_BILLING_PERIOD,
  LEGAL_NOTICE,
  createPass,
  getPass,
  getPassByEmail,
  issueCredits,
  redeemCredit,
  balance,
  ledger,
};
