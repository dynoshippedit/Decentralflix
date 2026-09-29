import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchPlaybackUrl, resolvePlaybackSrc, PlaybackUrlError } from "./playback-url";

const OPTS = {
  baseUrl: "http://127.0.0.1:8080",
  passId: "pass_abc123",
  filmId: "film_def456",
  token: "tok",
};

const MINTED = {
  url: "/api/media/play?pass=pass_abc123&film=film_def456&exp=9999999999&sig=deadbeef",
  expires_at: "2286-11-20T17:46:39.000Z",
  expires_in: 900,
  pass_id: "pass_abc123",
  film_id: "film_def456",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response)
  );
}

describe("fetchPlaybackUrl (DF-MEDIA-3)", () => {
  it("entitled holder gets a signed playback URL", async () => {
    mockFetch(200, MINTED);
    const r = await fetchPlaybackUrl(OPTS);
    expect(r.url).toBe(MINTED.url);
    expect(r.expiresIn).toBe(900);
    expect(r.passId).toBe("pass_abc123");
    expect(r.filmId).toBe("film_def456");
    // The mint call carries the Bearer token (the <video> never does).
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "http://127.0.0.1:8080/api/passes/pass_abc123/playback-url?film=film_def456"
    );
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("unauthorized (401) -> PlaybackUrlError, no URL minted", async () => {
    mockFetch(401, { error: "authentication required" });
    await expect(fetchPlaybackUrl(OPTS)).rejects.toMatchObject({ status: 401 });
  });

  it("forbidden (403, wrong holder or not entitled) -> PlaybackUrlError, no URL", async () => {
    mockFetch(403, { error: "pass does not belong to this account" });
    await expect(fetchPlaybackUrl(OPTS)).rejects.toMatchObject({ status: 403 });
  });

  it("not found (404) -> PlaybackUrlError", async () => {
    mockFetch(404, { error: "pass not found" });
    await expect(fetchPlaybackUrl(OPTS)).rejects.toMatchObject({ status: 404 });
  });

  it("missing token -> 401 without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPlaybackUrl({ ...OPTS, token: "" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("malformed body -> PlaybackUrlError", async () => {
    mockFetch(200, { nope: true });
    await expect(fetchPlaybackUrl(OPTS)).rejects.toBeInstanceOf(PlaybackUrlError);
  });
});

describe("resolvePlaybackSrc", () => {
  it("resolves a relative signed URL against the origin for <video> src", () => {
    expect(resolvePlaybackSrc("http://127.0.0.1:8080", MINTED.url)).toBe(
      "http://127.0.0.1:8080" + MINTED.url
    );
  });

  it("passes absolute URLs through untouched", () => {
    expect(resolvePlaybackSrc("http://127.0.0.1:8080", "https://cdn.example/x.mp4")).toBe(
      "https://cdn.example/x.mp4"
    );
  });
});
