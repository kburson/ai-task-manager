// @story #2145
// Offline proof fixtures; native admission is qualified by its separate test entrypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { retainedIntegrationFixture } from '../../../helpers/retained-integration-fixture.mjs';
import { verifyBridgeProof } from '../../../../maintenance/verify-bridge-proof.mjs';

function proofFixture(t) {
  const f = retainedIntegrationFixture(t);
  const root = path.join(f.parent, 'proof');
  mkdirSync(root);
  const retainedRef = 'refs/aitm/retained/fixture';
  f.git(f.parent, 'update-ref', retainedRef, f.parentHead, '0'.repeat(40));
  const tuple = {
    sessionId: 'fixture-native-session',
    root: f.parent,
    branch: 'codex/retained-parent',
    sourceHead: f.parentHead,
    issue: '#2145',
    bindingGenerationId: 'fixture-generation',
    state: 'develop',
    entryStartTs: '2026-11-08T03:28:36.297Z',
  };
  const binding = {
    schema: 'aitm.native-binding-proof/v1',
    bound: true,
    matches: true,
    healthy: true,
    cli: tuple,
    hook: { ...tuple },
    mismatches: [],
  };
  const manifest = {
    schema: 'aitm.bridge-proof/v1',
    issue: 2145,
    sessionId: tuple.sessionId,
    sourceHead: f.parentHead,
    originalHead: f.base,
    baselineHead: f.base,
    retention: { ref: retainedRef, sha: f.parentHead },
    artifacts: {},
  };
  const put = (name, value) => {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    writeFileSync(path.join(root, name), bytes);
    manifest.artifacts[name] = createHash('sha256').update(bytes).digest('hex');
  };
  put('native-binding.json', binding);
  put(
    'native-location-markers.txt',
    `<!-- aitm-worktree-location worktree="${f.parent}" branch="codex/retained-parent" sid="fixture-native-session" ts="2026-11-08T03:11:54.797Z" -->\n`
  );
  put('retained-ref-observation.txt', f.parentHead + ' ' + retainedRef + '\n');
  const blob = f.git(f.parent, 'rev-parse', f.parentHead + ':parent.txt');
  put('source-closure-observation.json', {
    schema: 'aitm.bridge-source-inspection/v1',
    source: f.parentHead,
    target: f.base,
    status: 'INCOMPLETE',
    files: [{ path: 'parent.txt', sourceBlob: blob, targetBlob: null }],
    reason: 'Fixture does not establish activation.',
  });
  const hash = createHash('sha256').update('preserved').digest('hex');
  put('protected-baseline.json', [{ path: 'original-evidence.md', sha256: hash }]);
  put('protected-observation.txt', hash + '  original-evidence.md\n');
  put('rehearsal-output.txt', 'ℹ tests 19\nℹ pass 19\nℹ fail 0\n');
  const save = () => writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  save();
  return {
    ...f,
    root,
    manifest,
    put,
    save,
    binding,
    run: () =>
      verifyBridgeProof({ manifestPath: path.join(root, 'manifest.json'), projectDir: f.parent }),
  };
}

test('bridge proof inspects real objects, retained refs, hashes and native identity', (t) => {
  const f = proofFixture(t);
  const result = f.run();
  assert.equal(result.nativeAdmission, 'OBSERVED');
  assert.equal(result.sourceClosure, 'INCOMPLETE');
  assert.equal(result.protectedArtifacts, 1);
  assert.equal(result.rehearsal, 'PASSED');
});
for (const problem of [
  'missing artifact',
  'changed artifact',
  'foreign session',
  'wrong source',
  'ambiguous native location',
  'lost retained ref',
  'changed source object',
  'false activation',
])
  test(`bridge proof refuses ${problem}`, (t) => {
    const f = proofFixture(t);
    if (problem === 'missing artifact') unlinkSync(path.join(f.root, 'native-binding.json'));
    if (problem === 'changed artifact')
      writeFileSync(path.join(f.root, 'native-binding.json'), '{}');
    if (problem === 'foreign session') {
      f.binding.hook.sessionId = 'foreign';
      f.put('native-binding.json', f.binding);
    }
    if (problem === 'wrong source') {
      f.binding.cli.sourceHead = f.base;
      f.put('native-binding.json', f.binding);
    }
    if (problem === 'ambiguous native location')
      f.put(
        'native-location-markers.txt',
        readFileSync(path.join(f.root, 'native-location-markers.txt'), 'utf8') +
          `<!-- aitm-worktree-location worktree="${f.child}" branch="other" sid="fixture-native-session" ts="2026-11-08T03:11:54.797Z" -->\n`
      );
    if (problem === 'lost retained ref')
      f.git(f.parent, 'update-ref', '-d', f.manifest.retention.ref);
    if (problem === 'changed source object') {
      const x = JSON.parse(readFileSync(path.join(f.root, 'source-closure-observation.json')));
      x.files[0].sourceBlob = 'a'.repeat(40);
      f.put('source-closure-observation.json', x);
    }
    if (problem === 'false activation') {
      const x = JSON.parse(readFileSync(path.join(f.root, 'source-closure-observation.json')));
      x.status = 'PASSED';
      f.put('source-closure-observation.json', x);
    }
    f.save();
    assert.throws(f.run);
  });
