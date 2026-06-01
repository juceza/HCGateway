// Pure presentation/decision helpers for the authenticated app shell and the
// settings screen. The route files (`_authed.tsx`, `_authed/settings.tsx`) and
// the shell components stay thin and delegate here so the logic lands under the
// `src/lib/**` coverage gate. Mirrors the pattern set by `authGuard.ts`.

import { revoke as defaultRevoke } from './api';
import { clearAuth as defaultClearAuth } from './auth';

/**
 * Public REST API documentation (the link surfaced in the shell). This is the
 * canonical docs URL maintained by the original author — see README "REST API".
 */
export const API_DOCS_URL = 'https://hcgateway.shuchir.dev/';

/**
 * Data-sovereignty copy for the discreet shell badge. Framed as ownership and
 * control — NOT as a zero-knowledge / "we can't read it" promise, because the
 * server decrypts record `data` server-side.
 */
export const SOVEREIGNTY_BADGE_LABEL = 'Your data, on your server';
export const SOVEREIGNTY_BADGE_DETAIL =
  'This dashboard reads from the HCGateway server you control. Your health ' +
  'data lives on your own server, not in a third-party cloud.';

/** A human-readable token-expiry for the shell. */
export interface ExpiryDisplay {
  /** Formatted absolute instant, e.g. "Jun 1, 2026, 12:00 PM UTC". */
  text: string;
  /** True when the access token has already lapsed relative to `now`. */
  expired: boolean;
}

/**
 * Format the persisted `AuthState.expiry` (ISO-8601 from the server) into a
 * stable, human-readable label. Rendered in a fixed UTC zone so the display is
 * deterministic regardless of the viewer's locale/timezone. `now` is injectable
 * for testing. An unparseable value degrades to "Unknown" rather than throwing.
 */
export function formatExpiry(
  expiry: string,
  now: Date = new Date(),
): ExpiryDisplay {
  const date = new Date(expiry);
  if (Number.isNaN(date.getTime())) {
    return { text: 'Unknown', expired: false };
  }
  const text = `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
  return { text, expired: date.getTime() <= now.getTime() };
}

/** Injectable side-effects so the logout orchestration is unit-testable. */
export interface LogoutDeps {
  revoke: () => Promise<void>;
  clearAuth: () => void;
}

/**
 * Log out: revoke the session server-side, then clear local auth state — in
 * that order. A failing `revoke()` (offline, server down, already
 * expired) must NOT trap the user in the app, so the local state is cleared
 * regardless. This never rejects; the caller can unconditionally route to
 * `/login` afterwards.
 */
export async function performLogout(
  deps: LogoutDeps = { revoke: defaultRevoke, clearAuth: defaultClearAuth },
): Promise<void> {
  try {
    await deps.revoke();
  } catch {
    // Revoke failed — fall through and clear local state anyway so logout is
    // never blocked by a server/network problem.
  } finally {
    deps.clearAuth();
  }
}
