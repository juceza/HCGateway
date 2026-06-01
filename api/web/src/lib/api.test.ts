import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  AuthError,
  apiFetch,
  fetchRecords,
  getCounts,
  login,
  refresh,
  revoke,
} from "./api";
import { type AuthState, getAuth, setAuth } from "./auth";

const INITIAL: AuthState = {
  token: "old-token",
  refresh: "old-refresh",
  expiry: "2026-06-01T12:00:00Z",
  username: "alice",
};

const ROTATED = {
  token: "new-token",
  refresh: "new-refresh",
  expiry: "2026-06-02T12:00:00Z",
};

/** Build a real Response so `apiFetch`'s `res.text()`/`res.ok` behave. */
function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Authorization header sent on a given recorded fetch call. */
function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers.Authorization;
}

/** Parsed JSON body of a given recorded fetch call. */
function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

/** Recorded calls whose URL ends with `suffix`. */
function callsTo(suffix: string): unknown[][] {
  return fetchMock.mock.calls.filter((c) =>
    String(c[0]).endsWith(suffix),
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch — request shaping", () => {
  it("prefixes /api/v2 and injects Bearer + JSON headers", async () => {
    setAuth(INITIAL);
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));

    await apiFetch("/counts");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v2/counts");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer old-token",
      Accept: "application/json",
    });
  });

  it("throws ApiError carrying status and parsed body on non-2xx, non-401", async () => {
    setAuth(INITIAL);
    fetchMock.mockResolvedValue(res(500, { error: "boom" }));

    const err = await getCounts().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).body).toEqual({ error: "boom" });
  });
});

describe("apiFetch — refresh-on-401", () => {
  it("refreshes once, persists the rotated pair, and retries successfully", async () => {
    setAuth(INITIAL);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/refresh")) return res(200, ROTATED);
      if (url.endsWith("/counts")) {
        // Expired until the refresh has run; succeeds on the retry.
        return callsTo("/refresh").length === 0
          ? res(401, { error: "token expired" })
          : res(200, { Steps: 5 });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await getCounts();

    expect(result).toEqual({ Steps: 5 });
    expect(callsTo("/refresh")).toHaveLength(1);
    expect(callsTo("/counts")).toHaveLength(2);
    // Retry used the rotated access token.
    expect(authHeaderOf(callsTo("/counts")[1])).toBe("Bearer new-token");
    // Rotated pair persisted, username preserved.
    expect(getAuth()).toEqual({ ...ROTATED, username: "alice" });
  });

  it("coalesces two concurrent 401s into a single /refresh", async () => {
    setAuth(INITIAL);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/refresh")) return res(200, ROTATED);
      if (url.endsWith("/counts")) {
        return callsTo("/refresh").length === 0
          ? res(401, { error: "token expired" })
          : res(200, { Steps: 5 });
      }
      throw new Error(`unexpected ${url}`);
    });

    const [a, b] = await Promise.all([getCounts(), getCounts()]);

    expect(a).toEqual({ Steps: 5 });
    expect(b).toEqual({ Steps: 5 });
    expect(callsTo("/refresh")).toHaveLength(1);
  });

  it("clears auth and throws AuthError when refresh fails; no second refresh", async () => {
    setAuth(INITIAL);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/refresh")) return res(403, { error: "invalid refresh token" });
      if (url.endsWith("/counts")) return res(401, { error: "token expired" });
      throw new Error(`unexpected ${url}`);
    });

    const err = await getCounts().catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect(getAuth()).toBeNull();
    expect(callsTo("/refresh")).toHaveLength(1);
    // Original request attempted once, never retried after the failed refresh.
    expect(callsTo("/counts")).toHaveLength(1);
  });
});

describe("apiFetch — 403 on an authed request", () => {
  it("clears auth and throws AuthError without attempting a refresh", async () => {
    setAuth(INITIAL);
    fetchMock.mockResolvedValue(res(403, { error: "forbidden" }));

    const err = await getCounts().catch((e) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect(getAuth()).toBeNull();
    expect(callsTo("/refresh")).toHaveLength(0);
  });
});

describe("endpoint helpers", () => {
  it("login omits fcmToken and persists the session with the username", async () => {
    fetchMock.mockResolvedValue(res(201, ROTATED));

    const state = await login("bob", "hunter2");

    const body = bodyOf(callsTo("/login")[0]);
    expect(body).toEqual({ username: "bob", password: "hunter2" });
    expect(body).not.toHaveProperty("fcmToken");
    // No Bearer header on login.
    expect(authHeaderOf(callsTo("/login")[0])).toBeUndefined();
    expect(state).toEqual({ ...ROTATED, username: "bob" });
    expect(getAuth()).toEqual({ ...ROTATED, username: "bob" });
  });

  it("refresh throws AuthError when there is no session", async () => {
    const err = await refresh().catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revoke calls DELETE /revoke and clears the local session", async () => {
    setAuth(INITIAL);
    fetchMock.mockResolvedValue(res(200, { success: true }));

    await revoke();

    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v2/revoke");
    expect(getAuth()).toBeNull();
  });

  it("getCounts returns the display-name → count map", async () => {
    setAuth(INITIAL);
    fetchMock.mockResolvedValue(res(200, { Steps: 10, HeartRate: 3 }));

    await expect(getCounts()).resolves.toEqual({ Steps: 10, HeartRate: 3 });
  });

  it("fetchRecords targets /api/v2/fetch/heartRate via the casing helper", async () => {
    setAuth(INITIAL);
    fetchMock.mockResolvedValue(res(200, []));

    await fetchRecords("HeartRate", { start: { $gte: "2026-05-01T00:00:00Z" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v2/fetch/heartRate");
    expect((init as RequestInit).method).toBe("POST");
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      queries: { start: { $gte: "2026-05-01T00:00:00Z" } },
    });
  });
});

describe("integration — expired-token flow end to end", () => {
  it("401 → silent refresh → original request resolves; localStorage holds the rotated pair", async () => {
    setAuth(INITIAL);
    const records = [
      { _id: "1", id: "1", data: { bpm: 70 }, start: "2026-05-01T00:00:00Z", end: null, app: "com.x" },
    ];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/refresh")) return res(200, ROTATED);
      if (url.endsWith("/fetch/heartRate")) {
        return callsTo("/refresh").length === 0
          ? res(401, { error: "token expired" })
          : res(200, records);
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await fetchRecords("HeartRate", {
      start: { $gte: "2026-05-01T00:00:00Z" },
    });

    expect(result).toEqual(records);
    expect(callsTo("/refresh")).toHaveLength(1);
    expect(getAuth()).toEqual({ ...ROTATED, username: "alice" });
  });
});
