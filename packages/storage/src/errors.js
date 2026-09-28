/**
 * @decentralflix/storage — error taxonomy.
 *
 * All errors thrown by this package extend StorageError. Network and
 * service errors are wrapped with the failing operation's context so
 * callers can distinguish "fragment not found" from "service down".
 */

export class StorageError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message);
    this.name = this.constructor.name;
    if (code !== undefined) this.code = code;
    if (status !== undefined) this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Input validation failure (bad Buffer, key, filmId, endpoint, …). */
export class ValidationError extends StorageError {}

/** Kubo / IPFS HTTP API failure (timeout, non-200, invalid JSON, …). */
export class IpfsError extends StorageError {}

/** Arweave gateway failure (timeout, non-200, missing signer, …). */
export class ArweaveError extends StorageError {}

/**
 * Payload exceeds the Arweave gate. This package uses Arweave for
 * manifests/proofs only — never video bytes — and enforces a hard
 * 1 MiB cap per transaction.
 */
export class PayloadTooLargeError extends StorageError {}

/**
 * A retrieved fragment's sha256 did not match the manifest.
 * Thrown before decryption, so corrupted bytes never reach the cipher.
 */
export class TamperError extends StorageError {
  constructor(message, { fragmentIndex, expected, actual } = {}) {
    super(message, { code: 'TAMPER_DETECTED' });
    if (fragmentIndex !== undefined) this.fragmentIndex = fragmentIndex;
    if (expected !== undefined) this.expectedHash = expected;
    if (actual !== undefined) this.actualHash = actual;
  }
}
