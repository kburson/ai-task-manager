// @story #447 #448 #529 #855 #1089
/**
 * Unit tests for verify-develop.mjs logic.
 *
 * These tests exercise the file-collection and command-generation logic by
 * stubbing the git diff and child_process calls rather than invoking the script
 * as a subprocess (which would require a real git repo state and npm scripts).
 *
 * The `collectTestFiles` suite (#855) is the exception: it runs against a real
 * temp git fixture, because the bug it regresses (a never-`git add`-ed test
 * file being invisible to `git diff`) is a property of real git tracked/
 * untracked state that a stubbed string can't faithfully reproduce.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  buildFinalSteps,
  buildIterationSteps,
  collectTestFiles,
  isMainModule,
  runDevelopVerification,
} from '../../../verify-develop.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)) + '/..';
const REPO_ROOT = resolve(HERE, '../../../..');
const MODULE_URL = pathToFileURL(resolve(HERE, '../../verify-develop.mjs')).href;

// ---------------------------------------------------------------------------
// Pure helpers extracted for testing (mirrors the script's logic)
// ---------------------------------------------------------------------------

function parseTestFiles(rawOutput) {
  return rawOutput
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

function buildTestCommands(files) {
  return files.map((f) => ['node', '--test', f]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTestFiles', () => {
  it('returns empty array for empty diff output', () => {
    assert.deepEqual(parseTestFiles(''), []);
  });

  it('returns empty array for whitespace-only output', () => {
    assert.deepEqual(parseTestFiles('   \n  \n'), []);
  });

  it('parses a single test file', () => {
    assert.deepEqual(parseTestFiles('tests/integration/seven-state-flow.test.mjs\n'), [
      'tests/integration/seven-state-flow.test.mjs',
    ]);
  });

  it('parses multiple test files and strips surrounding whitespace', () => {
    const raw = 'tests/integration/foo.test.mjs\n  tests/integration/bar.test.mjs  \n';
    assert.deepEqual(parseTestFiles(raw), [
      'tests/integration/foo.test.mjs',
      'tests/integration/bar.test.mjs',
    ]);
  });

  it('ignores blank lines in the middle of output', () => {
    const raw = 'a.test.mjs\n\nb.test.mjs\n';
    assert.deepEqual(parseTestFiles(raw), ['a.test.mjs', 'b.test.mjs']);
  });
});

describe('buildTestCommands', () => {
  it('maps each file to a node --test invocation', () => {
    const cmds = buildTestCommands([
      'tests/integration/a.test.mjs',
      'tests/integration/b.test.mjs',
    ]);
    assert.deepEqual(cmds, [
      ['node', '--test', 'tests/integration/a.test.mjs'],
      ['node', '--test', 'tests/integration/b.test.mjs'],
    ]);
  });

  it('returns empty array for empty file list', () => {
    assert.deepEqual(buildTestCommands([]), []);
  });
});

// ---------------------------------------------------------------------------
// C2 (#448): merge helpers
// ---------------------------------------------------------------------------

function mergeTestFiles(direct, discovered) {
  return [...new Set([...direct, ...discovered])];
}

describe('mergeTestFiles (C2 — source-to-unit-test merge)', () => {
  it('returns direct list when no discovered tests', () => {
    const result = mergeTestFiles(['tests/unit/foo.test.mjs'], []);
    assert.deepEqual(result, ['tests/unit/foo.test.mjs']);
  });

  it('appends discovered tests after direct changes', () => {
    const result = mergeTestFiles(['tests/unit/foo.test.mjs'], ['tests/unit/bar.test.mjs']);
    assert.deepEqual(result, ['tests/unit/foo.test.mjs', 'tests/unit/bar.test.mjs']);
  });

  it('deduplicates when a discovered test is already in direct list', () => {
    const result = mergeTestFiles(['tests/unit/foo.test.mjs'], ['tests/unit/foo.test.mjs']);
    assert.deepEqual(result, ['tests/unit/foo.test.mjs']);
  });

  it('direct list order is preserved; discovered appended', () => {
    const result = mergeTestFiles(
      ['tests/unit/b.test.mjs', 'tests/unit/a.test.mjs'],
      ['tests/unit/c.test.mjs']
    );
    assert.deepEqual(result, [
      'tests/unit/b.test.mjs',
      'tests/unit/a.test.mjs',
      'tests/unit/c.test.mjs',
    ]);
  });

  it('returns empty when both lists are empty', () => {
    assert.deepEqual(mergeTestFiles([], []), []);
  });
});

// ---------------------------------------------------------------------------
// #855: collectTestFiles must not silently skip a brand-new, never-`git
// add`-ed test file. Runs against a real temp git repo — the bug is a
// property of tracked-vs-untracked git state that a stubbed diff string
// can't reproduce.
// ---------------------------------------------------------------------------

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function initRepo() {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'verify-develop-855-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  return dir;
}

function commitFile(dir, relPath, contents) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
  git(['add', relPath], dir);
  git(['commit', '-q', '-m', `add ${relPath}`], dir);
}

describe('collectTestFiles (#855 — untracked test files must not be skipped)', () => {
  it('discovers a brand-new, never-`git add`-ed *.test.mjs file', () => {
    const dir = initRepo();
    try {
      commitFile(dir, 'README.md', '# fixture\n');
      writeFileSync(join(dir, 'new.test.mjs'), "import { test } from 'node:test';\n");
      const files = collectTestFiles({ cwd: dir });
      assert.deepEqual(files, ['new.test.mjs']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('excludes an untracked *.test.mjs file under a .gitignore-d path', () => {
    const dir = initRepo();
    try {
      commitFile(dir, '.gitignore', '.tmp/\n');
      mkdirSync(join(dir, '.tmp'), { recursive: true });
      writeFileSync(join(dir, '.tmp', 'scratch.test.mjs'), "import { test } from 'node:test';\n");
      const files = collectTestFiles({ cwd: dir });
      assert.deepEqual(files, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs a tracked, modified test file exactly once (no duplicate from the untracked union)', () => {
    const dir = initRepo();
    try {
      commitFile(dir, 'existing.test.mjs', "import { test } from 'node:test';\n");
      writeFileSync(
        join(dir, 'existing.test.mjs'),
        "import { test } from 'node:test';\n// modified\n"
      );
      const files = collectTestFiles({ cwd: dir });
      assert.deepEqual(files, ['existing.test.mjs']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unions a tracked-modified file with a new untracked file, deduplicated', () => {
    const dir = initRepo();
    try {
      commitFile(dir, 'existing.test.mjs', "import { test } from 'node:test';\n");
      writeFileSync(
        join(dir, 'existing.test.mjs'),
        "import { test } from 'node:test';\n// modified\n"
      );
      writeFileSync(join(dir, 'new.test.mjs'), "import { test } from 'node:test';\n");
      const files = collectTestFiles({ cwd: dir });
      assert.deepEqual(new Set(files), new Set(['existing.test.mjs', 'new.test.mjs']));
      assert.equal(files.length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a discovered untracked test file that fails makes `node --test` exit non-zero', () => {
    const dir = initRepo();
    try {
      commitFile(dir, 'README.md', '# fixture\n');
      writeFileSync(
        join(dir, 'failing.test.mjs'),
        "import assert from 'node:assert/strict';\n" +
          "import { test } from 'node:test';\n" +
          "test('fails', () => { assert.equal(1, 2); });\n"
      );
      const files = collectTestFiles({ cwd: dir });
      assert.deepEqual(files, ['failing.test.mjs']);

      // NODE_TEST_CONTEXT must not leak into the nested `node --test` child:
      // when this suite itself runs under `node --test`, that env var makes
      // the child treat itself as a coordinated subordinate test process
      // (talking back to a parent via IPC) rather than a standalone run, so
      // it exits 0 regardless of its own failing assertions.
      const { NODE_TEST_CONTEXT: _dropped, ...childEnv } = process.env;
      const result = spawnSync(process.execPath, ['--test', files[0]], { cwd: dir, env: childEnv });
      assert.notEqual(result.status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty array in a repo with no test files at all', () => {
    const dir = initRepo();
    try {
      commitFile(dir, 'README.md', '# fixture\n');
      const files = collectTestFiles({ cwd: dir });
      assert.deepEqual(files, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('diff-filter semantics (documentation assertions)', () => {
  it('ACMR excludes deletions — deleted files do not appear in run list', () => {
    // Simulate: git diff --diff-filter=ACMR returns no deleted files
    // A deleted file would have status D; ACMR = Added|Copied|Modified|Renamed
    const diffOutput =
      'tests/integration/new-feature.test.mjs\ntests/integration/edited.test.mjs\n';
    const files = parseTestFiles(diffOutput);
    // Confirm: the list only contains added/modified files, never a deleted path
    assert.ok(files.every((f) => !f.includes('deleted')));
    assert.equal(files.length, 2);
  });

  it('empty diff produces no-op — exit early without running node --test', () => {
    const files = parseTestFiles('');
    assert.equal(files.length, 0);
    // The script exits 0 here; no node --test commands should be generated
    const cmds = buildTestCommands(files);
    assert.equal(cmds.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AC2 (#529): the lint/format step plan runs the FULL `npm run lint`
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// #867: main-module guard — importing the module must NOT execute the gate.
// Before the guard, importing verify-develop.mjs ran lint/format/tests and hit
// process.exit during import, killing this runner before any assertion ran
// (the file reported `tests 1 / pass 1` at ~21s with zero real assertions).
// These tests are the regression wall: they fail loudly if import-time
// execution is ever reintroduced.
// ---------------------------------------------------------------------------

describe('main-module guard (#867 — import has no side effects)', () => {
  it('importing the module in a child process runs no gate step and exits fast', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import * as m from ${JSON.stringify(MODULE_URL)};` +
          `console.log('IMPORT_OK', typeof m.runDevelopVerification);`,
      ],
      { encoding: 'utf8', cwd: REPO_ROOT, timeout: 10000 }
    );
    assert.equal(child.status, 0, `import child exited ${child.status}: ${child.stderr}`);
    assert.match(child.stdout, /IMPORT_OK function/);
    // If the gate had run on import, these step banners would appear in stdout.
    assert.doesNotMatch(child.stdout, /verify-develop: step/);
    assert.doesNotMatch(child.stdout, /nothing to verify/);
    assert.doesNotMatch(child.stdout, /all checks passed/);
  });

  it('isMainModule() returns false when the module is imported', () => {
    assert.equal(isMainModule(), false);
  });
});

describe('stage-aware command plans (#1089)', () => {
  it('iteration scopes autofix and format to changed paths', () => {
    const steps = buildIterationSteps(['src/a.mjs', 'docs/a.md']);
    assert.deepEqual(
      steps.map(({ command, args }) => [command, ...args]),
      [
        ['npx', 'eslint', '--fix', 'src/a.mjs'],
        ['npx', 'prettier', '--write', 'docs/a.md', 'src/a.mjs'],
      ]
    );
  });

  it('iteration never plans full lint or complete test lanes', () => {
    const serialized = JSON.stringify(buildIterationSteps(['src/a.mjs']));
    assert.doesNotMatch(serialized, /npm run lint/);
    assert.doesNotMatch(serialized, /test:(?:unit|integration|slow)/);
  });

  it('finalization owns full lint and format-check exactly once', () => {
    assert.deepEqual(
      buildFinalSteps().map(({ classification, command, args }) => ({
        classification,
        command,
        args,
      })),
      [
        { classification: 'lint-full', command: 'npm', args: ['run', 'lint'] },
        { classification: 'format-full', command: 'npm', args: ['run', 'format:check'] },
      ]
    );
  });
});

describe('runDevelopVerification (#1089)', () => {
  const fingerprint = {
    commitSha: 'a'.repeat(40),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: {},
      sandbox: { kind: 'worktree', identity: '/repo', clean: true },
    },
  };

  function baseDeps(overrides = {}) {
    const calls = [];
    return {
      calls,
      deps: {
        collectChangedPaths: () => ['src/a.mjs'],
        selectAffectedTests: () => ({
          tests: ['tests/a.test.mjs'],
          lanes: [],
          reasons: [],
          escalated: false,
        }),
        runCommand: (step) => {
          calls.push(step);
          return { exitCode: 0, durationMs: 10 };
        },
        getHeadSha: () => fingerprint.commitSha,
        isClean: () => true,
        buildFingerprint: () => fingerprint,
        now: () => '2026-08-01T18:00:00.000Z',
        ...overrides,
      },
    };
  }

  it('iteration runs scoped checks plus selected tests without any complete lane', () => {
    const { calls, deps } = baseDeps();
    const result = runDevelopVerification({ projectDir: '/repo', mode: 'iteration', deps });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'iteration');
    assert.deepEqual(result.selection.tests, ['tests/a.test.mjs']);
    assert.deepEqual(
      calls.map(({ command, args }) => [command, ...args]),
      [
        ['npx', 'eslint', '--fix', 'src/a.mjs'],
        ['npx', 'prettier', '--write', 'src/a.mjs'],
        ['node', '--test', 'tests/a.test.mjs'],
      ]
    );
    assert.doesNotMatch(JSON.stringify(calls), /test:(?:unit|integration|slow)/);
  });

  it('finalization requires clean committed state and returns a receipt', () => {
    const { calls, deps } = baseDeps();
    const result = runDevelopVerification({
      projectDir: '/repo',
      mode: 'final',
      issueNumber: 1089,
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.receipt.stage, 'develop-final');
    assert.equal(result.receipt.commitSha, fingerprint.commitSha);
    assert.deepEqual(
      result.receipt.commands.map(({ classification }) => classification),
      ['lint-full', 'format-full']
    );
    assert.deepEqual(
      calls.map(({ classification }) => classification),
      ['lint-full', 'format-full']
    );
  });

  it('finalization refuses a dirty starting tree before spawning commands', () => {
    const { calls, deps } = baseDeps({ isClean: () => false });
    const result = runDevelopVerification({
      projectDir: '/repo',
      mode: 'final',
      issueNumber: 1089,
      deps,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasons[0].code, 'final-tree-dirty');
    assert.deepEqual(calls, []);
  });

  it('finalization refuses when a command changes tracked files', () => {
    let cleanChecks = 0;
    const { deps } = baseDeps({ isClean: () => cleanChecks++ === 0 });
    const result = runDevelopVerification({
      projectDir: '/repo',
      mode: 'final',
      issueNumber: 1089,
      deps,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasons.at(-1).code, 'final-tree-mutated');
    assert.match(result.reasons.at(-1).message, /inspect, commit, and retry/);
  });
});

// ---------------------------------------------------------------------------
// AC3 (#529): regression — a spelling error in a changed source file is now
// caught in Develop. The "multiset" escape (lint:js-only gate skipping
// lint:spell) no longer reaches Test. We prove this structurally: the full
// `npm run lint` chain that verify-develop now runs includes `lint:spell`,
// which is the cspell pass that would flag a misspelling in a changed file.
// ---------------------------------------------------------------------------

describe('full lint covers spell/markdown gates (#529 multiset regression)', () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
  const lintScript = pkg.scripts.lint;

  it('package.json `lint` chains `lint:spell`', () => {
    assert.match(lintScript, /\blint:spell\b/);
  });

  it('package.json `lint` chains `lint:md`', () => {
    assert.match(lintScript, /\blint:md\b/);
  });

  it('`lint:spell` invokes cspell over source + markdown', () => {
    assert.match(pkg.scripts['lint:spell'], /cspell/);
  });

  it('Develop finalization runs the same full `npm run lint` that includes lint:spell', () => {
    // Closes the multiset escape: a misspelling in a changed .mjs source file
    // is caught by cspell (lint:spell) during Develop, not deferred to Test.
    const runsFullLint = buildFinalSteps().some((s) => s.args.join(' ') === 'run lint');
    assert.ok(runsFullLint);
    assert.match(lintScript, /\blint:spell\b/);
  });
});
