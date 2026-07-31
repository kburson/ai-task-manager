// @story #1065
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..', '..');
const evidencePath = path.join(
  root,
  'docs/evidence/2026-07-31-work-lease-foundation-verification.md'
);
const body = readFileSync(evidencePath, 'utf8');

const requiredCommands = [
  'node --test scripts/task-tracker/tests/unit/meta/test-tree-layout.test.mjs scripts/task-tracker/tests/unit/lib/lane-taxonomy.test.mjs',
  'node --test packages/aitm-ledger/test/package-contract.test.mjs',
  'npm pack --dry-run --json',
  'npm pack --dry-run --json --workspace @kburson/aitm-ledger',
  'npm publish --dry-run --json --workspace @kburson/aitm-ledger --registry=https://registry.npmjs.org/',
  'npm test',
  'npm run test:slow',
  'node scripts/run-tests.mjs --lane unit --shard 1/4',
  'node scripts/run-tests.mjs --lane unit --shard 2/4',
  'node scripts/run-tests.mjs --lane unit --shard 3/4',
  'node scripts/run-tests.mjs --lane unit --shard 4/4',
  'node scripts/run-tests.mjs --lane integration',
  'node scripts/run-tests.mjs --lane slow --shard 1/2',
  'node scripts/run-tests.mjs --lane slow --shard 2/2',
  'npm run lint',
  'npm run format:check',
  'git diff --check',
  'git log --oneline -1',
];

test('manifest identifies the exact reviewed foundation and bounded scope', () => {
  assert.match(body, /Foundation SHA: `9a1c9d59442c27096e93bf50685ce0de3e86f506`/);
  assert.match(body, /does not claim delivery of lifecycle work assigned to #1053/);
});

test('manifest records every governed verification command as passing', () => {
  for (const command of requiredCommands) {
    const row = body.split('\n').find((line) => line.includes(`\`${command}\``));
    assert.ok(row, command);
    assert.match(row, /\|\s+PASS/, command);
  }
});

test('manifest records partition union and separation evidence', () => {
  assert.match(body, /disjoint partition/);
  assert.match(body, /union contains every\s+discovered `\*\.test\.mjs` file/);
  assert.match(body, /full fast runner executes the unit and\s+integration partitions/);
  assert.match(body, /slow runner executes the slow partition/);
  assert.match(body, /shards are disjoint and their union is exact/);
  assert.match(body, /does not relax the\s+per-section ceiling/);
});

test('manifest records required root and ledger runtime artifacts without tests', () => {
  for (const artifact of [
    'bin/aitm.mjs',
    'scripts/task-tracker/lib/work-lease/http-store.mjs',
    'src/index.mjs',
    'src/lease/http-contract.mjs',
    'src/sqlite/work-lease-store.mjs',
  ]) {
    assert.ok(body.includes(`\`${artifact}\``), `missing artifact ${artifact}`);
  }
  assert.match(body, /contains no `scripts\/task-tracker\/tests\/` files/);
  assert.match(body, /contains no\s+`test\/` files/);
});
