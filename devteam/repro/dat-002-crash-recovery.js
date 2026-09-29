#!/usr/bin/env node
// DAT-002 regression: a crash between the writes of a multi-file grant
// sequence must converge to all-or-nothing after the next boot.
//
// Simulates each crash point of the write-ahead journal protocol using a
// scratch data dir (store.setDataDir) — never touches the real data/.
// Exit 0 on full pass, non-zero on any failure.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const store = require(path.join(__dirname, '..', '..', 'apps', 'lifeboat', 'lib', 'store.js'));

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok: ' + msg);
  else { failures++; console.log('FAIL: ' + msg); }
}

function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dat002-'));
  store.setDataDir(d);
  return d;
}

function journalExists(dir) {
  return fs.existsSync(path.join(dir, '.journal.jsonl'));
}

// --- 1. Crash mid-application: intent journaled, only the first of two
// --- writes applied. Recovery must complete the missing write.
{
  const dir = freshDir();
  const t = store.txnBegin('test-grant');
  store.txnInsert(t, 'receipts', { receipt_id: 'r_1', film_id: 'f1' });
  store.txnInsert(t, 'entitlements', { entitlement_id: 'ent_1', film_id: 'f1', receipt_id: 'r_1' });
  store.txnStage(t); // intent durable — the crash happens HERE
  // The crashed run managed to apply only the first write (via the same
  // public insert path txnCommit uses):
  store.insert('receipts', t.writes[0].record);

  check(store.get('receipts', 'r_1') !== null, 'receipt was applied before the crash');
  check(store.get('entitlements', 'ent_1') === null, 'entitlement missing before recovery (divergent state)');

  const r = store.reconcileOnBoot();
  check(r.recovered === 1, 'recovery picked up the interrupted txn');
  check(store.get('entitlements', 'ent_1') !== null, 'recovery completed the missing write — no divergence');
  check(store.all('entitlements').filter((e) => e.entitlement_id === 'ent_1').length === 1,
    're-apply did not duplicate the entitlement');
  check(store.all('receipts').filter((e) => e.receipt_id === 'r_1').length === 1,
    're-apply did not duplicate the receipt');

  const r2 = store.reconcileOnBoot();
  check(r2.recovered === 0, 'second boot is a no-op (idempotent)');
  check(!journalExists(dir), 'journal compacted after recovery');
}

// --- 2. Crash before staging: the txn lived only in memory. ---
{
  const dir = freshDir();
  const t = store.txnBegin('test-nothing');
  store.txnInsert(t, 'receipts', { receipt_id: 'r_9', film_id: 'f9' });
  // Crash here: nothing journaled, nothing applied.
  const r = store.reconcileOnBoot();
  check(r.recovered === 0, 'nothing staged => nothing to recover');
  check(store.get('receipts', 'r_9') === null, 'unstaged write never happened');
  check(!journalExists(dir), 'no journal noise from an unstaged txn');
}

// --- 3. Normal commit: boot must not re-apply. ---
{
  freshDir();
  const t = store.txnBegin('test-normal');
  store.txnInsert(t, 'receipts', { receipt_id: 'r_2', film_id: 'f2' });
  store.txnInsert(t, 'entitlements', { entitlement_id: 'ent_2', film_id: 'f2', receipt_id: 'r_2' });
  const c = store.txnCommit(t);
  check(c.committed === 2, 'commit applied both writes');
  const r = store.reconcileOnBoot();
  check(r.recovered === 0, 'committed txn is not re-applied on boot');
  check(store.all('receipts').filter((e) => e.receipt_id === 'r_2').length === 1, 'no duplicate receipt');
}

// --- 4. Update path (approveClaim shape): grant applied, claim-status
// --- flip lost. Recovery must complete the flip.
{
  freshDir();
  store.insert('claims', { claim_id: 'c_1', status: 'pending' });
  const t = store.txnBegin('test-approve');
  store.txnInsert(t, 'entitlements', { entitlement_id: 'ent_3', film_id: 'f3' });
  store.txnUpdate(t, 'claims', 'c_1', { status: 'approved' });
  store.txnStage(t); // crash here
  store.insert('entitlements', t.writes[0].record); // only the grant got out

  check(store.get('claims', 'c_1').status === 'pending', 'claim flip missing before recovery');
  const r = store.reconcileOnBoot();
  check(r.recovered === 1, 'recovery picked up the interrupted approve txn');
  check(store.get('claims', 'c_1').status === 'approved', 'claim status flip completed — no divergence');
}

if (failures === 0) console.log('DAT-002 crash-recovery: all checks passed');
else console.log('DAT-002 crash-recovery: ' + failures + ' check(s) FAILED');
process.exit(failures === 0 ? 0 : 1);
