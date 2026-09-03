// @story #1501
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import {
  captureRehearsal,
  inspectRehearsal,
  runRehearsal,
  disposeRehearsal,
} from '../../../../../task-tracker/lib/evidence-v2/rehearsal-manifest.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'rehearsal',
      GIT_AUTHOR_EMAIL: 'rehearsal@example.invalid',
      GIT_COMMITTER_NAME: 'rehearsal',
      GIT_COMMITTER_EMAIL: 'rehearsal@example.invalid',
    },
  }).trim();
function repository(root, name) {
  const repo = path.join(root, name);
  mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'trunk']);
  writeFileSync(path.join(repo, 'story.txt'), `${name}\n`);
  git(repo, ['add', 'story.txt']);
  git(repo, ['commit', '-qm', name]);
  return repo;
}

test('frozen histories use independent object storage and protection checks detect change', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-1501-slow-'));
  const sources = [1490, 1488, 1485].map((issue) => ({
    issue,
    path: repository(root, String(issue)),
    ref: 'HEAD',
  }));
  const capture = captureRehearsal({ sources, outputRoot: path.join(root, 'out') });
  for (const source of capture.sources) {
    assert.notEqual(
      git(source.objectStore, ['rev-parse', '--git-common-dir']),
      `${source.path}/.git`
    );
    assert.equal(git(source.objectStore, ['cat-file', '-t', source.commitOid]), 'commit');
  }
  const run = runRehearsal({ captureManifestPath: capture.manifestPath, toolRoot: ROOT });
  assert.equal(inspectRehearsal(run.manifestPath).status, 'verified');
  writeFileSync(path.join(sources[0].path, 'story.txt'), 'changed\n');
  assert.throws(() => inspectRehearsal(run.manifestPath), /protected-source-changed/);
});

test('capture refuses dirty sources and disposal refuses escapes or unreported work', () => {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-1501-refuse-'));
  const source = repository(root, 'dirty');
  writeFileSync(path.join(source, 'untracked.txt'), 'no\n');
  assert.throws(
    () =>
      captureRehearsal({
        sources: [{ issue: 1490, path: source, ref: 'HEAD' }],
        outputRoot: path.join(root, 'out'),
      }),
    /source-dirty/
  );
  git(source, ['clean', '-fd']);
  const capture = captureRehearsal({
    sources: [{ issue: 1490, path: source, ref: 'HEAD' }],
    outputRoot: path.join(root, 'out'),
  });
  const run = runRehearsal({ captureManifestPath: capture.manifestPath, toolRoot: ROOT });
  writeFileSync(path.join(run.sandboxRoot, 'unexpected.txt'), 'unique\n');
  assert.throws(() => disposeRehearsal(run.manifestPath, run.runId), /sandbox-unreported-work/);
  assert.throws(() => disposeRehearsal(run.manifestPath, 'wrong'), /run-confirmation/);
});
