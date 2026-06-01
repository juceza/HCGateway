import { render, screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

// Confirms the Vitest + jsdom + Testing Library + jest-dom pipeline is wired,
// so later tasks can land component and logic tests on this foundation.
describe('test runner', () => {
  it('runs under jsdom', () => {
    expect(typeof window).toBe('object');
    expect(true).toBe(true);
  });

  it('renders a component and asserts with jest-dom matchers', () => {
    render(<p data-testid='hello'>Web UI scaffold is up.</p>);
    expect(screen.getByTestId('hello')).toBeInTheDocument();
    expect(screen.getByTestId('hello')).toHaveTextContent('scaffold');
  });
});
