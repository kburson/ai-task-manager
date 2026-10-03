// @story #613 #1857
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { saveState } from '../../task-tracker/state.mjs';
import { createActivatedUnitRuntimeRoot } from './unit-runtime-root.mjs';

export function createCloseFixture(prefix) {
  const dir = createActivatedUnitRuntimeRoot(prefix);
  execFileSync('git', ['init', '-q', dir]);
  return dir;
}

export function tmpState(state, dir = createCloseFixture('aitm-613-')) {
  const statePath = join(dir, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  mkdirSync(dirname(statePath), { recursive: true });
  saveState(state, statePath);
  return { statePath, dir };
}

export function makeDirtyRepo() {
  const dir = createCloseFixture('aitm-613-dirty-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  writeFileSync(join(dir, 'dirty.txt'), 'uncommitted\n'); // untracked → dirty
  return dir;
}
