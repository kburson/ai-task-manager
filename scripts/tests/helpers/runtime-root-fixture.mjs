// @story #1872
// @story #1857
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function createRuntimeRootFixture(prefix = 'runtime-test-') {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const parent = path.join(repository, '.ai-task-manager', 'runtime', 'test-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, prefix));
  execFileSync('git', ['init', '-q', root]);
  return root;
}

// Capture before each test installs any Git shim.
export const fixtureGitExecutable = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
// #1873 — Git test doubles retain actual physical root and census discovery.
export function runtimeGitMetadataPrelude() {
  const realGit = fixtureGitExecutable;
  return `import { spawnSync as fixtureGitSpawn } from 'node:child_process';
const fixtureGitArgs = process.argv.slice(2);
if (fixtureGitArgs.includes('--path-format=absolute') || fixtureGitArgs.includes('--git-dir') || fixtureGitArgs.includes('--git-common-dir') || (fixtureGitArgs.includes('worktree') && fixtureGitArgs.includes('-z'))) {
  const result = fixtureGitSpawn(${JSON.stringify(realGit)}, fixtureGitArgs, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
`;
}
