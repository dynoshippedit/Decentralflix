/**
 * Decentralflix — Cloudflare Worker Signed URL Client
 *
 * Production path: Calls the deployed Cloudflare Worker which validates NFT ownership
 * (via Privy JWT + Goldsky/Redis) and returns a short-lived, IP-bound signed R2 URL.
 *
 * Simulation / demo mode (reduced per critical fix / review): only when no real NEXT_PUBLIC_CF_WORKER_URL or explicit demo mode.
 * - Returns a playable public HLS test stream for known demo films so the player works immediately.
 * - Clearly marked as simulation.
 */

export type VideoAccessError = {
  needsMint: true;
  mintUrl: string;
  message?: string;
};

const DEMO_FILM_HASHES = [
  'raging-midlife',
  'savage-midlife',
  'signal-lost',
  'the-unmuted',
  'ghost-frame',
];

function isDemoFilm(filmHash: string): boolean {
  if (!filmHash) return false;
  const lower = filmHash.toLowerCase();
  return DEMO_FILM_HASHES.some(h => lower.includes(h) || lower === h);
}

function getDemoPlaybackUrl(filmHash: string): string {
  // F-2 (df-batch2): the old test-streams.github.io URL returns 404.
  // Mux's public test stream is maintained for player testing/embedding
  // (verified live 2026-09-29; matches the videoUrl already used in
  // lib/demo-content.ts). In a real demo environment you would map this to
  // the actual Livepeer playback for the uploaded demo content.
  return `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8?demo=${encodeURIComponent(filmHash)}`;
}

export async function getVideoSignedUrl(
  filmHash: string,
  privyToken?: string | null
): Promise<string | null> {
  const workerUrl = process.env.NEXT_PUBLIC_CF_WORKER_URL;
  const explicitDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  // Critical fix (reduce simulation per review): real worker path (NEXT_PUBLIC_CF_WORKER_URL) is now the default/primary.
  // isDemoFilm and getDemoPlaybackUrl simulation reduced to only trigger in explicit demo mode or when no real config.
  if (!workerUrl || (explicitDemo && isDemoFilm(filmHash))) {
    console.info('[cloudflare-access] SIMULATION MODE active for', filmHash);
    return getDemoPlaybackUrl(filmHash);
  }

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (privyToken) {
      headers['Authorization'] = `Bearer ${privyToken}`;
    }

    const res = await fetch(`${workerUrl}/video/${encodeURIComponent(filmHash)}/index.m3u8`, {
      method: 'GET',
      headers,
      credentials: 'omit',
    });

    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const err: VideoAccessError = {
        needsMint: true,
        mintUrl: body.mintUrl || `/mint?film=${encodeURIComponent(filmHash)}`,
        message: body.message,
      };
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Worker error: ${res.status}`);
    }

    const data = await res.json();
    return data.url || null;
  } catch (err: any) {
    // If it looks like an access error from the worker, re-throw it
    if (err && err.needsMint) {
      throw err;
    }

    // Critical fix (reduce simulation per review): fallback to sim only with no real config or explicit demo
    if (!workerUrl || explicitDemo) {
      console.warn('[cloudflare-access] Worker call failed, falling back to simulation', err);
      return getDemoPlaybackUrl(filmHash);
    }
    // Real config present: surface error (no silent sim)
    throw err;
  }
}
