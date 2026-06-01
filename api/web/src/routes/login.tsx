import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Info, ShieldAlert, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, AuthError, login } from "@/lib/api";
import { isInsecureOrigin, postLoginTarget } from "@/lib/authGuard";

// Login screen. Calls `login()` (which deliberately omits `fcmToken`)
// and, on success, navigates to the originally-requested `?redirect=` target or
// the dashboard root (`postLoginTarget`). Two notices mirror the Android app:
// an unknown-username warning (login auto-creates the account server-side) and
// an HTTP-vs-HTTPS security notice when not served over TLS.
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

/** Turn a thrown login error into a human message for the form. */
function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Incorrect username or password.";
    }
    return `Login failed (error ${err.status}). Please try again.`;
  }
  if (err instanceof AuthError) {
    return "Incorrect username or password.";
  }
  return "Could not reach the server. Check your connection and try again.";
}

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insecure = isInsecureOrigin(window.location.protocol);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      await navigate({ to: postLoginTarget(redirect) });
    } catch (err) {
      setError(loginErrorMessage(err));
      setSubmitting(false);
    }
  }

  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to HCGateway</CardTitle>
          <CardDescription>
            Your data, on your server — not in the cloud.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            {insecure && (
              <Alert variant="warning" data-testid="http-notice">
                <ShieldAlert />
                <AlertTitle>Insecure connection</AlertTitle>
                <AlertDescription>
                  This page is served over HTTP. Your credentials are sent
                  unencrypted — use HTTPS whenever the server is exposed beyond
                  your local network.
                </AlertDescription>
              </Alert>
            )}

            <Alert data-testid="unknown-username-notice">
              <Info />
              <AlertTitle>New username creates an account</AlertTitle>
              <AlertDescription>
                Signing in with a username that does not exist yet will create a
                new account. Double-check the username matches the one your app
                already syncs to.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            {error && (
              <Alert variant="destructive" data-testid="login-error">
                <TriangleAlert />
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
