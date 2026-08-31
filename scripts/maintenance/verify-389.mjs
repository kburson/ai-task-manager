#!/usr/bin/env node
// cspell:ignore dryrun idempoten
// #389 (C3 of EPIC #369) — acceptance-criteria verifier.
//
// Mirrors the #388 pattern: a single committed script that asserts every
// substantive acceptance criterion of #389 holds, so `/task ac-stamp` can
// execute it in a sandbox and stamp `aitm-ac-evidence` on each AC line. Exits 0
// only when ALL assertions pass; any failure throws and exits non-zero.
//
// Scope: ACs 1-9 (the structural + behavioral criteria of the migration
// library and its dry-run runner). AC-10 (test:all / lint / format:check) is
// verified directly by those commands as its own line verifier, not here.

import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { migrateBody, migrateBodyWithFamilies, FAMILIES } from './lib/corpus-marker-transforms.mjs';

const LIB_PATH = fileURLToPath(new URL('./lib/corpus-marker-transforms.mjs', import.meta.url));
const RUNNER_PATH = fileURLToPath(new URL('./migrate-markers-corpus.mjs', import.meta.url));
const TEST_PATHS = [
  '../tests/unit/task-tracker/maintenance/lib/corpus-marker-transforms-read-core.test.mjs',
  '../tests/unit/task-tracker/maintenance/lib/corpus-marker-transforms-read-chain.test.mjs',
  '../tests/unit/task-tracker/maintenance/lib/corpus-marker-transforms-write.test.mjs',
].map((relativePath) => fileURLToPath(new URL(relativePath, import.meta.url)));
const EVIDENCE_PATH = fileURLToPath(new URL('./evidence/389-dryrun.txt', import.meta.url));

const libSrc = readFileSync(LIB_PATH, 'utf8');
const runnerSrc = readFileSync(RUNNER_PATH, 'utf8');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

// AC-1 — enumeration is the GraphQL issues connection, paginated and
// checkpoint-resumable through the named state file.
check('AC1 enumeration: paginated GraphQL connection + checkpoint state file', () => {
  assert.match(runnerSrc, /issues\(first:\s*100,\s*after:\s*\$c/, 'paginated issues() connection');
  assert.match(runnerSrc, /pageInfo\{\s*hasNextPage\s+endCursor\s*\}/, 'cursor pagination fields');
  assert.match(runnerSrc, /endCursor/, 'advances cursor');
  assert.match(
    runnerSrc,
    /migrate-markers-corpus\.state\.json/,
    'checkpoint state file path present'
  );
  assert.match(runnerSrc, /function loadState\(/, 'loadState present');
  assert.match(runnerSrc, /function saveState\(/, 'saveState present');
});

// AC-2 — dry-run is the default and writes nothing; the only live-write call
// site is guarded by args.live.
check('AC2 dry-run default writes nothing; live write guarded by --live', () => {
  assert.match(runnerSrc, /live:\s*false/, 'default args.live is false');
  // mutateIssueBody (the only writer) appears only inside an `if (args.live)` arm.
  const writerIdx = runnerSrc.indexOf('await mutateIssueBody(');
  assert.ok(writerIdx > 0, 'mutateIssueBody call present');
  const guardIdx = runnerSrc.lastIndexOf('if (args.live)', writerIdx);
  assert.ok(guardIdx > 0 && guardIdx < writerIdx, 'write call is inside an args.live guard');
});

// AC-3 — every single-line capture uses `[^>\n]`; no lazy `[^>]*?` that could
// run across a newline.
check('AC3 single-line captures use [^>\\n]; no cross-line [^>]*?', () => {
  assert.ok(libSrc.includes('[^>\\n]'), 'lib uses [^>\\n] captures');
  // Scan executable lines only — full-line `//` comments legitimately name the
  // avoided `[^>]*?` anti-pattern in documentation and must not trip this check.
  const codeOnly = libSrc
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  assert.ok(!/\[\^>\]\*\?/.test(codeOnly), 'lib code contains no lazy [^>]*? capture');
});

// AC-4 — the audit/approval transform decodes via the C1-fixed parser, so an
// ISO-rich legacy timestamp round-trips instead of mis-splitting on its colons.
check('AC4 full-auto-approved uses C1-fixed parser (ISO ts preserved)', () => {
  assert.match(libSrc, /parseFullAutoApprovedMarker/, 'imports the C1 parser');
  const legacy = '<!-- aitm-full-auto-approved: 2026-06-01T12:34:56.789Z:gate1,gate2 -->';
  const out = migrateBody(legacy);
  assert.notEqual(out, legacy, 'legacy form migrated');
  assert.match(out, /2026-06-01T12:34:56\.789Z/, 'ISO timestamp preserved intact');
  assert.equal(migrateBody(out), out, 'canonical form idempotent');
});

// AC-5 — JSON-payload guard keeps the lifecycle/deep-dive-complete transform
// away from structured `{...}` verdict relics.
check('AC5 JSON-payload guard leaves structured deep-dive-complete untouched', () => {
  const jsonRelic = '<!-- aitm-deep-dive-complete: {"verdict":"ok","score":3} -->';
  assert.equal(migrateBody(jsonRelic), jsonRelic, 'JSON-payload relic left byte-untouched');
  const plain = '<!-- aitm-deep-dive-complete: 2026-06-01T00:00:00.000Z -->';
  assert.notEqual(migrateBody(plain), plain, 'plain ts form still migrates');
  assert.match(migrateBody(plain), /ts="2026-06-01T00:00:00\.000Z"/, 'plain ts canonicalized');
});

// AC-6 — conversion covers markers everywhere in a body: prose, code fences,
// and acceptance-criteria example strings.
check('AC6 conversion covers prose, code fences, and AC example strings', () => {
  const body = [
    'Some prose before <!-- aitm-body-version: 7 --> and after.',
    '',
    '```',
    'code fence <!-- aitm-blocked-by: #12, #13 -->',
    '```',
    '',
    '- [ ] AC example: emits <!-- aitm-entered-develop: 2026-06-01T00:00:00.000Z -->',
  ].join('\n');
  const { body: out, families } = migrateBodyWithFamilies(body);
  assert.match(out, /aitm-body-version version="7"/, 'prose marker converted');
  assert.match(out, /aitm-blocked-by refs="#12, #13"/, 'code-fence marker converted');
  assert.ok(
    out.includes('aitm-entered-develop ts="2026-06-01T00:00:00.000Z"'),
    'AC example converted'
  );
  assert.ok(
    families.includes('body-version') &&
      families.includes('blocked-by') &&
      families.includes('stage-entry'),
    'all three families reported changed'
  );
});

// AC-7 — out-of-scope families are never matched.
check('AC7 out-of-scope families left untouched', () => {
  const outOfScope = [
    '<!-- aitm-fields: {"priority":"P1"} -->',
    '<!-- aitm-stage-rollup: develop -->',
    '<!-- aitm-refinement-rationale: because -->',
    '<!-- aitm-skill-version: 1.2.3 -->',
  ].join('\n');
  assert.equal(migrateBody(outOfScope), outOfScope, 'no out-of-scope marker rewritten');
});

// AC-8 — unit tests cover each family for idempotency plus the JSON-payload
// guard. The committed test file exists, the family chain is complete, and the
// suite passes when executed standalone.
check('AC8 per-family unit tests present, complete, and green', () => {
  for (const testPath of TEST_PATHS) assert.ok(existsSync(testPath), `${testPath} exists`);
  const testSrc = TEST_PATHS.map((testPath) => readFileSync(testPath, 'utf8')).join('\n');
  // Coverage is asserted by the family's transform-function name (the real
  // import the test exercises), not the kebab key — tests label families
  // descriptively ("sha:ts pair") but call them by function.
  for (const { name, fn } of FAMILIES) {
    assert.ok(testSrc.includes(fn.name), `test file exercises family "${name}" via ${fn.name}()`);
  }
  assert.match(testSrc, /idempoten/i, 'tests assert idempotency');
  assert.match(
    testSrc,
    /JSON-payload|json payload|isJsonPayload|deep-dive-complete/i,
    'JSON guard tested'
  );
  for (const testPath of TEST_PATHS) {
    const res = spawnSync(process.execPath, ['--test', testPath], { encoding: 'utf8' });
    assert.equal(res.status, 0, `${testPath} must exit 0:\n${res.stdout}\n${res.stderr}`);
  }
});

// AC-9 — the dry-run was run against the live corpus and its diff/count are
// recorded as committed evidence.
check('AC9 live-corpus dry-run evidence recorded', () => {
  assert.ok(existsSync(EVIDENCE_PATH), 'dry-run evidence file exists');
  const ev = readFileSync(EVIDENCE_PATH, 'utf8');
  assert.match(
    ev,
    /DRY-RUN: scanned \d+, would change \d+/,
    'evidence records scan + change counts'
  );
});

console.log(`\nverify-389: all ${passed} acceptance checks passed.`);
