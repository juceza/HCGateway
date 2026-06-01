import { beforeEach, describe, expect, it } from 'vitest';

import { type AuthState, clearAuth, getAuth, setAuth } from './auth';

const SAMPLE: AuthState = {
  token: 'tok-1',
  refresh: 'ref-1',
  expiry: '2026-06-01T12:00:00Z',
  username: 'alice',
};

beforeEach(() => {
  localStorage.clear();
});

describe('auth storage helpers', () => {
  it('returns null when nothing is stored', () => {
    expect(getAuth()).toBeNull();
  });

  it('round-trips a session through set/get', () => {
    setAuth(SAMPLE);
    expect(getAuth()).toEqual(SAMPLE);
  });

  it('persists under a single localStorage key', () => {
    setAuth(SAMPLE);
    expect(localStorage.length).toBe(1);
  });

  it('clears the session', () => {
    setAuth(SAMPLE);
    clearAuth();
    expect(getAuth()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('hcgateway.auth', '{not json');
    expect(getAuth()).toBeNull();
  });

  it('returns null for a structurally-invalid session', () => {
    localStorage.setItem('hcgateway.auth', JSON.stringify({ token: 1 }));
    expect(getAuth()).toBeNull();
  });
});
