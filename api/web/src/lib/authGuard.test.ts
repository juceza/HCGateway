import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError, AuthError } from './api';
import { type AuthState, setAuth } from './auth';
import {
  authErrorRedirect,
  guardRedirect,
  isInsecureOrigin,
  postLoginTarget,
} from './authGuard';

const SESSION: AuthState = {
  token: 'tok-1',
  refresh: 'ref-1',
  expiry: '2026-06-01T12:00:00Z',
  username: 'alice',
};

beforeEach(() => {
  localStorage.clear();
});

describe('guardRedirect', () => {
  it('redirects to /login carrying ?redirect= when there is no session', () => {
    expect(guardRedirect('/records/Steps', null)).toEqual({
      to: '/login',
      search: { redirect: '/records/Steps' },
    });
  });

  it('returns null when a session is supplied', () => {
    expect(guardRedirect('/records/Steps', SESSION)).toBeNull();
  });

  it('reads the persisted session by default (allows the route to load)', () => {
    setAuth(SESSION);
    expect(guardRedirect('/')).toBeNull();
  });

  it('falls back to the persisted session by default (no session → redirect)', () => {
    expect(guardRedirect('/settings')).toEqual({
      to: '/login',
      search: { redirect: '/settings' },
    });
  });
});

describe('authErrorRedirect', () => {
  it('routes an AuthError to /login', () => {
    expect(authErrorRedirect(new AuthError())).toEqual({ to: '/login' });
  });

  it('ignores a non-auth ApiError (no phantom logout)', () => {
    expect(authErrorRedirect(new ApiError(500, 'boom'))).toBeNull();
  });

  it('ignores a plain error', () => {
    expect(authErrorRedirect(new Error('network'))).toBeNull();
  });
});

describe('isInsecureOrigin', () => {
  it('is true over plain HTTP', () => {
    expect(isInsecureOrigin('http:')).toBe(true);
  });

  it('is false over HTTPS', () => {
    expect(isInsecureOrigin('https:')).toBe(false);
  });
});

describe('postLoginTarget', () => {
  it('honors a safe in-app redirect path', () => {
    expect(postLoginTarget('/records/Steps')).toBe('/records/Steps');
  });

  it('defaults to the dashboard when there is no redirect', () => {
    expect(postLoginTarget()).toBe('/');
  });

  it('rejects a protocol-relative open redirect', () => {
    expect(postLoginTarget('//evil.example.com')).toBe('/');
  });

  it('rejects an absolute-URL open redirect', () => {
    expect(postLoginTarget('https://evil.example.com')).toBe('/');
  });
});
