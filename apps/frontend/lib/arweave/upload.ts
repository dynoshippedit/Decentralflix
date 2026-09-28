import Arweave from 'arweave';
import type { JWKInterface } from 'arweave/node/lib/wallet';

/**
 * Arweave Upload Pipeline for Decentralflix (Phase 0)
 *
 * Uses the official `arweave` package for direct, stable uploads.
 * This is the reliable approach as of 2026 (Irys Arweave support has been deprecated).
 *
 * For production large video uploads, consider:
 * - ar.io Turbo (paid fast uploads)
 * - Irys datachain (new recommended path)
 * - Or chunked uploads + manifest
 *
 * For Phase 0 we keep it simple and direct.
 */

export interface UploadResult {
  id: string;           // Arweave transaction ID
  url: string;          // https://arweave.net/{id}
  size: number;
  timestamp: number;
}

let arweaveInstance: Arweave | null = null;

function getArweave() {
  if (!arweaveInstance) {
    arweaveInstance = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https',
      timeout: 20000,
      logging: false,
    });
  }
  return arweaveInstance;
}

/**
 * Load Arweave wallet from environment (JWK JSON string or file path)
 * In practice we will load from process.env.ARWEAVE_WALLET_JSON
 */
function loadWallet(): JWKInterface {
  const walletJson = process.env.ARWEAVE_WALLET_JSON;
  if (!walletJson) {
    throw new Error(
      'ARWEAVE_WALLET_JSON is not set. Please provide a valid Arweave wallet JWK in .env.local'
    );
  }
  try {
    return JSON.parse(walletJson) as JWKInterface;
  } catch (e) {
    throw new Error('ARWEAVE_WALLET_JSON is not valid JSON. It must be the full JWK object.');
  }
}

/**
 * Upload a Buffer to Arweave
 */
export async function uploadToArweave(
  fileBuffer: Buffer,
  contentType: string,
  tags: Record<string, string> = {}
): Promise<UploadResult> {
  const arweave = getArweave();
  const wallet = loadWallet();

  const transaction = await arweave.createTransaction({ data: fileBuffer }, wallet);

  // Standard tags
  transaction.addTag('Content-Type', contentType);
  transaction.addTag('App-Name', 'Decentralflix');
  transaction.addTag('App-Version', '0.1.0');

  // Custom tags
  Object.entries(tags).forEach(([name, value]) => {
    transaction.addTag(name, value);
  });

  await arweave.transactions.sign(transaction, wallet);
  const response = await arweave.transactions.post(transaction);

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Arweave upload failed with status ${response.status}`);
  }

  return {
    id: transaction.id,
    url: `https://arweave.net/${transaction.id}`,
    size: fileBuffer.length,
    timestamp: Date.now(),
  };
}

/**
 * Upload JSON data (metadata, manifests, etc.)
 */
export async function uploadJSON(
  data: unknown,
  tags: Record<string, string> = {}
): Promise<UploadResult> {
  const json = JSON.stringify(data);
  const buffer = Buffer.from(json, 'utf-8');

  return uploadToArweave(buffer, 'application/json', {
    ...tags,
    'Content-Type': 'application/json',
  });
}

/**
 * Placeholder for large video streaming uploads (Phase 1+ improvement)
 */
export async function uploadLargeVideo(
  fileBuffer: Buffer,
  contentType = 'video/mp4',
  tags: Record<string, string> = {}
): Promise<UploadResult> {
  // For very large files (> 100MB), consider using Turbo or chunked + manifest
  return uploadToArweave(fileBuffer, contentType, {
    ...tags,
    'File-Type': 'video',
  });
}

export default {
  uploadToArweave,
  uploadJSON,
  uploadLargeVideo,
};
