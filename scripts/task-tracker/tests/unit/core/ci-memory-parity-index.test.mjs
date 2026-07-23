// @story #728
// AC6 (folds #744) — the CI Fast lane must run the repo-only memory-seed index
// parity check so any MEMORY.md-index ⇄ docs/ai-memory/ durable-set drift fails
// the build. Asserts the step is present in the Fast lane, uses `--mode index`
// (the CI-safe mode, NOT the maintainer `--mode diff`), and precedes `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)) + '/..', '..', '..', '..', '..');
const CI = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

// Isolate the Fast lane block: from `fast:` up to the next top-level job (`slow:`).
function fastLane(yml) {
  const start = yml.indexOf('\n  fast:');
  const end = yml.indexOf('\n  slow:');
  assert.ok(start !== -1 && end !== -1 && end > start, 'fast + slow jobs both present');
  return yml.slice(start, end);
}

test('the Fast lane runs the memory-seed index parity check', () => {
  const lane = fastLane(CI);
  assert.match(
    lane,
    /ai-memory-parity\.mjs --mode index/,
    'Fast lane invokes the parity script in index mode'
  );
});

test('the CI step uses --mode index (CI-safe), never the maintainer --mode diff', () => {
  const lane = fastLane(CI);
  assert.doesNotMatch(
    lane,
    /ai-memory-parity\.mjs --mode diff/,
    'the maintainer diff (needs $HOME live memory) must not run in CI'
  );
});

test('the parity check runs before npm test in the Fast lane', () => {
  const lane = fastLane(CI);
  const parityAt = lane.indexOf('--mode index');
  const testAt = lane.indexOf('npm test');
  assert.ok(parityAt !== -1 && testAt !== -1, 'both steps present');
  assert.ok(parityAt < testAt, 'the cheap parity gate runs before the test fleet');
});
