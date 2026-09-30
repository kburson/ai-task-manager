// @story #310
// Tests for scripts/task-tracker/activity-policy.mjs
//
// Covers:
//   - classifyEdit: code globs, doc globs, WRITE_ISSUE, excludes, fallthrough.
//   - classifyBash: test runners, build commands, git commit, redirects/tee/heredoc,
//                   READ_*, doc-vs-code precedence for write targets.
//   - isAllowed: every documented (state, class) pair from epic #61 + no-active-task.
//   - loadPolicy: file present, file missing, file invalid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';

import {
  DEFAULT_POLICY,
  STATE_MATRIX,
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
} from '../../../../task-tracker/activity-policy.mjs';
import { stateIds } from '../../../../task-tracker/lib/lifecycle-policy/index.mjs';
import {
  resolveInvocationDirectory,
  resolveMutationTarget,
  parseDirectGit,
  classifyStagedRecords,
  readStagedRecords,
  discoverBashActivity,
  hasUnsupportedGitEnvironment,
} from '../../../../task-tracker/lib/mutation-context.mjs';

// ---------------------------------------------------------------------------
// classifyEdit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// classifyBash
// ---------------------------------------------------------------------------

test('classifyBash: test runners', () => {
  assert.equal(classifyBash('npm test'), 'RUN_TESTS');
  assert.equal(classifyBash('npm run test'), 'RUN_TESTS');
  assert.equal(classifyBash('npm run test -- --watch'), 'RUN_TESTS');
  assert.equal(classifyBash('node --test'), 'RUN_TESTS');
  assert.equal(classifyBash('pytest tests/'), 'RUN_TESTS');
  assert.equal(classifyBash('cargo test'), 'RUN_TESTS');
  assert.equal(classifyBash('go test ./...'), 'RUN_TESTS');
});

test('classifyBash: build commands', () => {
  assert.equal(classifyBash('npm run build'), 'RUN_BUILD');
  assert.equal(classifyBash('tsc'), 'RUN_BUILD');
  assert.equal(classifyBash('tsc -p .'), 'RUN_BUILD');
  assert.equal(classifyBash('cargo build --release'), 'RUN_BUILD');
  assert.equal(classifyBash('go build ./...'), 'RUN_BUILD');
});

test('classifyBash: git commit', () => {
  assert.equal(classifyBash('git commit -m "msg"'), 'COMMIT_CODE');
  assert.equal(classifyBash('git commit -am quick'), 'COMMIT_CODE');
  assert.equal(classifyBash('git -C . commit -m \"msg\"'), 'COMMIT_CODE');
  assert.equal(classifyBash('git --no-pager -c color.ui=false commit -m \"msg\"'), 'COMMIT_CODE');
});

test('classifyBash: READ_* for benign commands', () => {
  assert.equal(classifyBash('ls -la'), 'READ_*');
  assert.equal(classifyBash('cat src/foo.ts'), 'READ_*');
  assert.equal(classifyBash('grep -r foo src/'), 'READ_*');
  assert.equal(classifyBash('git status'), 'READ_*');
  assert.equal(classifyBash('git log --oneline'), 'READ_*');
});

test('classifyBash: redirect write target classified by path', () => {
  assert.equal(classifyBash('echo hi > src/foo.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('echo hi >> docs/x.md'), 'WRITE_DOCS');
  assert.equal(classifyBash('cat src/foo.ts > /tmp/x'), 'WRITE_OTHER');
});

test('classifyBash: tee write target', () => {
  assert.equal(classifyBash('echo x | tee src/foo.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('echo x | tee -a docs/notes.md'), 'WRITE_DOCS');
});

test('classifyBash: heredoc write target', () => {
  // Heredoc-to-file with redirect operator.
  assert.equal(classifyBash("cat <<'EOF' > src/foo.ts\nbody\nEOF"), 'WRITE_CODE');
});

test('classifyBash: shell metachars inside quoted args do not trigger write detection', () => {
  // `<pkg-version>` inside a single-quoted label looks like a redirect but
  // must be ignored. Regression for /task check labels containing HTML-style
  // markers.
  assert.equal(
    classifyBash("node scripts/task-tracker/task-tracker.mjs check 'marker <pkg-version> stamped'"),
    'READ_*'
  );
  // Double-quoted variant.
  assert.equal(
    classifyBash('node scripts/task-tracker/task-tracker.mjs check "label with > and >> inside"'),
    'READ_*'
  );
  // Real redirect outside quotes still detected.
  assert.equal(classifyBash("echo 'inside > quotes' > src/real.ts"), 'WRITE_CODE');
});

test('classifyBash: touch/mkdir code path', () => {
  assert.equal(classifyBash('touch src/new.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('mkdir -p docs/sub'), 'WRITE_DOCS');
});

// ---------------------------------------------------------------------------
// STATE_MATRIX + isAllowed
// ---------------------------------------------------------------------------

test('STATE_MATRIX: matches epic #61 allow-list verbatim', () => {
  assert.deepEqual(
    [...STATE_MATRIX.backlog].sort(),
    ['COMMIT_DOCS', 'READ_*', 'WRITE_DOCS', 'WRITE_ISSUE'].sort()
  );
  assert.deepEqual(
    [...STATE_MATRIX.refine].sort(),
    ['COMMIT_DOCS', 'READ_*', 'WRITE_DOCS', 'WRITE_ISSUE'].sort()
  );
  assert.deepEqual(
    [...STATE_MATRIX.plan].sort(),
    ['COMMIT_DOCS', 'READ_*', 'RUN_TESTS', 'WRITE_DOCS', 'WRITE_ISSUE'].sort()
  );
  assert.deepEqual(
    [...STATE_MATRIX.develop].sort(),
    [
      'COMMIT_CODE',
      'COMMIT_DOCS',
      'READ_*',
      'RUN_BUILD',
      'RUN_TESTS',
      'WRITE_CODE',
      'WRITE_DOCS',
      'WRITE_ISSUE',
    ].sort()
  );
  assert.deepEqual(
    [...STATE_MATRIX.test].sort(),
    ['READ_*', 'RUN_BUILD', 'RUN_TESTS', 'WRITE_ISSUE'].sort()
  );
  assert.deepEqual([...STATE_MATRIX.review].sort(), ['READ_*', 'WRITE_DOCS', 'WRITE_ISSUE'].sort());
  assert.deepEqual([...STATE_MATRIX.done].sort(), ['READ_*'].sort());
});

test('isAllowed: every state allows READ_*', () => {
  for (const s of stateIds()) {
    assert.equal(isAllowed(s, 'READ_*'), true, `${s} should allow READ_*`);
  }
});

test('isAllowed: develop allows everything', () => {
  for (const c of [
    'WRITE_CODE',
    'COMMIT_CODE',
    'COMMIT_DOCS',
    'WRITE_DOCS',
    'WRITE_ISSUE',
    'RUN_TESTS',
    'RUN_BUILD',
    'READ_*',
  ]) {
    assert.equal(isAllowed('develop', c), true);
  }
});

// #281 AC3 + AC4 — Plan stage refuses WRITE_CODE (file writes) and
// COMMIT_CODE (git commits), but allows WRITE_DOCS / WRITE_ISSUE / RUN_TESTS
// / READ_*. The grandfather marker is deliberately NOT honored at this layer:
// AC3/AC4 are forward-looking gates, not legacy-artifact bypasses.
test('isAllowed: plan refuses WRITE_CODE / COMMIT_CODE / WRITE_OTHER / RUN_BUILD', () => {
  assert.equal(isAllowed('plan', 'WRITE_CODE'), false);
  assert.equal(isAllowed('plan', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('plan', 'WRITE_OTHER'), false);
  assert.equal(isAllowed('plan', 'RUN_BUILD'), false);
  // Permitted in plan — planning docs, issue body edits, test runs.
  assert.equal(isAllowed('plan', 'WRITE_DOCS'), true);
  assert.equal(isAllowed('plan', 'WRITE_ISSUE'), true);
  assert.equal(isAllowed('plan', 'RUN_TESTS'), true);
  assert.equal(isAllowed('plan', 'READ_*'), true);
});

test('isAllowed: refine refuses WRITE_CODE / COMMIT_CODE / RUN_TESTS / RUN_BUILD', () => {
  assert.equal(isAllowed('refine', 'WRITE_CODE'), false);
  assert.equal(isAllowed('refine', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('refine', 'WRITE_DOCS'), true);
  assert.equal(isAllowed('refine', 'RUN_TESTS'), false);
  assert.equal(isAllowed('refine', 'RUN_BUILD'), false);
});

test('isAllowed: test refuses WRITE_CODE; allows tests/build', () => {
  assert.equal(isAllowed('test', 'WRITE_CODE'), false);
  assert.equal(isAllowed('test', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('test', 'WRITE_DOCS'), false);
  assert.equal(isAllowed('test', 'RUN_TESTS'), true);
  assert.equal(isAllowed('test', 'RUN_BUILD'), true);
  assert.equal(isAllowed('test', 'WRITE_ISSUE'), true);
});

test('isAllowed: review allows docs + issues only (no code)', () => {
  assert.equal(isAllowed('review', 'WRITE_DOCS'), true);
  assert.equal(isAllowed('review', 'WRITE_ISSUE'), true);
  assert.equal(isAllowed('review', 'WRITE_CODE'), false);
  assert.equal(isAllowed('review', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('review', 'RUN_TESTS'), false);
});

test('isAllowed: done allows READ_* only', () => {
  assert.equal(isAllowed('done', 'READ_*'), true);
  for (const c of [
    'WRITE_CODE',
    'COMMIT_CODE',
    'COMMIT_DOCS',
    'WRITE_DOCS',
    'WRITE_ISSUE',
    'RUN_TESTS',
    'RUN_BUILD',
  ]) {
    assert.equal(isAllowed('done', c), false, `done should refuse ${c}`);
  }
});

test('isAllowed: no-active-task policy (state == null)', () => {
  assert.equal(isAllowed(null, 'WRITE_CODE'), false);
  assert.equal(isAllowed(null, 'COMMIT_CODE'), false);
  assert.equal(isAllowed(null, 'WRITE_DOCS'), true);
  assert.equal(isAllowed(null, 'WRITE_ISSUE'), true);
  assert.equal(isAllowed(null, 'RUN_TESTS'), true);
  assert.equal(isAllowed(null, 'RUN_BUILD'), true);
  assert.equal(isAllowed(null, 'READ_*'), true);
  assert.equal(isAllowed(undefined, 'WRITE_CODE'), false);
  assert.equal(isAllowed(undefined, 'WRITE_DOCS'), true);
});

test('isAllowed: unknown state refuses everything except READ_* via no-fallback', () => {
  // Unknown state is treated as not matching the matrix; refuse.
  assert.equal(isAllowed('bogus', 'WRITE_CODE'), false);
  assert.equal(isAllowed('bogus', 'WRITE_DOCS'), false);
  // READ_* still passes because READ_* is universally allowed (never blocked).
  assert.equal(isAllowed('bogus', 'READ_*'), true);
});

// ---------------------------------------------------------------------------
// loadPolicy
// ---------------------------------------------------------------------------

test('loadPolicy: missing file returns DEFAULT_POLICY', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'apolicy-'));
  const p = loadPolicy(dir);
  assert.deepEqual(p, DEFAULT_POLICY);
});

test('loadPolicy: present file is parsed', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'apolicy-'));
  mkdirSync(path.join(dir, '.ai-task-manager'));
  const custom = {
    codeGlobs: ['custom/**'],
    codeGlobExcludes: [],
    docGlobs: ['notes/**'],
    testRunners: ['mytest'],
    buildCommands: ['mybuild'],
  };
  writeFileSync(path.join(dir, '.ai-task-manager', 'activity-policy.json'), JSON.stringify(custom));
  const p = loadPolicy(dir);
  assert.deepEqual(p.codeGlobs, ['custom/**']);
  assert.deepEqual(p.testRunners, ['mytest']);
});

test('loadPolicy: invalid json falls back to DEFAULT_POLICY', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'apolicy-'));
  mkdirSync(path.join(dir, '.ai-task-manager'));
  writeFileSync(path.join(dir, '.ai-task-manager', 'activity-policy.json'), '{not-json');
  const p = loadPolicy(dir);
  assert.deepEqual(p, DEFAULT_POLICY);
});

// ---------------------------------------------------------------------------
// classifyEdit / classifyBash accept policy override
// ---------------------------------------------------------------------------

test('classifyEdit: respects custom policy', () => {
  const policy = {
    codeGlobs: ['app/**'],
    codeGlobExcludes: [],
    docGlobs: ['notes/**'],
    testRunners: [],
    buildCommands: [],
  };
  assert.equal(classifyEdit('app/main.ts', policy), 'WRITE_CODE');
  assert.equal(classifyEdit('notes/foo.md', policy), 'WRITE_DOCS');
  assert.equal(classifyEdit('src/foo.ts', policy), 'WRITE_OTHER');
});

test('classifyBash: respects custom policy testRunners/buildCommands', () => {
  const policy = {
    codeGlobs: ['src/**'],
    codeGlobExcludes: [],
    docGlobs: ['docs/**', '**/*.md'],
    testRunners: ['mytest'],
    buildCommands: ['mybuild'],
  };
  assert.equal(classifyBash('mytest --foo', policy), 'RUN_TESTS');
  assert.equal(classifyBash('mybuild release', policy), 'RUN_BUILD');
  assert.equal(classifyBash('npm test', policy), 'READ_*'); // not in custom testRunners
});

test('COMMIT_DOCS is allowed only with an active drafting or Develop state', () => {
  for (const state of [null, undefined, 'test', 'review', 'done', 'unknown']) {
    assert.equal(isAllowed(state, 'COMMIT_DOCS'), false, String(state));
  }
  assert.equal(isAllowed('plan', 'COMMIT_DOCS'), true);
  assert.equal(isAllowed('develop', 'COMMIT_DOCS'), true);
});

test('invocation directory uses supplied workdir then cwd with relative bases', () => {
  const base = mkdtempSync(path.join(projectScratchDir('test'), 'invocation-'));
  const processCwd = path.join(base, 'main');
  mkdirSync(processCwd);
  mkdirSync(path.join(processCwd, 'linked'));
  mkdirSync(path.join(base, 'linked', 'sub'), { recursive: true });
  mkdirSync(path.join(base, 'linked', 'elsewhere'));
  assert.equal(
    resolveInvocationDirectory(
      { cwd: path.join(base, 'linked'), tool_input: { workdir: 'sub' } },
      processCwd
    ),
    path.join(base, 'linked', 'sub')
  );
  assert.equal(
    resolveInvocationDirectory(
      { cwd: path.join(base, 'linked'), tool_input: { cwd: 'elsewhere' } },
      processCwd
    ),
    path.join(base, 'linked', 'elsewhere')
  );
  assert.equal(
    resolveInvocationDirectory({ cwd: 'linked' }, processCwd),
    path.join(processCwd, 'linked')
  );
  assert.throws(() =>
    resolveInvocationDirectory(
      { cwd: path.join(base, 'linked'), tool_input: { workdir: '' } },
      processCwd
    )
  );
});

test('mutation target requires both lexical and physical worktree containment', () => {
  const base = mkdtempSync(path.join(projectScratchDir('test'), 'target-'));
  const root = path.join(base, 'root');
  mkdirSync(root);
  try {
    const target = resolveMutationTarget('docs/new/plan.md', root, root);
    assert.equal(target.relative, 'docs/new/plan.md');
    assert.throws(() => resolveMutationTarget(path.join(base, 'outside.md'), root, root));
    assert.throws(() => resolveMutationTarget('../outside.md', root, root));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('direct command parser preserves sequential -C and bounds Plan syntax', () => {
  const binary = 'g' + 'it';
  const verb = 'com' + 'mit';
  const good = [
    `${binary} ${verb} -m "[#1830] docs"`,
    `${binary} -C child -C .. --no-pager -c color.ui=false ${verb} -m "[#1830] docs"`,
    `command ${binary} -C child ${verb} -m "[#1830] docs"`,
    `env LANG=C ${binary} ${verb} -m "[#1830] docs"`,
  ];
  for (const command of good) {
    const parsed = parseDirectGit(command, path.join(path.sep, 'repo'));
    assert.equal(parsed.kind, verb, command);
    assert.equal(parsed.docEligible, true, command);
  }
  assert.equal(
    parseDirectGit(good[1], path.join(path.sep, 'repo')).cwd,
    path.join(path.sep, 'repo')
  );
  for (const command of [
    `${binary} ${verb} -am "[#1830] docs"`,
    `${binary} ${verb} --amend -m "[#1830] docs"`,
    `${binary} -c core.hooksPath=local ${verb} -m "[#1830] docs"`,
    `${binary} --git-dir=.git ${verb} -m "[#1830] docs"`,
    `${binary} status && ${binary} ${verb} -m "[#1830] docs"`,
  ])
    assert.equal(parseDirectGit(command, path.join(path.sep, 'repo')).docEligible, false, command);
});

test('ambient Git selectors and config injection cannot grant document commits', () => {
  assert.equal(hasUnsupportedGitEnvironment({ GIT_PAGER: 'cat' }), false);
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT']) {
    assert.equal(hasUnsupportedGitEnvironment({ [name]: 'x' }), true, name);
  }
});

test('staged document contract checks modes and rename sides', () => {
  const doc = { status: 'M', oldMode: '100644', newMode: '100644', paths: ['docs/review.md'] };
  assert.equal(classifyStagedRecords([doc]), 'COMMIT_DOCS');
  for (const record of [
    { ...doc, paths: ['docs/run.mjs'] },
    { ...doc, paths: ['docs/package.json'] },
    { ...doc, paths: ['CLAUDE.md'] },
    { ...doc, newMode: '100755' },
    { ...doc, newMode: '120000' },
    { ...doc, status: 'R', paths: ['src/old.mjs', 'docs/review.md'] },
  ])
    assert.equal(classifyStagedRecords([record]), 'COMMIT_CODE');
  assert.throws(() => classifyStagedRecords([]));
  assert.throws(() => classifyStagedRecords([{ ...doc, status: 'U' }]));
});

test('real staged index classifies regular Markdown and mixed source separately', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'staged-'));
  const binary = 'g' + 'it';
  const run = (...args) => execFileSync(binary, args, { cwd: dir, stdio: 'pipe' });
  try {
    run('init', '-q');
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'docs', 'review.md'), 'review');
    run('add', 'docs/review.md');
    assert.equal(classifyStagedRecords(readStagedRecords(dir)), 'COMMIT_DOCS');
    writeFileSync(path.join(dir, 'docs', 'run.mjs'), 'run');
    run('add', 'docs/run.mjs');
    assert.equal(classifyStagedRecords(readStagedRecords(dir)), 'COMMIT_CODE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compound document staging cannot hide a source write', () => {
  assert.equal(classifyBash('echo x > scripts/example.mjs; git add docs/review.md'), 'WRITE_CODE');
  assert.equal(classifyBash('echo x > scripts/example.mjs; echo y > docs/review.md'), 'WRITE_CODE');
  assert.equal(classifyBash('echo x > docs/review.md; git add docs/review.md'), 'WRITE_CODE');
});

test('read-only Git config and worktree queries stay read-only', () => {
  for (const command of [
    'git config --get remote.origin.url',
    'git config --local --get remote.origin.url',
    'git config --list',
    'git worktree list --porcelain',
  ]) {
    assert.equal(discoverBashActivity(command, process.cwd()), null, command);
    assert.equal(classifyBash(command), 'READ_*', command);
  }
  for (const command of ['git config --global user.name test', 'git worktree add ../other']) {
    assert.equal(discoverBashActivity(command, process.cwd()), 'COMMIT_CODE', command);
  }
});

test('command and env wrappers preserve nested shell mutations', () => {
  for (const command of ["env bash -c 'git commit -m x'", "command bash -c 'git commit -m x'"]) {
    assert.equal(discoverBashActivity(command, process.cwd()), 'COMMIT_CODE', command);
    assert.equal(classifyBash(command), 'COMMIT_CODE', command);
  }
});

test('nested shell discovery enforces executable mutations but ignores printed text', () => {
  const binary = 'g' + 'it';
  const verb = 'com' + 'mit';
  assert.equal(
    discoverBashActivity(`bash -c '${binary} ${verb} -m x'`, process.cwd()),
    'COMMIT_CODE'
  );
  assert.equal(discoverBashActivity(`echo '${binary} ${verb} -m x'`, process.cwd()), null);
  assert.equal(discoverBashActivity(`${binary} add docs/review.md`, process.cwd()), 'WRITE_DOCS');
  assert.equal(discoverBashActivity(`${binary} add docs/run.mjs`, process.cwd()), 'WRITE_CODE');
});

// @story #1848
for (const state of ['backlog', 'refine', 'ready-for-plan']) {
  test(`draft documents are permitted in ${state} without granting implementation`, () => {
    assert.equal(isAllowed(state, 'WRITE_DOCS'), true);
    assert.equal(isAllowed(state, 'COMMIT_DOCS'), true);
    for (const activity of ['WRITE_CODE', 'COMMIT_CODE', 'RUN_TESTS', 'RUN_BUILD'])
      assert.equal(isAllowed(state, activity), false);
  });
}

test('contained issue scratch shell writes have their own activity without hiding source or git', () => {
  assert.equal(classifyBash("cat > .scratch/plan/scope.md <<'EOF'\nscope\nEOF"), 'WRITE_SCRATCH');
  assert.equal(classifyBash('mkdir -p .scratch/plan'), 'WRITE_SCRATCH');
  assert.equal(
    classifyBash('echo x > .scratch/plan/scope.md; echo x > src/hidden.mjs'),
    'WRITE_CODE'
  );
  assert.equal(classifyBash('echo x > .scratch/scope.md; git reset --hard'), 'COMMIT_CODE');
  assert.notEqual(classifyBash('echo x > .scratch/../src/hidden.mjs'), 'WRITE_SCRATCH');
  assert.notEqual(classifyBash('echo x > /' + 'tmp/hidden.md'), 'WRITE_SCRATCH');
});

// @story #1848
test('quoted here-document data does not become shell authority', () => {
  const binary = 'g' + 'it';
  const data = `cat > docs/draft.md <<'EOF'\n${binary} reset --hard\nEOF`;
  assert.equal(classifyBash(data), 'WRITE_DOCS');
  assert.equal(classifyBash(`python3 - <<'PY'\nprint('rm imaginary')\nPY`), 'WRITE_CODE');
  assert.equal(classifyBash(data + `\n${binary} reset --hard`), 'COMMIT_CODE');
  assert.notEqual(
    classifyBash(`cat > .scratch/scope.md <<'EOF'\ntext\nEOF\n${binary} reset --hard`),
    'WRITE_SCRATCH'
  );
});

// @story #1848
test('cat compound headers and draft suffixes do not inherit data authority', () => {
  for (const header of ['cat | bash', 'cat && python3', 'cat; bash'])
    assert.equal(classifyBash(`${header} <<'EOF'\ntext\nEOF`), 'WRITE_CODE');
  const draft = "cat > docs/draft.md <<'EOF'\ntext\nEOF";
  assert.equal(classifyBash(draft + '\nnode --test scripts/tests/example.test.mjs'), 'RUN_TESTS');
  assert.equal(classifyBash(draft + '\nnpm run build'), 'RUN_BUILD');
  assert.equal(classifyBash(draft + '\nnode --test example.test.mjs; npm run build'), 'RUN_BUILD');
  assert.equal(
    classifyBash(draft + '\nnode --test example.test.mjs; cp docs/draft.md scripts/source.mjs'),
    'WRITE_CODE'
  );
  assert.equal(classifyBash('git add docs/draft.md && npm test'), 'WRITE_CODE');
  assert.equal(classifyBash('git branch codex/arbitrary'), 'COMMIT_CODE');
  assert.equal(classifyBash('git branch -D other'), 'COMMIT_CODE');
  assert.equal(classifyBash('git branch --show-current'), 'READ_*');
  assert.equal(classifyBash('git branch --list codex/*'), 'READ_*');
});

// @story #1848
test('draft compounds refuse uninspectable source-mutating suffixes', () => {
  const draft = "cat > docs/draft.md <<'EOF'\ntext\nEOF";
  for (const suffix of [
    "sed -i '' s/a/b/ scripts/source.mjs",
    'cp docs/draft.md scripts/source.mjs',
    'node -e "process.exit(0)"',
  ])
    assert.equal(classifyBash(draft + '\n' + suffix), 'WRITE_CODE');
  assert.equal(classifyBash("rg -n '<<' scripts/task-tracker"), 'READ_*');
  for (const name of ['GIT_COMMON_DIR', 'GIT_NAMESPACE'])
    assert.equal(hasUnsupportedGitEnvironment({ [name]: 'other' }), true);
});

// @story #1848
test('documentation admission rejects uninspectable output redirects', () => {
  for (const command of [
    "echo draft > docs/draft.md; echo code > 'scripts/source.mjs'",
    'echo draft > docs/draft.md; printf code > "scripts/source.mjs"',
    'echo draft > docs/draft.md; echo code 2> scripts/source.mjs',
    'echo draft > "docs/draft.md"',
  ])
    assert.equal(classifyBash(command), 'WRITE_CODE', command);
});
