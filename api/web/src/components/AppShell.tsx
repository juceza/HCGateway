import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Settings } from "lucide-react";

import { SovereigntyBadge } from "@/components/SovereigntyBadge";
import { getAuth } from "@/lib/auth";
import { API_DOCS_URL, formatExpiry } from "@/lib/shell";

// Authenticated app shell. A minimal top-bar consistent with DESIGN.md
// (64px white nav, monochrome ink) wrapping the three authed routes — no heavy
// sidebar, matching the lean 3-route information architecture. It
// surfaces the logged-in username, the token-expiry, the discreet sovereignty
// badge, and a link to the REST API docs; the routed screen renders below it.
export function AppShell({ children }: { children: ReactNode }) {
  // Rendered only under the `_authed` guard, so a session is guaranteed; the
  // null-guard keeps types honest and degrades gracefully if it ever isn't.
  const auth = getAuth();
  const expiry = auth ? formatExpiry(auth.expiry) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4">
          <Link
            to="/"
            className="text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            HCGateway
          </Link>

          <div className="hidden sm:block">
            <SovereigntyBadge />
          </div>

          <nav className="ml-auto flex items-center gap-1 text-sm">
            <a
              href={API_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              data-testid="api-docs-link"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BookOpen className="size-4" aria-hidden />
              API docs
            </a>
            <Link
              to="/settings"
              data-testid="settings-link"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:text-foreground"
            >
              <Settings className="size-4" aria-hidden />
              Settings
            </Link>
          </nav>

          {auth && (
            <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground sm:w-auto sm:border-0 sm:pt-0">
              <span
                data-testid="shell-username"
                className="font-medium text-foreground"
              >
                {auth.username}
              </span>
              {expiry && (
                <span data-testid="shell-expiry">
                  {expiry.expired
                    ? "Session expired"
                    : `Expires ${expiry.text}`}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
