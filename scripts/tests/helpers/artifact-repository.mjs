// @story #2096
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';

export function artifactRepository(t) {
  const root = mkdtempProjectIsolated('artifact-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('config', 'user.name', 'Artifact test');
  git('config', 'user.email', 'artifact@example.test');
  writeFileSync(path.join(root, 'source.txt'), 'candidate');
  writeFileSync(path.join(root, 'package-lock.json'), '{}');
  writeFileSync(path.join(root, 'package.json'), '{}');
  git('add', '-f', 'source.txt', 'package.json', 'package-lock.json');
  git('commit', '-qm', '[#2096] candidate');
  const candidate = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  writeFileSync(path.join(root, 'source.txt'), 'controller');
  writeFileSync(path.join(root, 'package.json'), '{"name":"controller"}');
  writeFileSync(path.join(root, 'package-lock.json'), '{"name":"controller"}');
  git('commit', '-qam', 'Controller advances');
  return { root, git, candidate, tree, operatorHead: git('rev-parse', 'HEAD') };
}
