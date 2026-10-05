// @story #1836
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';
export async function repository(t) {
  const base = mkdtempProjectIsolated('graphql-storage-');
  await fs.rm(path.join(base, '.git'), { recursive: true, force: true });
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const cwd = path.join(base, 'main');
  await fs.mkdir(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
  git('init');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('commit', '--allow-empty', '-m', 'fixture');
  return { base, cwd, git };
}
