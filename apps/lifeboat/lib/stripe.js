'use strict';
// Stripe integration for the Decentralflix Lifeboat — STUBBED for M1/M2.
//
// +--------------------------------------------------------------------------+
// | MONEY-TRANSMISSION WARNING: top-ups route through a Stripe-managed flow;  |
// | needs lawyer's read before launch.                                       |
// |                                                                          |
// | This file contains the REAL call structure (checkout session creation    |
// | for one-off purchases AND recurring Collector Pass subscriptions, plus   |
// | webhook signature verification) but every live Stripe call throws until  |
// | Dino provides keys. Do NOT wire real charges without counsel reviewing   |
// | the money-transmission / marketplace-facilitator exposure first.         |
// +--------------------------------------------------------------------------+

const crypto = require('node:crypto');

function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Pure function: the exact parameter shape we WILL send to
// stripe.checkout.sessions.create once keys exist. Kept dependency-free and
// unit-testable; no network, no money.
function buildCheckoutSessionParams({ film, buyerEmail, successUrl, cancelUrl }) {
  return {
    mode: 'payment',
    customer_email: buyerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: film.price_usd_cents,
          product_data: {
            name: film.title,
            metadata: { film_id: film.film_id },
          },
        },
        quantity: 1,
      },
    ],
    metadata: { film_id: film.film_id, buyer_email: buyerEmail },
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

// Pure function: the exact parameter shape for the COLLECTOR PASS recurring
// subscription ($9.99/mo -> 1 non-transferable, non-cashable credit per month).
// REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk).
function buildSubscriptionCheckoutParams({ buyerEmail, successUrl, cancelUrl }) {
  return {
    mode: 'subscription',
    customer_email: buyerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: 999, // $9.99 / month — Collector Pass
          recurring: { interval: 'month' },
          product_data: {
            name: 'Decentralflix Collector Pass',
            description:
              'Monthly credit redeemable for one film. Credits are non-transferable and non-cashable. REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk).',
            metadata: { product: 'collector_pass' },
          },
        },
        quantity: 1,
      },
    ],
    metadata: { product: 'collector_pass', buyer_email: buyerEmail },
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

// STUB: throws until Dino provides keys. When activated, this becomes:
//   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
//   return stripe.checkout.sessions.create(buildCheckoutSessionParams(args));
async function createCheckoutSession(/* args */) {
  throw new Error("Stripe not configured — needs Dino's keys");
}

// STUB: recurring-subscription variant. Same rule: throws until keys exist AND
// counsel has reviewed the money-transmission exposure.
async function createSubscriptionCheckout(/* args */) {
  throw new Error(
    "Stripe not configured — needs Dino's keys. Collector Pass REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk)."
  );
}

// Verifies a Stripe webhook signature header against the raw request body,
// implementing Stripe's documented scheme (t=<ts>,v1=<hmac-sha256 of
// "<ts>.<payload>" with STRIPE_WEBHOOK_SECRET), including a 300s timestamp
// tolerance. Production hardening note: prefer the official stripe SDK's
// constructEvent for edge cases; this dependency-free version is exact for
// the documented scheme.
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) {
    throw new Error('Stripe webhook not configured — set STRIPE_WEBHOOK_SECRET');
  }
  const parts = String(signatureHeader || '')
    .split(',')
    .map((s) => s.trim());
  const t = (parts.find((p) => p.startsWith('t=')) || '').slice(2);
  const v1s = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || v1s.length === 0) throw new Error('malformed Stripe-Signature header');

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${payload}`, 'utf8')
    .digest('hex');

  const ok = v1s.some(
    (v1) => v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1, 'utf8'), Buffer.from(expected, 'utf8'))
  );
  if (!ok) throw new Error('webhook signature mismatch');

  const ts = parseInt(t, 10);
  const age = Math.abs(Date.now() / 1000 - ts);
  if (!Number.isFinite(age) || age > 300) throw new Error('webhook timestamp outside tolerance');

  return JSON.parse(payload);
}

module.exports = {
  isConfigured,
  buildCheckoutSessionParams,
  buildSubscriptionCheckoutParams,
  createCheckoutSession,
  createSubscriptionCheckout,
  verifyWebhookSignature,
};
