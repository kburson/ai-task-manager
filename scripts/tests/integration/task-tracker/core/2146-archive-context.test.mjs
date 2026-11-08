// @story #2146
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import {
  validateArchive,
  restoreArchive,
} from '../../../../research/2146-native-recovery/archive.mjs';
import { createHistoricalContext } from '../../../../research/2146-native-recovery/historical-context.mjs';

// Catch accidental fallback to historical absolute paths or unlisted source/artifact reads.
const { projectScratchDir } = await import(
  pathToFileURL(path.resolve('scripts/task-tracker/lib/scratch-dir.mjs'))
);
const temp = mkdtempSync(path.join(projectScratchDir('test', process.cwd()), '2146-context-'));
const evidence = path.join(temp, 'evidence');
mkdirSync(evidence, { mode: 0o700 });
const fixture = fileURLToPath(
  new URL('../../../../../docs/archive/2146-native-recovery/', import.meta.url)
);
restoreArchive(
  validateArchive(
    readFileSync(path.join(fixture, 'index.json')),
    readFileSync(path.join(fixture, 'objects.json.gz'))
  ),
  evidence
);
const create = () =>
  createHistoricalContext({
    sourceRoot: process.cwd(),
    restoredEvidence: evidence,
    sourceGit: () => {
      throw new Error('unexpected Git');
    },
  });
const original =
  '/Users/kpburson/.codex/worktrees/3d20/ai-task-manager/.scratch/native-recovery-spike/followup-20261103T233057Z';
const base = JSON.parse(readFileSync(path.join(evidence, 'qualified-baseline-results.json')));
after(() => rmSync(temp, { recursive: true, force: true }));

test('maps a real recorded run directory and reads the exact restored member', () => {
  const context = create();
  const relative = context.resolveHistoricalOutput(base.draft.out);
  assert.equal(relative, base.draft.out.slice(original.length + 1));
  assert.equal(context.readJson(path.join(evidence, relative, 'before.json')).branch, '');
  assert.equal(
    context.readJson(path.join(evidence, 'manifest-v2.json')).sourceHead,
    '2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0'
  );
});

for (const [name, target] of [
  ['foreign root', '/foreign/runs/x'],
  ['prefix collision', original + '-other/runs/x'],
  ['traversal', original + '/a/../qualified-baseline-results.json'],
  ['unknown directory', original + '/unlisted/runs/x'],
  ['a file instead of a directory', original + '/manifest-v2.json'],
])
  test(`refuses ${name} in historical output mapping`, () => {
    assert.throws(() => create().resolveHistoricalOutput(target), /historical:/);
  });

test('refuses foreign or unlisted reads instead of falling back to originals', () => {
  const context = create();
  for (const target of [
    original + '/report-v2.md',
    path.join(evidence, 'unlisted'),
    path.join(process.cwd(), '.git/config'),
  ]) {
    assert.throws(() => context.fs.readFileSync(target), /historical:/);
  }
  assert.ok(context.fs.readFileSync(path.join(process.cwd(), 'bin/aitm.mjs')).length > 0);
});

test('refuses a replaced original manifest before trusting its inventory', () => {
  const target = path.join(evidence, 'manifest-v2.json'),
    saved = readFileSync(target);
  try {
    writeFileSync(target, '{}\n');
    assert.throws(create, /historical:manifest-pin/);
  } finally {
    writeFileSync(target, saved);
  }
});

test('refuses a member replaced by a symlink after context creation', () => {
  const context = create(),
    member = path.join(evidence, 'report-v2.md'),
    saved = member + '.saved';
  renameSync(member, saved);
  try {
    symlinkSync(saved, member);
    assert.throws(() => context.fs.readFileSync(member), /historical:.*symlink/);
  } finally {
    rmSync(member);
    renameSync(saved, member);
  }
});

test('never exposes arbitrary Git commands through historical I/O', () => {
  assert.throws(
    () => create().execFileSync('git', ['fetch'], { cwd: process.cwd() }),
    /historical:git-command/
  );
});
