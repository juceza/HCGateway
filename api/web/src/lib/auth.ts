// Auth state + persistence for the read-only web dashboard.
//
// The session (access token, rotated refresh token, expiry, username) is held
// in `localStorage` under a single key. This is an accepted trade-off: a stored
// token is readable by any script that achieves XSS, but for a self-hosted,
// single-user dashboard served over HTTPS the alternative (an in-memory-only
// access token) loses the session on every reload — a poor fit for a tool the
// owner opens occasionally to glance at their own data. See TechSpec
// "Key Decisions" (localStorage token storage).

/** The persisted session. `expiry` is the ISO-8601 string returned by the API. */
export interface AuthState {
  token: string;
  refresh: string;
  expiry: string;
  username: string;
}

const STORAGE_KEY = 'hcgateway.auth';

/** Read the persisted session, or `null` when logged out / unparseable. */
export function getAuth(): AuthState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (
      typeof parsed?.token === 'string' &&
      typeof parsed.refresh === 'string' &&
      typeof parsed.expiry === 'string' &&
      typeof parsed.username === 'string'
    ) {
      return parsed as AuthState;
    }
  } catch {
    // Corrupt value — treat as logged out.
  }
  return null;
}

/** Persist the session under the single storage key. */
export function setAuth(state: AuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Drop the session (logout, terminal auth failure). */
export function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}
