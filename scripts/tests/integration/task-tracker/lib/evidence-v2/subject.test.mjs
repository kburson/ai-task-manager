// @story #1497
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, chmodSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createSandbox } from '../../../../helpers/evidence-v2/sandbox.mjs';
import { buildEvidenceSubject } from '../../../../../task-tracker/lib/evidence-v2/subject.mjs';
import { projectRequirements } from '../../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';
const hash = 'sha256:' + 'a'.repeat(64);
function input(s) {
  return {
    repositoryId: {
      nodeId: `R_rehearsal_${s.context.runId}`,
      nameWithOwner: s.context.repositoryId,
    },
    sourceRoot: s.context.sourceRoot,
    requirements: {
      schema: 'aitm.requirements/v2',
      acceptanceCriteria: [{ id: 'ac:1', text: 'Preserve raw bytes', verificationIds: ['vc:1'] }],
      verificationCommands: [{ id: 'vc:1', argv: ['node', '--test'] }],
      target: { ref: 'trunk' },
      policy: { id: 'standard', version: '1' },
    },
    recipe: {
      schema: 'aitm.recipe/v2',
      commands: [{ executable: 'node', args: ['--test'], lane: 'unit' }],
      toolDigest: hash,
      runnerDigest: hash,
      lanes: ['unit'],
      policy: { id: 'standard', version: '1' },
      sensitivity: 'content-only',
      review: { id: 'review-1', actor: 'maintainer' },
    },
    environment: {
      schema: 'aitm.environment/v2',
      dependenciesDigest: hash,
      lockfileDigest: hash,
      node: process.versions.node,
      toolchain: 'node22+',
      platform: { os: process.platform, arch: process.arch },
      configDigests: {},
      variables: {},
      consumedFiles: [],
      externalInputs: [],
      complete: true,
    },
    ports: { env: s.env },
  };
}
test('complete content-only subject survives amend but changes on raw content and declared inputs', () => {
  const s = createSandbox();
  try {
    let args = input(s);
    const before = buildEvidenceSubject(args);
    s.git(['commit', '--amend', '-m', 'different message']);
    const after = buildEvidenceSubject(args);
    assert.equal(before.subject.subjectId, after.subject.subjectId);
    assert.notEqual(before.observations.sourceSha, after.observations.sourceSha);
    for (const [key, change] of [
      [
        'requirements',
        (v) => ({
          ...v,
          acceptanceCriteria: [{ ...v.acceptanceCriteria[0], text: 'Different promise' }],
        }),
      ],
      ['recipe', (v) => ({ ...v, runnerDigest: 'sha256:' + 'b'.repeat(64) })],
      ['environment', (v) => ({ ...v, node: '22.0.1' })],
    ]) {
      assert.notEqual(
        buildEvidenceSubject({ ...args, [key]: change(args[key]) }).subject.subjectId,
        after.subject.subjectId
      );
    }
    mkdirSync(path.join(s.context.sourceRoot, '.scratch'), { recursive: true });
    writeFileSync(path.join(s.context.sourceRoot, '.scratch/input'), 'raw input');
    args = { ...args, environment: { ...args.environment, consumedFiles: ['.scratch/input'] } };
    const ignored = buildEvidenceSubject(args);
    writeFileSync(path.join(s.context.sourceRoot, '.scratch/input'), 'changed input');
    assert.notEqual(ignored.subject.subjectId, buildEvidenceSubject(args).subject.subjectId);
    writeFileSync(path.join(s.context.sourceRoot, 'source.txt'), 'baseline \n');
    assert.throws(() => buildEvidenceSubject(args), /dirty-source/);
    s.git(['add', '.']);
    s.git(['commit', '-m', 'whitespace']);
    assert.notEqual(after.subject.subjectId, buildEvidenceSubject(args).subject.subjectId);
  } finally {
    s.dispose();
  }
});
test('manifest includes mode symlink deletion and refuses unresolved material and unsafe inputs', () => {
  const s = createSandbox();
  try {
    const args = input(s);
    const baseline = buildEvidenceSubject(args);
    chmodSync(path.join(s.context.sourceRoot, 'source.txt'), 0o755);
    s.git(['add', '.']);
    s.git(['commit', '-m', 'mode']);
    const mode = buildEvidenceSubject(args);
    assert.notEqual(mode.subject.subjectId, baseline.subject.subjectId);
    symlinkSync('source.txt', path.join(s.context.sourceRoot, 'link'));
    s.git(['add', '.']);
    s.git(['commit', '-m', 'link']);
    const link = buildEvidenceSubject(args);
    assert.notEqual(link.subject.subjectId, mode.subject.subjectId);
    unlinkSync(path.join(s.context.sourceRoot, 'link'));
    s.git(['add', '.']);
    s.git(['commit', '-m', 'remove link']);
    assert.equal(mode.subject.subjectId, buildEvidenceSubject(args).subject.subjectId);
    writeFileSync(
      path.join(s.context.sourceRoot, 'large'),
      'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64) + '\nsize 99\n'
    );
    s.git(['add', '.']);
    s.git(['commit', '-m', 'pointer']);
    assert.throws(() => buildEvidenceSubject(args), /unresolved-material/);
    assert.throws(
      () =>
        buildEvidenceSubject({
          ...args,
          environment: { ...args.environment, variables: { ACCESS_TOKEN: 'secret' } },
        }),
      /secret/
    );
  } finally {
    s.dispose();
  }
});
test('history-sensitive default captures commit metadata and refs; undeclared environment refuses', () => {
  const s = createSandbox();
  try {
    const args = input(s);
    delete args.recipe.sensitivity;
    delete args.recipe.review;
    const before = buildEvidenceSubject(args);
    s.git(['commit', '--amend', '-m', 'metadata matters']);
    assert.equal(before.subject.gitInputs.sensitivity, 'history-sensitive');
    assert.notEqual(before.subject.subjectId, buildEvidenceSubject(args).subject.subjectId);
    assert.throws(
      () =>
        buildEvidenceSubject({ ...args, environment: { ...args.environment, complete: false } }),
      /inputs-incomplete/
    );
  } finally {
    s.dispose();
  }
});
test('requirements normalizer excludes progress proof but retains executable declarations and mappings', () => {
  const initial =
    '## Acceptance Criteria\n\n- [ ] Preserve raw bytes <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n\n- [ ] `node --test` <!-- id=1 -->\n';
  const progressed = initial
    .replaceAll('[ ]', '[x]')
    .replace(
      'Preserve raw bytes',
      'Preserve raw bytes <!-- aitm-ac-evidence key="x" sha="abc" -->'
    );
  assert.deepEqual(
    projectRequirements({
      body: initial,
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    }),
    projectRequirements({
      body: progressed,
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    })
  );
  assert.notDeepEqual(
    projectRequirements({
      body: initial,
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    }),
    projectRequirements({
      body: initial.replace('--test', '--test different'),
      target: { ref: 'trunk' },
      policy: { id: 'p', version: '1' },
    })
  );
});

test('every requirement and verifier line participates in the canonical projection', () => {
  const body =
    '## Acceptance Criteria\n\n- [ ] First <!-- aitm-verified vc-list="vc:1" -->\n- [ ] Second <!-- aitm-verified vc-list="vc:2" -->\n\n## Verification Commands\n\n- [ ] `node first` <!-- id=1 -->\n- [ ] `node second` <!-- id=2 -->\n\n## Definition of Done\n';
  const p = projectRequirements({
    body,
    target: { ref: 'trunk' },
    policy: { id: 'p', version: '1' },
  });
  assert.equal(p.acceptanceCriteria.length, 2);
  assert.equal(p.verificationCommands.length, 2);
  assert.equal(p.verificationCommands[1].command, 'node second');
});
