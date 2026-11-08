#!/usr/bin/env node
// @story #2145
// Local proof recheck: archived observations are evidence, never live write authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strictIssueWorktreeLocations } from '../task-tracker/lib/issue-worktree-location.mjs';

export function verifyBridgeProof({
  manifestPath = 'docs/reviews/2145/evidence/manifest.json',
  projectDir = process.cwd(),
} = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'aitm.bridge-proof/v1');
  assert.equal(manifest.issue, 2145);
  const root = realpathSync(path.dirname(path.resolve(manifestPath)));
  const artifacts = new Map();
  for (const [name, digest] of Object.entries(manifest.artifacts)) {
    assert.equal(path.basename(name), name, 'flat evidence filename required');
    const file = realpathSync(path.join(root, name));
    assert.equal(path.dirname(file), root, 'evidence escaped archive');
    const bytes = readFileSync(file);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      digest,
      'artifact hash mismatch: ' + name
    );
    artifacts.set(name, bytes.toString('utf8'));
  }
  const read = (name) => {
    assert.ok(artifacts.has(name), 'required artifact missing: ' + name);
    return artifacts.get(name);
  };
  const json = (name) => JSON.parse(read(name));
  const git = (args) =>
    execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    }).trim();
  for (const sha of [
    manifest.sourceHead,
    manifest.originalHead,
    manifest.baselineHead,
    manifest.retention.sha,
  ]) {
    assert.match(sha, /^[a-f0-9]{40}$/);
    assert.equal(git(['cat-file', '-t', sha]), 'commit');
  }
  git(['merge-base', '--is-ancestor', manifest.originalHead, manifest.sourceHead]);
  git(['merge-base', '--is-ancestor', manifest.baselineHead, manifest.sourceHead]);
  assert.match(manifest.retention.ref, new RegExp('^refs/aitm/retained/'));
  assert.equal(
    git(['rev-parse', '--verify', manifest.retention.ref]),
    manifest.retention.sha,
    'retained ref moved or disappeared'
  );
  assert.equal(
    read('retained-ref-observation.txt').trim(),
    manifest.retention.sha + ' ' + manifest.retention.ref
  );
  const native = json('native-binding.json');
  assert.equal(native.schema, 'aitm.native-binding-proof/v1');
  assert.equal(native.bound, true);
  assert.equal(native.matches, true);
  assert.equal(native.healthy, true);
  assert.deepEqual(native.mismatches, []);
  assert.deepEqual(native.cli, native.hook, 'native hook and CLI disagree');
  assert.equal(native.cli.sessionId, manifest.sessionId);
  assert.notEqual(manifest.sessionId, 'default-session');
  assert.equal(native.cli.sourceHead, manifest.sourceHead);
  assert.equal(native.cli.issue, '#2145');
  assert.ok(native.cli.bindingGenerationId);
  const locations = strictIssueWorktreeLocations(read('native-location-markers.txt'));
  const current = locations.at(-1);
  assert.ok(current, 'native location missing');
  assert.equal(current.sessionId, manifest.sessionId);
  assert.equal(current.worktreePath, native.cli.root);
  assert.equal(current.worktreeBranch, native.cli.branch);
  const baseline = json('protected-baseline.json');
  assert.ok(Array.isArray(baseline) && baseline.length > 0);
  const observed = new Map(
    read('protected-observation.txt')
      .trim()
      .split('\n')
      .map((line) => {
        assert.match(line, /^[a-f0-9]{64} {2}.+/);
        return [line.slice(66), line.slice(0, 64)];
      })
  );
  assert.equal(observed.size, baseline.length, 'protected inventory differs');
  for (const file of baseline)
    assert.equal(observed.get(file.path), file.sha256, 'protected artifact changed: ' + file.path);
  const closure = json('source-closure-observation.json');
  assert.equal(closure.schema, 'aitm.bridge-source-inspection/v1');
  assert.equal(
    closure.status,
    'INCOMPLETE',
    'this support proof cannot establish #2071 activation'
  );
  assert.ok(closure.reason);
  assert.ok(Array.isArray(closure.files) && closure.files.length > 0);
  for (const row of closure.files) {
    assert.equal(
      git(['rev-parse', '--verify', closure.source + ':' + row.path]),
      row.sourceBlob,
      'source inventory changed'
    );
    let target = null;
    try {
      target = git(['rev-parse', '--verify', closure.target + ':' + row.path]);
    } catch {}
    assert.equal(target, row.targetBlob, 'target inventory changed');
  }
  const rehearsal = read('rehearsal-output.txt');
  assert.match(rehearsal, /ℹ tests [1-9][0-9]*/);
  assert.match(rehearsal, /ℹ fail 0(?:\n|$)/);
  assert.doesNotMatch(rehearsal, /ℹ (?:cancelled|todo) [1-9]/);
  return {
    nativeAdmission: 'OBSERVED',
    sourceClosure: 'INCOMPLETE',
    preservation: 'OBSERVED',
    protectedArtifacts: baseline.length,
    rehearsal: 'PASSED',
    scope:
      'retained observations and current Git objects/refs; not #2071 activation or whole-host runtime qualification',
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2)
      throw new Error('usage: node scripts/maintenance/verify-bridge-proof.mjs');
    console.log(JSON.stringify(verifyBridgeProof(), null, 2));
  } catch (error) {
    console.error('bridge-proof: ' + error.message);
    process.exitCode = 1;
  }
}
