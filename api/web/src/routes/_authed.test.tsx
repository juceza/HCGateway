import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';

import { render, screen, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/api';
import { type AuthState, setAuth } from '@/lib/auth';

import { AuthedErrorBoundary } from '@/components/AuthedErrorBoundary';

import { routeTree } from '@/routeTree.gen';

const SESSION: AuthState = {
  token: 'tok-1',
  refresh: 'ref-1',
  expiry: '2026-06-01T12:00:00Z',
  username: 'alice',
};

function renderAppAt(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  localStorage.clear();
});

describe('_authed guard', () => {
  it('redirects to /login preserving ?redirect= when there is no session', async () => {
    const router = renderAppAt('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toMatchObject({ redirect: '/' });
  });

  it('allows the guarded route to load with a valid session', async () => {
    setAuth(SESSION);
    const router = renderAppAt('/');
    // The dashboard heading renders regardless of the counts query state.
    expect(
      await screen.findByRole('heading', { name: 'Your health' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

// A failed silent refresh raised from a guarded child surfaces as an
// `AuthError`, caught by the route's `errorComponent`. Exercised through a
// minimal router whose child throws, reusing the real `AuthedErrorBoundary`.
function renderGuardedError(error: Error) {
  const rootRoute = createRootRoute();
  const crashRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      throw error;
    },
    errorComponent: AuthedErrorBoundary,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <div data-testid='login-stub'>login</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([crashRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('AuthedErrorComponent', () => {
  it('routes to /login on an AuthError', async () => {
    const router = renderGuardedError(new AuthError());
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByTestId('login-stub')).toBeInTheDocument();
  });

  it('shows a generic message for a non-auth error', async () => {
    renderGuardedError(new Error('boom'));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});
