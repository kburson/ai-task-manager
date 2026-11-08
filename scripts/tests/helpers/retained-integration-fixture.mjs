// @story #2145
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from './runtime-root-fixture.mjs';

export function retainedIntegrationFixture(
  t,
  { verifier = 'process.exitCode = 0;', diverged = true, runtimeFixture = false } = {}
) {
  mkdirSync('.scratch', { recursive: true });
  const root = runtimeFixture
    ? createRuntimeRootFixture('retained-integration-')
    : mkdtempSync(path.resolve('.scratch/retained-integration-'));
  const parent = path.join(root, 'parent');
  const child = path.join(root, 'child');
  mkdirSync(parent);
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  t.after(() => {
    if (existsSync(child)) {
      try {
        git(parent, 'worktree', 'remove', '--force', child);
      } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  });
  const cfg = {
    repo: 'fixture/project',
    trunkRef: 'base',
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
    JSON.stringify({ name: 'retained-integration-fixture', version: '1.0.0', type: 'module' })
  );
  writeFileSync(
    path.join(parent, 'package-lock.json'),
    JSON.stringify({
      name: 'retained-integration-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'retained-integration-fixture', version: '1.0.0' } },
    })
  );
  writeFileSync(path.join(parent, '.gitignore'), 'node_modules/\n.tmp/\nevidence.txt\n.proof/\n');
  writeFileSync(path.join(parent, 'verify.mjs'), verifier);
  mkdirSync(path.join(parent, '.ai-task-manager'));
  writeFileSync(path.join(parent, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
  git(parent, 'init', '-q', '-b', 'base');
  git(parent, 'config', 'user.name', 'Fixture');
  git(parent, 'config', 'user.email', 'fixture@example.invalid');
  git(parent, 'add', '.');
  git(parent, 'commit', '-qm', 'base');
  const base = git(parent, 'rev-parse', 'HEAD');
  git(parent, 'checkout', '-qb', 'codex/retained-parent');
  git(parent, 'worktree', 'add', '-b', 'codex/retained-child', child);
  const commit = (cwd, file, contents, message) => {
    writeFileSync(path.join(cwd, file), contents);
    git(cwd, 'add', '--force', file);
    git(cwd, 'commit', '-qm', message);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  const childHead = commit(child, 'child.txt', 'original child bytes\n', 'child');
  const parentHead = diverged ? commit(parent, 'parent.txt', 'parent bytes\n', 'parent') : base;
  const nodes = {
    905: {
      parent: null,
      children: [910],
      authoritativeBranch: 'codex/retained-parent',
      authoritativeWorktree: parent,
    },
    910: {
      parent: 905,
      children: [],
      authoritativeBranch: 'codex/retained-child',
      authoritativeWorktree: child,
      parentAuthoritativeBranch: 'codex/retained-parent',
    },
  };
  const deps = {
    loadConfig: () => cfg,
    loadGraph: async () => (n) => nodes[n],
    fetchIssueBody: async () => '## Verification Commands\n',
    fetchTrunk: async () => {},
    resolveTrunkRef: async () => 'base',
  };
  return { root, parent, child, git, commit, cfg, nodes, deps, base, childHead, parentHead };
}
