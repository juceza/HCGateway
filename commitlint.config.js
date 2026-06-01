/**
 * commitlint configuration for the HCGateway repo.
 *
 * Default rules applied by `@commitlint/config-conventional` (extend):
 *
 * Problems (error):
 * - type-enum: type must be one of the list below.
 * - type-case: type must be lower-case.
 * - type-empty: type must not be empty.
 * - subject-case: subject must not be sentence/start/pascal/upper case.
 * - subject-empty: subject must not be empty.
 * - subject-full-stop: subject must not end with a period ('.').
 * - header-max-length: header at most 100 characters.
 * - body-max-line-length: body lines at most 100 characters.
 * - footer-max-line-length: footer lines at most 100 characters.
 *
 * The scope is OPTIONAL; when present, it must belong to `scope-enum`.
 *
 * @see https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-conventional
 */

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'app',
        'web',
        'auth',
        'sync',
        'db',
        'crypto',
        'worker',
        'ui',
        'docs',
        'infra',
        'ci',
        'deps',
        'tests',
        'root',
      ],
    ],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'chore',
        'style',
        'refactor',
        'ci',
        'test',
        'perf',
        'revert',
        'build',
      ],
    ],
  },
};
