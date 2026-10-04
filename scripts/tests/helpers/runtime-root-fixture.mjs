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
