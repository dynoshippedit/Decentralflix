/**
 * DF-MEDIA-3 — signed playback URL client (lifeboat backend).
 *
 * The lifeboat `/api/films/:id/stream` endpoint requires an
 * `Authorization: Bearer` header, which a native `<video>` element cannot
 * send. The fix is the presigned-URL pattern:
 *
 * 1. This client mints a short-lived signed playback URL over the normal
 *    authed JSON API: GET /api/passes/:id/playback-url?film=<filmId>
 *    (holder check = the pass owner's Bearer token, same as passDetail).
 * 2. The returned `url` (e.g. /api/media/play?pass=..&film=..&exp=..&sig=..)
 *    goes straight into `<video src>` — the HMAC signature in the query
 *    string IS the credential, so no header, cookie, or CORS workaround is
 *    needed. Works with native <video> and CDNs.
 *
 * URLs expire after 15 minutes (server-side). On expiry, mint a fresh one.
 */

export interface PlaybackUrlResult {
  /** Signed playback URL (relative to the lifeboat origin). */
  url: string;
  /** ISO timestamp when the URL expires. */
  expiresAt: string;
  /** Seconds until expiry (900 at mint time). */
  expiresIn: number;
  passId: string;
  filmId: string;
}

export class PlaybackUrlError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PlaybackUrlError";
    this.status = status;
  }
}

export interface FetchPlaybackUrlOptions {
  /** Lifeboat origin, e.g. http://127.0.0.1:8080 */
  baseUrl: string;
  passId: string;
  filmId: string;
  /** Bearer token for the MINT call (never attached to the <video>). */
  token: string;
}

/**
 * Mint a signed playback URL for an entitled pass holder.
 * Throws PlaybackUrlError on 401 (bad token), 403 (not the pass holder or not
 * entitled to the film), 404 (pass/film unknown), or transport failures.
 */
export async function fetchPlaybackUrl(opts: FetchPlaybackUrlOptions): Promise<PlaybackUrlResult> {
  const { baseUrl, passId, filmId, token } = opts;
  if (!token) throw new PlaybackUrlError(401, "authentication required: no token");
  const endpoint =
    `${baseUrl.replace(/\/$/, "")}/api/passes/${encodeURIComponent(passId)}` +
    `/playback-url?film=${encodeURIComponent(filmId)}`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch (err) {
    throw new PlaybackUrlError(0, `playback URL request failed: ${(err as Error).message}`);
  }
  if (res.status === 401) throw new PlaybackUrlError(401, "authentication required");
  if (res.status === 403) throw new PlaybackUrlError(403, "not entitled: pass does not belong to this account or no film entitlement");
  if (res.status === 404) throw new PlaybackUrlError(404, "pass or film not found");
  if (!res.ok) throw new PlaybackUrlError(res.status, `playback URL request failed: HTTP ${res.status}`);
  // NOTE: the lifeboat API uses snake_case (expires_at, expires_in, ...).
  const data = (await res.json()) as {
    url?: unknown;
    expires_at?: unknown;
    expires_in?: unknown;
    pass_id?: unknown;
    film_id?: unknown;
  } | null;
  if (!data || typeof data.url !== "string" || !data.url) {
    throw new PlaybackUrlError(res.status, "malformed playback URL response");
  }
  return {
    url: data.url,
    expiresAt: typeof data.expires_at === "string" ? data.expires_at : "",
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 0,
    passId: typeof data.pass_id === "string" ? data.pass_id : passId,
    filmId: typeof data.film_id === "string" ? data.film_id : filmId,
  };
}

/**
 * Resolve a (possibly relative) signed playback URL against the lifeboat
 * origin, producing the final `<video src>`.
 */
export function resolvePlaybackSrc(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return baseUrl.replace(/\/$/, "") + (url.startsWith("/") ? url : `/${url}`);
}
