#!/usr/bin/env node
// STR-001 regression: the Lifeboat UI must send auth.
// Loads public/app.js with shimmed window/localStorage/fetch and asserts:
//   1. DFL.login posts credentials to /api/auth/login and stores token+account
//   2. getJSON/postJSON/patchJSON attach "Authorization: Bearer <token>"
//   3. DFL.logout posts to /api/auth/logout with the Bearer header, then clears storage
//   4. no token -> no Authorization header (unauthenticated requests unchanged)
//   5. failed login (401) throws and stores nothing
// On pre-fix code DFL.login does not exist, so this script fails there.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok: ' + msg);
  else { failures++; console.log('FAIL: ' + msg); }
}

// --- fake browser environment ---------------------------------------------
const calls = [];
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

let loginBehavior = 'ok'; // 'ok' | 'bad'
function fakeFetch(url, opts) {
  calls.push({ url: String(url), opts: opts || {} });
  const u = String(url);
  const json = (obj) => Promise.resolve(obj);
  if (u.endsWith('/api/auth/login') && (opts.method || 'GET') === 'POST') {
    const body = JSON.parse((opts.body || '{}'));
    if (loginBehavior === 'bad' || body.email !== 'filmmaker@example.com' || body.password !== 'pw123') {
      return Promise.resolve({
        ok: false, status: 401,
        json: () => json({ error: 'invalid email or password' }),
        text: () => Promise.resolve('invalid email or password'),
      });
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: () => json({ token: 'tok_abc123', expires_at: '2099-01-01T00:00:00Z',
        account: { account_id: 'a1', email: 'filmmaker@example.com', role: 'filmmaker' } }),
    });
  }
  if (u.endsWith('/api/auth/logout') && (opts.method || 'GET') === 'POST') {
    return Promise.resolve({ ok: true, status: 200, json: () => json({ ok: true }) });
  }
  if (u.endsWith('/api/auth/me')) {
    return Promise.resolve({ ok: true, status: 200, json: () => json({ account_id: 'a1' }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: () => json({}) });
}

const sandbox = {
  window: {},
  localStorage,

  fetch: fakeFetch,
  console,
  URLSearchParams,
  JSON, Object, String, Number, Promise, Array, Error, encodeURIComponent,
};
sandbox.window.localStorage = localStorage; // real browsers: window.localStorage === localStorage
vm.createContext(sandbox);
const APP_JS = process.env.STR001_APP_JS || path.join(__dirname, '..', '..', 'apps', 'lifeboat', 'public', 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');
vm.runInContext(src, sandbox, { filename: 'app.js' });
const DFL = sandbox.window.DFL;

function authHeaderOf(call) {
  const h = call.opts.headers || {};
  return h.Authorization || h.authorization || null;
}

(async () => {
  check(DFL && typeof DFL.login === 'function', 'DFL.login exists (page can sign in)');
  check(typeof DFL.logout === 'function', 'DFL.logout exists');

  // 1. no token -> no Authorization header (unchanged behavior for anon requests)
  calls.length = 0;
  await DFL.getJSON('/api/films');
  check(authHeaderOf(calls[calls.length - 1]) === null, 'no Authorization header without a token');

  // 2. login posts credentials and stores token + account
  calls.length = 0;
  const account = await DFL.login('filmmaker@example.com', 'pw123');
  const loginCall = calls.find((c) => c.url.endsWith('/api/auth/login'));
  check(!!loginCall, 'login POSTed to /api/auth/login');
  check(JSON.parse(loginCall.opts.body).password === 'pw123', 'login sent credentials in body');
  check(account && account.email === 'filmmaker@example.com', 'login resolved with account');
  check(store['dfl.token'] === 'tok_abc123', 'token stored in localStorage');
  check(JSON.parse(store['dfl.account']).email === 'filmmaker@example.com', 'account stored in localStorage');

  // 3. authed requests carry the Bearer token
  calls.length = 0;
  await DFL.getJSON('/api/claims?film_id=f1');
  await DFL.postJSON('/api/claims/c1/approve', {});
  await DFL.patchJSON('/api/films/f1', {});
  const bearers = calls.map(authHeaderOf);
  check(bearers.every((h) => h === 'Bearer tok_abc123'),
    'getJSON/postJSON/patchJSON all send "Authorization: Bearer <token>" (3/3)');

  // 4. logout revokes with the token, then clears local state
  calls.length = 0;
  await DFL.logout();
  const logoutCall = calls.find((c) => c.url.endsWith('/api/auth/logout'));
  check(!!logoutCall, 'logout POSTed to /api/auth/logout');
  check(authHeaderOf(logoutCall) === 'Bearer tok_abc123', 'logout carried the Bearer token');
  check(!('dfl.token' in store) && !('dfl.account' in store), 'logout cleared token + account from localStorage');

  // 5. after logout, requests go out unauthenticated again
  calls.length = 0;
  await DFL.getJSON('/api/films');
  check(authHeaderOf(calls[calls.length - 1]) === null, 'no Authorization header after logout');

  // 6. failed login throws and stores nothing
  loginBehavior = 'bad';
  let threw = false;
  try { await DFL.login('filmmaker@example.com', 'wrong'); } catch (e) { threw = /401/.test(e.message); }
  check(threw, 'bad credentials -> login rejects with 401');
  check(!('dfl.token' in store), 'failed login stored no token');

  console.log(failures === 0 ? 'STR-001 UI auth: all checks passed' : 'STR-001 UI auth: ' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL: uncaught ' + (e && e.stack || e)); process.exit(1); });
