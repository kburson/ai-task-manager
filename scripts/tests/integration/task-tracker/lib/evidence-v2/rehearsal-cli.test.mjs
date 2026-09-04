// @story #1501
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const CLI = path.join(ROOT, 'scripts/maintenance/rehearse-evidence-v2.mjs');
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
function fixture() {
  const root = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-1501-cli-'));
  const source = path.join(root, 'source');
  const output = path.join(root, 'output');
  mkdirSync(source);
  git(source, ['init', '-q', '-b', 'trunk']);
  writeFileSync(path.join(source, 'story.txt'), 'frozen\n');
  git(source, ['add', 'story.txt']);
  git(source, ['commit', '-qm', 'Frozen history']);
  const sources = path.join(root, 'sources.json');
  writeFileSync(sources, JSON.stringify([{ issue: 1490, path: source, ref: 'HEAD' }]));
  return { root, source, output, sources };
}
function cli(args, expected = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  assert.equal(result.status, expected, result.stderr);
  return result;
}

test('capture, run, inspect and dispose preserve a retained ineligible report', () => {
  const f = fixture();
  const capture = JSON.parse(
    cli(['capture', '--sources-file', f.sources, '--output-root', f.output]).stdout
  );
  assert.equal(capture.sources[0].issue, 1490);
  assert.match(capture.sources[0].commitOid, /^[a-f0-9]{40,64}$/);
  assert.ok(existsSync(capture.sources[0].objectStore));

  const run = JSON.parse(
    cli(['run', '--manifest', capture.manifestPath, '--tool-root', ROOT, '--provider', 'recorded'])
      .stdout
  );
  assert.equal(run.productionEvidenceEligible, false);
  assert.deepEqual(run.provenanceIssues, [1490]);
  assert.ok(run.matrix.every((entry) => entry.status === 'pass'));

  const inspected = JSON.parse(cli(['inspect', '--run-manifest', run.manifestPath]).stdout);
  assert.equal(inspected.status, 'verified');
  assert.equal(inspected.productionEvidenceEligible, false);

  const disposed = JSON.parse(
    cli(['dispose', '--run-manifest', run.manifestPath, '--confirm-run', run.runId]).stdout
  );
  assert.equal(disposed.status, 'disposed');
  assert.ok(existsSync(run.reportPath));
  assert.equal(JSON.parse(readFileSync(run.reportPath)).productionEvidenceEligible, false);
});

test('recorded-only execution and exact run confirmation fail closed', () => {
  const f = fixture();
  const capture = JSON.parse(
    cli(['capture', '--sources-file', f.sources, '--output-root', f.output]).stdout
  );
  assert.match(
    cli(['run', '--manifest', capture.manifestPath, '--tool-root', ROOT, '--provider', 'live'], 1)
      .stderr,
    /provider-recorded-required/
  );
});
