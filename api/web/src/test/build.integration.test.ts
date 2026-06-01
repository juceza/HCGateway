import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Integration check for the build pipeline: after `bun run build`, the SPA must
// emit `dist/index.html` referencing a hashed JS asset (so the Flask blueprint
// in task_10 and the Dockerfile in task_11 can serve it). Skips when the build
// has not been run, keeping the unit-only `vitest run` green in isolation.
// Vitest runs with cwd at the project root (api/web).
const distIndex = resolve(process.cwd(), 'dist/index.html');
const built = existsSync(distIndex);

describe.skipIf(!built)('build pipeline output', () => {
  it('emits dist/index.html with a hashed JS asset', () => {
    const html = readFileSync(distIndex, 'utf8');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
  });
});
