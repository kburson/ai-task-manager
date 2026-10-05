// @story #1882
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as api from '../../../task-tracker/merge-back.mjs';

function fixture(
  t,
  verifier = "import {writeFileSync} from 'node:fs'; writeFileSync('verified.txt','verified');"
) {
  mkdirSync('.scratch', { recursive: true });
  const top = mkdtempSync(path.resolve('.scratch/merge-back-cli-'));
  const parent = path.join(top, 'parent');
  const child = path.join(top, 'child');
  mkdirSync(parent);
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  t.after(() => {
    if (existsSync(child)) git(parent, 'worktree', 'remove', '--force', child);
    rmSync(top, { recursive: true, force: true });
  });
  const cfg = {
    repo: 'fixture/project',
    verificationProvider: {
      id: 'project',
      develop: {
        iterationSteps: [],
        finalSteps: [{ classification: 'lint-full', kind: 'lint', command: 'node verify.mjs' }],
      },
      test: {
        setup: 'npm-ci',
        steps: [{ classification: 'test-cloud', kind: 'test', command: 'node verify.mjs' }],
      },
    },
  };
  writeFileSync(
    path.join(parent, 'package.json'),
    JSON.stringify({ name: 'merge-back-cli-fixture', version: '1.0.0' })
  );
  writeFileSync(
    path.join(parent, 'package-lock.json'),
    JSON.stringify({
      name: 'merge-back-cli-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'merge-back-cli-fixture', version: '1.0.0' } },
    })
  );
  writeFileSync(path.join(parent, '.gitignore'), 'node_modules/\nverified.txt\n');
  writeFileSync(path.join(parent, 'verify.mjs'), verifier);
  mkdirSync(path.join(parent, '.ai-task-manager'));
  writeFileSync(path.join(parent, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
  git(parent, 'init', '-q', '-b', 'base');
  git(parent, 'config', 'user.name', 'CLI fixture');
  git(parent, 'config', 'user.email', 'fixture@example.invalid');
  git(parent, 'add', '.');
  git(parent, 'commit', '-qm', 'fixture baseline');
  git(parent, 'checkout', '-qb', 'codex/fixture-parent');
  git(parent, 'worktree', 'add', '-b', 'codex/fixture-child', child);
  writeFileSync(path.join(child, 'feature.txt'), 'child contribution');
  git(child, 'add', 'feature.txt');
  git(child, 'commit', '-qm', 'child feature');
  const before = git(parent, 'rev-parse', 'HEAD');
  const nodes = {
    905: {
      parent: null,
      children: [910],
      authoritativeBranch: 'codex/fixture-parent',
      authoritativeWorktree: parent,
    },
    910: {
      parent: 905,
      children: [],
      authoritativeBranch: 'codex/fixture-child',
      authoritativeWorktree: child,
      parentAuthoritativeBranch: 'codex/fixture-parent',
    },
  };
  const deps = {
    loadConfig: () => cfg,
    loadGraph: async () => (n) => nodes[n],
    fetchIssueBody: async () => '## Verification Commands\n',
    fetchTrunk: async () => {},
    resolveTrunkRef: async () => 'base',
  };
  return { parent, child, git, before, deps, nodes };
}

async function run(args, deps) {
  assert.equal(
    typeof api.runMergeBackCommand,
    'function',
    'registered CLI must use the provider-aware integration path'
  );
  return api.runMergeBackCommand(args, deps);
}

test('#1882: registered CLI integrates from child into its already checked-out parent and retains checkout', async (t) => {
  const { parent, child, git, deps } = fixture(t);
  const result = await run(['910', child, '--preserve-worktree'], deps);
  assert.equal(result.merged, true);
  assert.equal(git(parent, 'rev-parse', 'HEAD'), git(child, 'rev-parse', 'HEAD'));
  assert.equal(git(parent, 'branch', '--show-current'), 'codex/fixture-parent');
  assert.equal(git(child, 'branch', '--show-current'), 'codex/fixture-child');
  assert.equal(readFileSync(path.join(parent, 'feature.txt'), 'utf8'), 'child contribution');
  assert.equal(readFileSync(path.join(child, 'verified.txt'), 'utf8'), 'verified');
});

test('#1882: failed configured evidence leaves parent tip and child checkout intact', async (t) => {
  const { parent, child, git, before, deps } = fixture(t, 'process.exitCode = 1;');
  await assert.rejects(run(['910', child, '--preserve-worktree'], deps), /tests failed/);
  assert.equal(git(parent, 'rev-parse', 'HEAD'), before);
  assert.ok(existsSync(child));
  assert.equal(existsSync(path.join(parent, 'feature.txt')), false);
});

test('#1882: invalid CLI options refuse before any Git change', async (t) => {
  const { parent, child, git, before, deps } = fixture(t);
  await assert.rejects(run(['910', child, '--skip-tests'], deps), /unknown|usage|argument/);
  assert.equal(git(parent, 'rev-parse', 'HEAD'), before);
  assert.ok(existsSync(child));
});

test('#1882: wrong recorded parent checkout refuses without switching it', async (t) => {
  const { parent, child, git, before, deps } = fixture(t);
  git(parent, 'checkout', '-qb', 'other-parent');
  await assert.rejects(
    run(['910', child, '--preserve-worktree'], deps),
    /parent|integration.*branch/i
  );
  assert.equal(git(parent, 'branch', '--show-current'), 'other-parent');
  assert.equal(git(parent, 'rev-parse', 'HEAD'), before);
});

test('#1882: a parent checkout changed during verification is retained and refused', async (t) => {
  const { parent, child, git, before, deps } = fixture(t);
  git(parent, 'branch', 'other-parent');
  writeFileSync(
    path.join(child, 'verify.mjs'),
    "import {execFileSync} from 'node:child_process'; execFileSync('git',['-C'," +
      JSON.stringify(parent) +
      ",'checkout','other-parent']);"
  );
  git(child, 'add', 'verify.mjs');
  git(child, 'commit', '-qm', 'verifier changes parent checkout');
  await assert.rejects(run(['910', child, '--preserve-worktree'], deps), /parent.*branch/i);
  assert.equal(git(parent, 'branch', '--show-current'), 'other-parent');
  assert.equal(git(parent, 'rev-parse', 'HEAD'), before);
  assert.equal(existsSync(path.join(parent, 'feature.txt')), false);
});

test('#1882: malformed child config refuses without falling back to host suites', async (t) => {
  const { parent, child, git, before, deps } = fixture(t);
  writeFileSync(path.join(child, '.ai-task-manager/task-tracker.json'), '{broken');
  git(child, 'add', '.ai-task-manager/task-tracker.json');
  git(child, 'commit', '-qm', 'invalid provider config');
  await assert.rejects(run(['910', child, '--preserve-worktree'], deps), /JSON|property name/);
  assert.equal(git(parent, 'rev-parse', 'HEAD'), before);
  assert.ok(existsSync(child));
});
