import { useEffect } from "react";
import { type ErrorComponentProps, useNavigate } from "@tanstack/react-router";

import { authErrorRedirect } from "@/lib/authGuard";

/**
 * Error boundary for the guarded `_authed` subtree. An `AuthError` (a failed
 * silent refresh raised from a child loader — `apiFetch` already retries the
 * recoverable 401s) routes to `/login` so there is no phantom logout; any other
 * error falls through to a generic message instead of a blank screen.
 */
export function AuthedErrorBoundary({ error }: ErrorComponentProps) {
  const navigate = useNavigate();
  const target = authErrorRedirect(error);

  useEffect(() => {
    if (target) void navigate({ to: target.to });
  }, [target, navigate]);

  if (target) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We couldn't load your data. Please try again.
      </p>
    </main>
  );
}
