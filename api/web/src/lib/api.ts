// Typed API client for the HCGateway `/api/v2` read-only surface.
//
// `apiFetch` is the single boundary every screen goes through: it prefixes
// `/api/v2`, injects the Bearer access token and JSON headers, and centralises
// the auth lifecycle. The critical behaviour is refresh-on-401 — the access
// token expires after 12h and the server returns **401** (not 403, which the
// Android client sees) on expiry. A single in-flight refresh promise coalesces
// concurrent 401s so a burst of parallel requests triggers exactly one
// `/refresh`. A **403** (or a failed refresh) is terminal: it clears the
// session and throws `AuthError`, which the router turns into a redirect to
// `/login`. See TechSpec "Integration Points" (401-vs-403, single-refresh).

import { type AuthState, clearAuth, getAuth, setAuth } from "./auth";
import { displayToCollection } from "./recordTypes";

/** Thrown for any non-2xx response that is not the auth-refresh path. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Thrown when the session is unrecoverable (refresh failed, or a 403). */
export class AuthError extends Error {
  constructor(message = "authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

/** One decrypted record as returned by `POST /api/v2/fetch/<method>`. */
export interface HealthRecord {
  _id: string;
  id: string;
  data: Record<string, unknown>;
  start: string;
  end: string | null;
  app: string;
}

/**
 * Allowlisted Mongo filter accepted by `/fetch` — only the fields
 * `{_id,id,app,start,end}` and ops `{$eq,$ne,$gt,$gte,$lt,$lte,$in,$nin}`.
 * Anything outside the allowlist is rejected server-side with a 400.
 */
export interface AllowlistedQuery {
  start?: { $gte?: string; $lte?: string };
  end?: unknown;
  app?: unknown;
  _id?: unknown;
  id?: unknown;
}

/** Raw session pair returned by `/login` and `/refresh` (no username). */
interface SessionResponse {
  token: string;
  refresh: string;
  expiry: string;
}

const API_PREFIX = "/api/v2";

interface FetchOptions {
  method?: string;
  body?: unknown;
  /** Send the Bearer token and enable refresh-on-401. Default `true`. */
  auth?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rawFetch(
  path: string,
  method: string,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return fetch(`${API_PREFIX}${path}`, init);
}

// Shared in-flight refresh. While a refresh is pending, every concurrent 401
// awaits the SAME promise, so the burst collapses to a single `/refresh` call.
let inflightRefresh: Promise<AuthState> | null = null;

/**
 * Coalesce concurrent refreshes into one network call. On any failure the
 * session is cleared and an `AuthError` is raised — there is no second attempt.
 */
function sharedRefresh(): Promise<AuthState> {
  if (!inflightRefresh) {
    inflightRefresh = refresh()
      .catch((err) => {
        clearAuth();
        throw err instanceof AuthError ? err : new AuthError();
      })
      .finally(() => {
        inflightRefresh = null;
      });
  }
  return inflightRefresh;
}

/**
 * Prefix `/api/v2`, inject Bearer + JSON, and handle the auth lifecycle.
 * On a 401 (when `auth`), refresh once via the shared promise and retry the
 * original request. A 403 — or a failed refresh — clears the session and throws
 * `AuthError`. Any other non-2xx throws `ApiError(status, body)`.
 */
export async function apiFetch<T>(
  path: string,
  opts: FetchOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const token = auth ? (getAuth()?.token ?? null) : null;
  let res = await rawFetch(path, method, body, token);

  if (res.status === 401 && auth) {
    // Access token expired — refresh exactly once, then retry.
    const next = await sharedRefresh(); // throws AuthError on failure
    res = await rawFetch(path, method, body, next.token);
  }

  if (res.status === 403 && auth) {
    // Refresh-token-level failure on an authed request — terminal.
    clearAuth();
    throw new AuthError();
  }

  const parsed = await parseBody(res);

  if (!res.ok) {
    throw new ApiError(res.status, parsed);
  }

  return parsed as T;
}

/**
 * Log in with username + password. Deliberately omits `fcmToken` so the web
 * client never clobbers the device's push token. The server
 * auto-creates an unknown username. The returned session is persisted; the
 * username is carried from the argument since the API does not echo it.
 */
export async function login(
  username: string,
  password: string,
): Promise<AuthState> {
  const session = await apiFetch<SessionResponse>("/login", {
    method: "POST",
    body: { username, password },
    auth: false,
  });
  const state: AuthState = { ...session, username };
  setAuth(state);
  return state;
}

/**
 * Exchange the stored refresh token for a rotated pair and persist it. The
 * username is preserved from the current session (the API does not return it).
 * Throws `AuthError` if there is no session to refresh.
 */
export async function refresh(): Promise<AuthState> {
  const current = getAuth();
  if (!current) throw new AuthError("no session to refresh");

  const session = await apiFetch<SessionResponse>("/refresh", {
    method: "POST",
    body: { refresh: current.refresh },
    auth: false,
  });
  const state: AuthState = { ...session, username: current.username };
  setAuth(state);
  return state;
}

/** Revoke the current session server-side and clear it locally. */
export async function revoke(): Promise<void> {
  await apiFetch<{ success: boolean }>("/revoke", { method: "DELETE" });
  clearAuth();
}

/** Per-type document counts, keyed by display name ("Steps", "HeartRate"). */
export function getCounts(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>("/counts");
}

/**
 * Fetch records for a display-named type over an allowlisted query window.
 * The `/fetch/<method>` segment is derived through the single casing helper
 * (`displayToCollection`) so "HeartRate" hits `/fetch/heartRate`.
 */
export function fetchRecords(
  displayName: string,
  queries: AllowlistedQuery,
): Promise<HealthRecord[]> {
  const method = displayToCollection(displayName);
  return apiFetch<HealthRecord[]>(`/fetch/${method}`, {
    method: "POST",
    body: { queries },
  });
}
