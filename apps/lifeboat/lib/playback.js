'use strict';
// DF-MEDIA-3: short-lived signed playback URLs (presigned-URL pattern).
//
// Problem: GET /api/films/:id/stream requires an `Authorization: Bearer`
// header, which a native <video> element cannot send — so the entitled
// stream path was unreachable from the browser player.
//
// Fix: an entitled pass holder mints a short-lived, HMAC-signed playback URL
// over the normal authed JSON API
//   GET /api/passes/:id/playback-url?film=<filmId>
// and hands THAT url to the <video> element. The media endpoint
//   GET /api/media/play?pass=..&film=..&exp=..&sig=..
// verifies the signature + expiry itself, so no header is needed and there
// are no cookie/CORS workarounds. Works with CDNs and native <video>.
//
// The signature binds (passId, filmId, expiry). Verification is constant-time.
// URLs live PLAYBACK_URL_TTL_SECS (15 minutes). The signing secret comes from
// DECENTRALFLIX_MEDIA_SECRET; when unset a dev-only default is used and a
// warning is printed at startup (production must set the env var).

const crypto = require('node:crypto');

const PLAYBACK_URL_TTL_SECS = 900; // 15 minutes — short-lived by design

function mediaSecret() {
  const s = process.env.DECENTRALFLIX_MEDIA_SECRET;
  if (s) return s;
  return 'dev-only-insecure-media-secret';
}

function secretIsDefault() {
  return !process.env.DECENTRALFLIX_MEDIA_SECRET;
}

function signPlayback(passId, filmId, exp) {
  return crypto
    .createHmac('sha256', mediaSecret())
    .update(`${passId}.${filmId}.${exp}`)
    .digest('hex');
}

/**
 * Mint a signed playback URL. The caller must already have authenticated the
 * pass holder and checked the film entitlement (see passPlaybackUrl in
 * server.js) — this function only signs.
 */
function mintPlaybackUrl({ passId, filmId, nowSecs = Math.floor(Date.now() / 1000) }) {
  const exp = nowSecs + PLAYBACK_URL_TTL_SECS;
  const sig = signPlayback(passId, filmId, exp);
  const q = new URLSearchParams({ pass: passId, film: filmId, exp: String(exp), sig });
  return {
    url: `/api/media/play?${q.toString()}`,
    expires_at: new Date(exp * 1000).toISOString(),
    expires_in: PLAYBACK_URL_TTL_SECS,
  };
}

/**
 * Verify a playback URL's query parameters. Returns { ok: true, ... } or
 * { ok: false, reason }. Pure function — no I/O, safe to unit-test.
 */
function verifyPlaybackUrl({ pass, film, exp, sig, nowSecs = Math.floor(Date.now() / 1000) }) {
  if (!pass || !film || !exp || !sig) return { ok: false, reason: 'missing parameters' };
  const expNum = Number(exp);
  if (!Number.isInteger(expNum)) return { ok: false, reason: 'bad expiry' };
  if (expNum <= nowSecs) return { ok: false, reason: 'expired' };
  const expected = signPlayback(pass, film, expNum);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, reason: 'bad signature' };
  return { ok: true, passId: pass, filmId: film, exp: expNum };
}

module.exports = {
  PLAYBACK_URL_TTL_SECS,
  mediaSecret,
  secretIsDefault,
  signPlayback,
  mintPlaybackUrl,
  verifyPlaybackUrl,
};
