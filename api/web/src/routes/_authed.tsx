import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AuthedErrorBoundary } from "@/components/AuthedErrorBoundary";
import { guardRedirect } from "@/lib/authGuard";

// Pathless auth-guard layout. Every protected route nests under this
// file (`_authed/index`, `_authed/records.$type`, `_authed/settings`). The
// `beforeLoad` runs before any child loads: with no session it throws a
// `redirect` to `/login`, propagating the originally-requested path as
// `?redirect=` so the user returns to it after authenticating. The silent
// refresh-on-401 lives in `apiFetch`, so the guard only handles the no-session
// case up front; a *failed* refresh surfaces as an `AuthError` during a child
// load and is caught by `AuthedErrorBoundary`, which bounces to `/login`
// without a phantom logout for the recoverable 401s `apiFetch` already retries.
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) => {
    const target = guardRedirect(location.href);
    if (target) throw redirect(target);
  },
  errorComponent: AuthedErrorBoundary,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
