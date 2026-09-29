#!/usr/bin/env node
'use strict';
// repro/dat-001-store-concurrency.js — DAT lane, 2026-09-29
//
// Demonstrates two structural properties of apps/lifeboat/lib/store.js:
//
//  (1) store.remove() does not exist — the session-cleanup calls in
//      server.js:210 (expired session) and server.js:324 (logout) are dead
//      code. Logout never invalidates the bearer token; expired sessions are
//      never pruned (sessions.json grows without bound).
//
//  (2) Lost update: every write is read-modify-write of a whole JSON file
//      with no lock. Two writers interleaving lose one writer's records.
//      Demonstrated with an exact copy of store.js repointed at a scratch
//      data dir (/tmp/dat-repro-data) — the real data/ dir is never touched.
//      The copy's all()/insert() bodies are byte-identical to the original;
//      only DATA_DIR differs.
//
// Run: node devteam/repro/dat-001-store-concurrency.js
// Expected: both DEMONSTRATED lines print; exit 0.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRATCH = '/tmp/dat-repro-data';
const COPY = path.join(SCRATCH, 'store-copy.js');

function setup() {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(SCRATCH, { recursive: true });
  const orig = fs.readFileSync(
    '/home/dino/Decentralflix/apps/lifeboat/lib/store.js', 'utf8');
  // Repoint DATA_DIR at scratch; keep every function body byte-identical.
  const patched = orig.replace(
    "const DATA_DIR = path.join(__dirname, '..', 'data');",
    `const DATA_DIR = ${JSON.stringify(path.join(SCRATCH, 'data'))};`);
  if (patched === orig) throw new Error('DATA_DIR patch did not apply');
  fs.writeFileSync(COPY, patched);
}

// --- (1) store.remove is not a function -------------------------------------
const realStore = require('/home/dino/Decentralflix/apps/lifeboat/lib/store.js');
let removeThrows = false;
try {
  realStore.remove('sessions', 'deadbeef');
} catch (e) {
  removeThrows = e instanceof TypeError && /not a function/.test(e.message);
}
console.log('real store exports:', Object.keys(realStore).join(','));
console.log('DEMONSTRATED(1): store.remove() throws TypeError ->', removeThrows);

// --- (2) lost update ---------------------------------------------------------
setup();
// Load the copy twice (cache-bust) to simulate two independent processes.
function loadCopy(tag) {
  const p = COPY + '?tag=' + tag;
  delete require.cache[require.resolve(COPY)];
  return require(COPY);
}
const procA = loadCopy('A');
const procB = loadCopy('B');

procA.insert('entitlements', { entitlement_id: 'ent_seed', film_id: 'film_x', email: 'seed@example.com' });

// Interleaving: A reads the whole collection...
const snapA = procA.all('entitlements');
// ...B completes a full read-modify-write insert...
procB.insert('entitlements', { entitlement_id: 'ent_B', film_id: 'film_x', email: 'b@example.com' });
// ...then A pushes onto its STALE snapshot and publishes it.
// saveAll is not exported, so the repro performs the same two syscalls as
// store.js saveAll (tmp write + rename, store.js:84-88) on A's stale snapshot.
snapA.push({ entitlement_id: 'ent_A', film_id: 'film_x', email: 'a@example.com' });
const dataDir = path.join(SCRATCH, 'data');
const target = path.join(dataDir, 'entitlements.json');
const tmp = target + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(snapA, null, 2) + '\n', 'utf8');
fs.renameSync(tmp, target);

const finalIds = procA.all('entitlements').map((e) => e.entitlement_id).sort();
console.log('final entitlements:', finalIds.join(','));
const lostB = !finalIds.includes('ent_B');
console.log('DEMONSTRATED(2): writer B record lost by interleaved writers ->', lostB);

if (!removeThrows || !lostB) {
  console.error('REPRO FAILED: expected both demonstrations to hold');
  process.exit(1);
}
console.log('OK: both properties demonstrated');
