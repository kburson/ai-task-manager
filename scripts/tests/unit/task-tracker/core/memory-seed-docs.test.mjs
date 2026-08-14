// @story #728
// AC5 — DELIVERY.md documents the maintainer freshness workflow: run the parity
// diff before publishing, rebase when it drifts, and never ship a stale seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)) + '/..', '..', '..', '..', '..');
const DELIVERY = readFileSync(join(REPO_ROOT, 'docs', 'ai-memory', 'DELIVERY.md'), 'utf8');

test('DELIVERY.md documents the freshness workflow with the diff command', () => {
  assert.match(DELIVERY, /freshness workflow/i, 'a freshness-workflow section exists');
  assert.match(
    DELIVERY,
    /ai-memory-parity\.mjs --mode diff/,
    'the diff command is named as the parity check'
  );
});

test('DELIVERY.md tells the maintainer to run the diff before publishing', () => {
  // The instruction must tie the diff to the pre-publish gate, not just mention it.
  assert.match(
    DELIVERY,
    /before every `npm publish`|before publishing/i,
    'diff is framed as a pre-publish step'
  );
  assert.match(DELIVERY, /--mode rebase/, 'the drift remedy (rebase) is documented');
});

test('DELIVERY.md distinguishes the CI index backstop from live-vs-seed freshness', () => {
  assert.match(DELIVERY, /--mode index/, 'the CI index backstop is named');
  // The doc must be explicit that index parity does NOT prove live-vs-seed freshness.
  assert.match(
    DELIVERY,
    /not.*(match|prove).*live|maintainer responsibility/is,
    'index parity is not a substitute for the maintainer diff'
  );
});
