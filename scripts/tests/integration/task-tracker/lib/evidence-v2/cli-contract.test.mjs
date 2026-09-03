// @story #1500
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const CLI = path.join(ROOT, 'scripts/task-tracker/task-tracker.mjs');

function run(args, env) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TT_SKIP_NETWORK: '1', TT_SKIP_FIELD_SELF_CHECK: '1', ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

test('real dispatcher exposes write-free inspect, digest-bound enroll and guarded reopen', () => {
  const dir = path.join(projectScratchDir('test'), `evidence-cli-${randomUUID()}`);
  const toolRoot = path.join(dir, 'tool');
  const authorityRoot = path.join(dir, 'authority');
  mkdirSync(toolRoot, { recursive: true });
  mkdirSync(authorityRoot, { recursive: true });
  const repositoryId = { nodeId: 'R_fixture', nameWithOwner: 'fixture/repo' };
  const authorityHostId = randomUUID();
  const contextFile = path.join(dir, 'context.json');
  const fixtureFile = path.join(dir, 'fixture.json');
  writeFileSync(
    contextFile,
    JSON.stringify({
      schema: 'aitm.execution-context/v2',
      providerMode: 'recorded',
      repositoryId,
      issueNumber: 1500,
      toolRoot,
      sourceRoot: ROOT,
      authorityRoot,
      authorityHostId,
    })
  );
  writeFileSync(
    fixtureFile,
    JSON.stringify({
      issue: {
        number: 1500,
        repositoryId,
        state: 'CLOSED',
        stateReason: 'COMPLETED',
        body: '<!-- aitm-delivered-close data="legacy" -->',
        comments: [],
      },
      source: {
        sourceSha: 'a'.repeat(40),
        treeOid: 'b'.repeat(40),
        manifestDigest: 'sha256:' + '3'.repeat(64),
      },
      entries: ['approve', 'close', 'deliver', 'evidence', 'reopen', 'review', 'test', 'verify'],
      writes: [],
    })
  );
  const env = { AITM_EVIDENCE_CONTEXT: contextFile, AITM_EVIDENCE_RECORDED_FIXTURE: fixtureFile };
  try {
    const preview = run(['evidence', 'inspect', '1500', '--json'], env);
    assert.deepEqual(JSON.parse(readFileSync(fixtureFile, 'utf8')).writes, []);
    const enrolled = run(
      [
        'evidence',
        'enroll',
        '1500',
        '--plan-digest',
        preview.digest,
        '--operation-id',
        randomUUID(),
      ],
      env
    );
    assert.equal(enrolled.status, 'enrolled');
    const reopened = run(
      ['reopen', '1500', '--operation-id', randomUUID(), '--reason', 'new cycle'],
      env
    );
    assert.equal(reopened.status, 'reopened');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
