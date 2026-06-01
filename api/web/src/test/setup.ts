import { cleanup } from '@testing-library/react';

import { afterEach } from 'vitest';

import '@testing-library/jest-dom/vitest';

// Unmount React trees and reset jsdom between tests.
afterEach(() => {
  cleanup();
});
