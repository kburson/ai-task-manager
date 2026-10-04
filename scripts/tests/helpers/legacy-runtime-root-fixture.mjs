// @story #1861
// Legacy-consumer compatibility fixtures: genuine roots, no durable activation.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from './runtime-root-fixture.mjs';
export function createLegacyRootFixture(prefix) {
  const root = createRuntimeRootFixture(prefix);
  for (const [relative, value] of Object.entries({
    'state/task-tracker-state.json': {},
    'state/task-tracker-queue.json': [],
    'fleet/task-fleet.json': {},
    'fleet/occupancy.json': {},
  })) {
    const file = path.join(root, '.tmp', 'aitm', relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  return root;
}
export function createCommittedLegacyRootFixture(prefix) {
  const root = createLegacyRootFixture(prefix);
  execFileSync('git', ['-C', root, 'branch', '-M', 'trunk']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  return root;
}
