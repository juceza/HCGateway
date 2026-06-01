import { useState } from 'react';

import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { ExternalLink, LogOut } from 'lucide-react';

import { getAuth } from '@/lib/auth';
import {
  API_DOCS_URL,
  formatExpiry,
  performLogout,
  SOVEREIGNTY_BADGE_DETAIL,
} from '@/lib/shell';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { SovereigntyBadge } from '@/components/SovereigntyBadge';

// Settings route. Shows
// the account session details, restates the data-sovereignty framing, links to
// the API docs, and owns Logout. Logout revokes the session server-side then
// clears local auth (`performLogout`, tolerant of a revoke failure) and routes
// to `/login`; the cleared session means the `_authed` guard then blocks any
// re-entry to a protected route.
export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const auth = getAuth();
  const expiry = auth ? formatExpiry(auth.expiry) : null;
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    // Never rejects — revoke failure still clears local state below.
    await performLogout();
    await navigate({ to: '/login' });
  }

  return (
    <main className='mx-auto w-full max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-semibold tracking-tight'>Settings</h1>

      <div className='flex flex-col gap-6'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Account</CardTitle>
            <CardDescription>Your current session.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 text-sm'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground'>Username</span>
              <span data-testid='settings-username' className='font-medium'>
                {auth?.username ?? '—'}
              </span>
            </div>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground'>Session</span>
              <span data-testid='settings-expiry' className='font-medium'>
                {expiry ? (expiry.expired ? 'Expired' : expiry.text) : '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Data ownership</CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground flex flex-col items-start gap-3 text-sm'>
            <SovereigntyBadge />
            <p>{SOVEREIGNTY_BADGE_DETAIL}</p>
            <a
              href={API_DOCS_URL}
              target='_blank'
              rel='noreferrer'
              data-testid='settings-api-docs-link'
              className='text-foreground inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline'
            >
              <ExternalLink className='size-4' aria-hidden />
              REST API documentation
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Session</CardTitle>
            <CardDescription>
              Sign out of this device. This revokes the session on the server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type='button'
              variant='destructive'
              data-testid='logout-button'
              disabled={loggingOut}
              onClick={handleLogout}
            >
              <LogOut className='size-4' aria-hidden />
              {loggingOut ? 'Signing out…' : 'Log out'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
