#!/usr/bin/env node
// @story #446
// #446 (Strategy C from spike #445) — unit tests for the content-addressed
// verifier-result cache (`lib/verifier-cache.mjs`) and its integration into
// `runVerifiers` (`lib/evidence-runner.mjs`).
//
// The cache exists to collapse the redundant heavyweight suite runs that the
// evidence-stamping flow triggers: when N Acceptance-Criteria lines plus the
// `tests` Functional-DoD item all declare the same suite command, that suite
// would otherwise execute N+ times at one unchanged commit (#444 burned six).
// One green run at a fixed clean HEAD already proves every checkbox.
//
// Coverage (the five behaviors the deep-dive plan names):
//   - pure helpers: normalizeCommand / isCacheEligible / cacheKey / store I/O.
//   - hit: same eligible cmd + sha + clean tree ⇒ suite runs once; the repeat is
//     served from cache and carries the ORIGINAL run's ts (never a fresh clock).
//   - miss-on-changed-sha: a new HEAD ⇒ real run; the store is pruned to the
//     current sha so stale entries can never be served.
//   - miss-on-dirty-tree: an uncommitted change ⇒ never read, never recorded.
//   - non-eligible-command-always-runs: a command off the allowlist (e.g.
//     `npm run lint`) runs every time even at a clean, unchanged tree.
//   - AC5 multi-AC single-run: six independent `runVerifiers` calls (one per
//     AC/DoD stamp) of the same suite at one clean sha ⇒ exactly one real run.
//
// All git/npm execution is injected via a fake `pexec`; the store lives under a
// per-case mkdtemp dir inside `projectScratchDir('test')` (no system tmp, so
// `lint:tmp` stays green).

import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  STORE_VERSION,
  CACHE_ELIGIBLE_COMMANDS,
  normalizeCommand,
  isCacheEligible,
  cacheKey,
  readStore,
  lookup,
  record,
} from '../../../lib/verifier-cache.mjs';
import { runVerifiers } from '../../../lib/evidence-runner.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

// Each case gets an isolated store dir so writes never bleed across tests.
function freshDir() {
  return mkdtempSync(path.join(projectScratchDir('test'), 'verifier-cache-'));
}

// Fake `pexec(bin, args, opts)`. Answers `git rev-parse --short HEAD` with
// `state.sha` and `git status --porcelain` with clean/dirty; treats everything
// else as a verifier command and counts the run. `state.sha`/`state.clean` are
// mutable so a single fake can model a commit landing or the tree going dirty
// between calls.
function makePexec({ sha = 'abc1234', clean = true } = {}) {
  const state = { sha, clean };
  const runs = []; // every verifier command actually executed, in order
  async function pexec(bin, args = []) {
    if (bin === 'git' && args[0] === 'rev-parse') {
      return { stdout: `${state.sha}\n` };
    }
    if (bin === 'git' && args[0] === 'status') {
      return { stdout: state.clean ? '' : ' M scripts/task-tracker/foo.mjs\n' };
    }
    runs.push([bin, ...args].join(' '));
    return { stdout: '' };
  }
  return { pexec, state, runs };
}

const SUITE = '`npm test`'.replace(/`/g, ''); // 'npm test' — an eligible command
const CACHE = (dir, now) => ({ dir, now });

// --- pure helpers ----------------------------------------------------------

function testPureHelpers() {
  assert.equal(STORE_VERSION, 1, 'store version is 1');

  // normalizeCommand trims + collapses internal whitespace.
  assert.equal(normalizeCommand('  npm   test '), 'npm test', 'normalize collapses whitespace');
  assert.equal(normalizeCommand(''), '', 'normalize of empty is empty');
  assert.equal(normalizeCommand(null), '', 'normalize of null is empty');

  // Eligibility is allowlist-only and operates on the normalized form.
  assert.ok(isCacheEligible('npm test'), 'npm test is eligible');
  assert.ok(isCacheEligible('  npm   test  '), 'eligibility normalizes first');
  assert.ok(isCacheEligible('npm run test:all'), 'npm run test:all is eligible');
  assert.ok(!isCacheEligible('npm run lint'), 'lint is not eligible');
  assert.ok(!isCacheEligible('git log --grep #446'), 'git log is not eligible');
  for (const c of CACHE_ELIGIBLE_COMMANDS) {
    assert.ok(isCacheEligible(c), `allowlist entry ${c} is eligible`);
  }

  // cacheKey is `${normCmd} ${sha}`.
  assert.equal(cacheKey('  npm test ', 'abc1234'), 'npm test abc1234', 'cacheKey shape');

  // readStore fail-safes to an empty store for a missing dir.
  const empty = readStore(freshDir());
  assert.deepEqual(empty, { version: 1, entries: {} }, 'missing store reads empty');

  console.log('ok pure-helpers');
}

// --- record / lookup contract ---------------------------------------------

function testRecordLookupContract() {
  const dir = freshDir();

  // Non-zero never recorded.
  assert.equal(
    record({ dir, cmd: 'npm test', sha: 'aaa', exit: 1, ts: 'T' }),
    false,
    'non-zero not recorded'
  );
  assert.equal(lookup({ dir, cmd: 'npm test', sha: 'aaa' }), null, 'no entry after refused record');

  // Ineligible never recorded.
  assert.equal(
    record({ dir, cmd: 'npm run lint', sha: 'aaa', exit: 0, ts: 'T' }),
    false,
    'ineligible not recorded'
  );

  // Unknown sha never recorded.
  assert.equal(
    record({ dir, cmd: 'npm test', sha: 'unknown', exit: 0, ts: 'T' }),
    false,
    'unknown sha not recorded'
  );

  // Green eligible clean record succeeds, then a matching lookup returns it.
  assert.equal(
    record({ dir, cmd: 'npm test', sha: 'aaa', exit: 0, ts: 'T1' }),
    true,
    'green recorded'
  );
  const hit = lookup({ dir, cmd: 'npm test', sha: 'aaa' });
  assert.ok(hit && hit.ts === 'T1' && hit.exit === 0, 'lookup returns recorded green entry');

  // A wrong sha misses.
  assert.equal(
    lookup({ dir, cmd: 'npm test', sha: 'bbb' }),
    null,
    'lookup at different sha misses'
  );

  // Recording at a NEW sha prunes the old entry (store bounded to current HEAD).
  record({ dir, cmd: 'npm test', sha: 'bbb', exit: 0, ts: 'T2' });
  assert.equal(
    lookup({ dir, cmd: 'npm test', sha: 'aaa' }),
    null,
    'old-sha entry pruned on new write'
  );
  assert.ok(lookup({ dir, cmd: 'npm test', sha: 'bbb' }), 'new-sha entry present after prune');

  console.log('ok record-lookup-contract');
}

// --- 1. hit ----------------------------------------------------------------

async function testHit() {
  const dir = freshDir();
  const { pexec, runs } = makePexec({ sha: 'sha1111', clean: true });

  const first = await runVerifiers({
    commands: [SUITE],
    pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'TS-ORIGINAL'),
  });
  assert.equal(runs.length, 1, 'first call runs the suite once');
  assert.equal(first.ran[0].cached, false, 'first run is not cached');
  assert.equal(first.ran[0].ts, 'TS-ORIGINAL', 'first run stamps the run clock');
  assert.ok(existsSync(path.join(dir, 'cache', 'verifier-results.json')), 'store file written');

  // Second call: same cmd, same sha, clean tree, but a DIFFERENT clock. The hit
  // must surface the ORIGINAL ts, not the new one, and must not re-run.
  const second = await runVerifiers({
    commands: [SUITE],
    pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'TS-LATER'),
  });
  assert.equal(runs.length, 1, 'second call does NOT re-run the suite');
  assert.equal(second.ran[0].cached, true, 'second run served from cache');
  assert.equal(second.ran[0].ts, 'TS-ORIGINAL', 'cache hit attributes the original run ts');
  assert.equal(second.ran[0].exit, 0, 'cache hit reports green');
  assert.equal(second.allPassed, true, 'cache hit counts as passed');

  console.log('ok hit');
}

// --- 2. miss-on-changed-sha ------------------------------------------------

async function testMissOnChangedSha() {
  const dir = freshDir();
  const fake = makePexec({ sha: 'shaAAAA', clean: true });

  await runVerifiers({
    commands: [SUITE],
    pexec: fake.pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'T1'),
  });
  assert.equal(fake.runs.length, 1, 'initial run executes');

  // A commit lands: HEAD moves. Same command, still clean — but the cached
  // entry is at the old sha, so this must be a real run.
  fake.state.sha = 'shaBBBB';
  const after = await runVerifiers({
    commands: [SUITE],
    pexec: fake.pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'T2'),
  });
  assert.equal(fake.runs.length, 2, 'changed sha forces a real run');
  assert.equal(after.ran[0].cached, false, 'changed-sha result is not cached');
  assert.equal(after.sha, 'shaBBBB', 'runner reports the new sha');

  // The store was pruned to the current sha: old entry gone, new entry present.
  assert.equal(lookup({ dir, cmd: SUITE, sha: 'shaAAAA' }), null, 'old-sha entry evicted');
  assert.ok(lookup({ dir, cmd: SUITE, sha: 'shaBBBB' }), 'new-sha entry recorded');

  console.log('ok miss-on-changed-sha');
}

// --- 3. miss-on-dirty-tree -------------------------------------------------

async function testMissOnDirtyTree() {
  const dir = freshDir();
  const fake = makePexec({ sha: 'shaDIRTY', clean: false });

  const a = await runVerifiers({
    commands: [SUITE],
    pexec: fake.pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'T1'),
  });
  const b = await runVerifiers({
    commands: [SUITE],
    pexec: fake.pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'T2'),
  });

  assert.equal(fake.runs.length, 2, 'dirty tree runs every time');
  assert.equal(a.clean, false, 'runner reports dirty');
  assert.equal(a.ran[0].cached, false, 'dirty first run not cached');
  assert.equal(b.ran[0].cached, false, 'dirty second run not cached');
  // Nothing recorded on a dirty tree.
  assert.equal(lookup({ dir, cmd: SUITE, sha: 'shaDIRTY' }), null, 'dirty tree records nothing');

  console.log('ok miss-on-dirty-tree');
}

// --- 4. non-eligible-command-always-runs -----------------------------------

async function testNonEligibleAlwaysRuns() {
  const dir = freshDir();
  const fake = makePexec({ sha: 'shaLINT', clean: true });
  const LINT = 'npm run lint';

  await runVerifiers({
    commands: [LINT],
    pexec: fake.pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'T1'),
  });
  const second = await runVerifiers({
    commands: [LINT],
    pexec: fake.pexec,
    cwd: '/proj',
    cache: CACHE(dir, () => 'T2'),
  });

  assert.equal(fake.runs.length, 2, 'ineligible command runs every time even clean+same-sha');
  assert.equal(second.ran[0].cached, false, 'ineligible result never cached');
  assert.ok(
    !existsSync(path.join(dir, 'cache', 'verifier-results.json')),
    'no store written for ineligible-only run'
  );

  console.log('ok non-eligible-command-always-runs');
}

// --- 5. AC5 multi-AC single-run --------------------------------------------

async function testMultiAcSingleRun() {
  const dir = freshDir();
  const fake = makePexec({ sha: 'shaWAVE', clean: true });

  // Six independent stamp invocations (one per AC/DoD checkbox), each its own
  // runVerifiers call — the real-world shape #444 hit. Distinct clocks prove the
  // five repeats all inherit the first run's ts.
  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(
      await runVerifiers({
        commands: [SUITE],
        pexec: fake.pexec,
        cwd: '/proj',
        cache: CACHE(dir, () => `T${i}`),
      })
    );
  }

  assert.equal(fake.runs.length, 1, 'suite executes exactly once across six stamps');
  assert.equal(results[0].ran[0].cached, false, 'first stamp runs');
  for (let i = 1; i < 6; i++) {
    assert.equal(results[i].ran[0].cached, true, `stamp ${i} served from cache`);
    assert.equal(results[i].ran[0].ts, 'T0', `stamp ${i} inherits the original run ts`);
    assert.equal(results[i].allPassed, true, `stamp ${i} counts as passed`);
  }

  console.log('ok multi-ac-single-run');
}

testPureHelpers();
testRecordLookupContract();
await testHit();
await testMissOnChangedSha();
await testMissOnDirtyTree();
await testNonEligibleAlwaysRuns();
await testMultiAcSingleRun();
console.log('ok verifier-cache');
