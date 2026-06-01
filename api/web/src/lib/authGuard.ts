// Pure auth-routing decisions for the SPA guard and login screen.
//
// The TanStack Router route files (`_authed.tsx`, `login.tsx`) stay thin and
// delegate every decision here so the logic is unit-testable and lands under
// the `src/lib/**` coverage gate. Typed guard with `?redirect=`.

import { AuthError } from "./api";
import { type AuthState, getAuth } from "./auth";

/** The login redirect target, carrying the originally-requested path. */
export interface LoginRedirect {
  to: "/login";
  search: { redirect: string };
}

/**
 * Guard decision for a protected location. With no valid session, returns the
 * `/login` redirect carrying `?redirect=<href>` so the user lands back on the
 * deep-linked path after authenticating. Returns
 * `null` when a session exists and the route may load.
 *
 * `auth` defaults to the persisted session but is injectable for testing.
 */
export function guardRedirect(
  href: string,
  auth: AuthState | null = getAuth(),
): LoginRedirect | null {
  if (auth) return null;
  return { to: "/login", search: { redirect: href } };
}

/**
 * Map an error surfaced during a guarded load to a `/login` bounce. Only an
 * `AuthError` (a *failed* silent refresh — `apiFetch` already retries a
 * recoverable 401 transparently) terminates the session, so only it routes to
 * login; every other error returns `null` and is left to normal error UI. This
 * is what prevents a "phantom logout" on recoverable 401s.
 */
export function authErrorRedirect(error: unknown): { to: "/login" } | null {
  return error instanceof AuthError ? { to: "/login" } : null;
}

/**
 * True when the page is served over plain HTTP. Drives the login security
 * notice — mirroring the Android app's HTTP warning. HTTPS (and the
 * `https:` of a proxied deploy) suppresses it.
 */
export function isInsecureOrigin(protocol: string): boolean {
  return protocol === "http:";
}

/**
 * Resolve where to land after a successful login. Honors the `?redirect=`
 * target when it is a safe in-app path (a single leading slash — never a
 * protocol-relative `//host` or absolute URL, which would be an open redirect),
 * otherwise falls back to the dashboard root.
 */
export function postLoginTarget(redirect?: string): string {
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }
  return "/";
}
