// @story #1836
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
export async function repository(t) {
  await fs.mkdir('.tmp', { recursive: true });
  const base = await fs.mkdtemp(path.resolve('.tmp/graphql-storage-test-'));
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
