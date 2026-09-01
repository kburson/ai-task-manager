// @story #1180

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (relative) =>
  readFileSync(new URL(`../../../../../${relative}`, import.meta.url), 'utf8');

test('repository-wide tooling excludes disposable .scratch artifacts', () => {
  assert.match(read('eslint.config.mjs'), /'\.scratch\/\*\*'/);
  assert.match(read('.prettierignore'), /^\.scratch\/$/m);
  assert.ok(JSON.parse(read('cspell.json')).ignorePaths.includes('.scratch/**'));
  assert.ok(JSON.parse(read('.markdownlint-cli2.jsonc')).globs.includes('!.scratch/**'));
});
