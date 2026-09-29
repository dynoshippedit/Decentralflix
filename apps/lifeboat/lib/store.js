'use strict';
// JSON-file persistence with atomic writes (write tmp + rename).
// Collections: films.json, entitlements.json, claims.json, receipts.json,
// passes.json, credit_ledger.json, filmmakers.json, migration_contacts.json,
// orders.json — all under ./data/.
// No SQLite by design: the lifeboat keeps state human-inspectable and
// dependency-free.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Test/dev hook: point the store at a scratch directory so crash-recovery
// tests never touch the real data/. Production code never calls this.
let dataDirOverride = null;
function setDataDir(dir) { dataDirOverride = dir; }
function dataDir() { return dataDirOverride || DATA_DIR; }

const FILES = {
  films: 'films.json',
  entitlements: 'entitlements.json',
  claims: 'claims.json',
  receipts: 'receipts.json',
  passes: 'passes.json',
  credit_ledger: 'credit_ledger.json',
  filmmakers: 'filmmakers.json',
  // Migration contacts: Vimeo audience-export rows recorded for migration
  // NOTICES ONLY. Never entitlements — the export is opt-in contacts, not a
  // purchase ledger. Access requires claim + filmmaker approval.
  migration_contacts: 'migration_contacts.json',
  // Sales ledger: one record per completed bundle (and, in future, per
  // purchase), with explicit per-film revenue allocation.
  orders: 'orders.json',
  // Auth: email+password accounts and bearer-token sessions.
  accounts: 'accounts.json',
  sessions: 'sessions.json',
};

const ID_FIELDS = {
  films: 'film_id',
  entitlements: 'entitlement_id',
  claims: 'claim_id',
  receipts: 'receipt_id',
  passes: 'pass_id',
  credit_ledger: 'ledger_id',
  filmmakers: 'filmmaker_id',
  migration_contacts: 'contact_id',
  orders: 'order_id',
  accounts: 'account_id',
  sessions: 'token',
};

function filePath(name) {
  if (!FILES[name]) throw new Error(`unknown collection: ${name}`);
  return path.join(dataDir(), FILES[name]);
}

function all(name) {
  try {
    const raw = fs.readFileSync(filePath(name), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function saveAll(name, arr) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = filePath(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
  // Atomic publish: readers never observe a half-written file.
  fs.renameSync(tmp, filePath(name));
}

function get(name, id) {
  const key = ID_FIELDS[name];
  return all(name).find((r) => r[key] === id) || null;
}

function insert(name, record) {
  const arr = all(name);
  arr.push(record);
  saveAll(name, arr);
  return record;
}

function update(name, id, patch) {
  const key = ID_FIELDS[name];
  const arr = all(name);
  const idx = arr.findIndex((r) => r[key] === id);
  if (idx === -1) return null;
  Object.assign(arr[idx], patch);
  saveAll(name, arr);
  return arr[idx];
}

// Delete the record with the given id from a collection.
// Returns true when a row was actually removed, false when absent.
// SEC-002: logout (and expired-session cleanup) depend on this to revoke
// bearer sessions; it previously did not exist, so logout was a silent no-op.
function remove(name, id) {
  const key = ID_FIELDS[name];
  const arr = all(name);
  const kept = arr.filter((r) => r[key] !== id);
  if (kept.length === arr.length) return false;
  saveAll(name, kept);
  return true;
}

// ---------------------------------------------------------------------------
// Crash-safe multi-file transactions (DAT-002).
//
// Each single-file write is atomic (tmp+rename), but a *sequence* of writes
// to different files is not: a crash between them leaves divergent state —
// a signed receipt with no entitlement, a debited credit with no grant, an
// approved entitlement with the claim still pending, entitlements with no
// sales order.
//
// txnBegin/txnInsert/txnUpdate/txnCommit implement a write-ahead journal:
//   1. the full intended write set is appended to .journal.jsonl and fsync'd
//      — the record of intent is durable FIRST;
//   2. each write is applied (atomic per file);
//   3. a commit marker is appended and fsync'd.
//
// reconcileOnBoot() — called once before the server listens — re-applies
// every staged-but-uncommitted txn idempotently (inserts are
// insert-if-absent by the collection's id field; updates are
// update-if-present), then marks it committed. A crash at any point
// therefore converges to all-or-nothing: nothing staged => nothing
// happened; staged => every write is present after the next boot.
// The journal is compacted on boot so it stays small.

function journalPath() {
  return path.join(dataDir(), '.journal.jsonl');
}

function journalAppend(obj) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const fd = fs.openSync(journalPath(), 'a');
  try {
    fs.writeSync(fd, JSON.stringify(obj) + '\n', null, 'utf8');
    fs.fsyncSync(fd); // the intent must be durable before any write is applied
  } finally {
    fs.closeSync(fd);
  }
}

function txnBegin(label) {
  return {
    txn_id: 'txn_' + crypto.randomBytes(8).toString('hex'),
    label: String(label || 'unnamed'),
    writes: [],
  };
}

function txnInsert(txn, name, record) {
  filePath(name); // validate the collection name at stage time, not at commit
  txn.writes.push({ op: 'insert', collection: name, record });
  return record;
}

function txnUpdate(txn, name, id, patch) {
  filePath(name);
  txn.writes.push({ op: 'update', collection: name, id, patch });
}

// Idempotent application: safe to run twice, so a crash mid-application
// is completed — never duplicated — by recovery.
function applyWrite(w) {
  const key = ID_FIELDS[w.collection];
  if (w.op === 'insert') {
    if (get(w.collection, w.record[key])) return 'skipped-present';
    const arr = all(w.collection);
    arr.push(w.record);
    saveAll(w.collection, arr);
    return 'inserted';
  }
  if (w.op === 'update') {
    const arr = all(w.collection);
    const idx = arr.findIndex((r) => r[key] === w.id);
    if (idx === -1) return 'skipped-missing';
    Object.assign(arr[idx], w.patch);
    saveAll(w.collection, arr);
    return 'updated';
  }
  throw new Error('unknown txn op: ' + w.op);
}

// Durably record the intent without applying it. Exported for the crash
// simulation in the DAT-002 regression test (stage, apply part, "crash").
function txnStage(txn) {
  journalAppend({
    txn_id: txn.txn_id,
    label: txn.label,
    status: 'staged',
    writes: txn.writes,
    ts: new Date().toISOString(),
  });
}

function txnMarkCommitted(txn_id) {
  journalAppend({ txn_id: txn_id, status: 'committed', ts: new Date().toISOString() });
}

function txnCommit(txn) {
  if (txn.writes.length === 0) return { committed: 0 };
  txnStage(txn); // intent durable first
  for (const w of txn.writes) applyWrite(w);
  txnMarkCommitted(txn.txn_id); // all-or-nothing point
  return { committed: txn.writes.length };
}

function readJournal() {
  let raw;
  try {
    raw = fs.readFileSync(journalPath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return raw.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
}

// Re-apply every staged-but-uncommitted txn, then compact the journal.
// Returns { recovered } for the startup log.
function reconcileOnBoot() {
  const staged = new Map();
  const committed = new Set();
  for (const e of readJournal()) {
    if (e.status === 'staged' && e.txn_id && Array.isArray(e.writes)) staged.set(e.txn_id, e);
    else if (e.status === 'committed' && e.txn_id) committed.add(e.txn_id);
  }
  let recovered = 0;
  for (const entry of staged.values()) {
    if (committed.has(entry.txn_id)) continue;
    for (const w of entry.writes) applyWrite(w);
    txnMarkCommitted(entry.txn_id);
    recovered += 1;
  }
  // Compact: committed work is durable in the collections; the journal only
  // needs to carry still-uncommitted intent (none, after this pass).
  try {
    fs.unlinkSync(journalPath());
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return { recovered: recovered };
}

module.exports = {
  all, get, insert, update, remove, DATA_DIR,
  setDataDir, txnBegin, txnInsert, txnUpdate, txnStage, txnCommit, reconcileOnBoot,
};

