'use strict';
// JSON-file persistence with atomic writes (write tmp + rename).
// Collections: films.json, entitlements.json, claims.json, receipts.json,
// passes.json, credit_ledger.json, filmmakers.json, migration_contacts.json,
// orders.json — all under ./data/.
// No SQLite by design: the lifeboat keeps state human-inspectable and
// dependency-free.

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

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
};

function filePath(name) {
  if (!FILES[name]) throw new Error(`unknown collection: ${name}`);
  return path.join(DATA_DIR, FILES[name]);
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

module.exports = { all, get, insert, update, DATA_DIR };
