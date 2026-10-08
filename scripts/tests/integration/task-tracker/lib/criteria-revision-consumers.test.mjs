// @story #1855
// This direct native integration fixture owns its test-process actor.
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
// cspell:words unadmitted
import { writeFileSync } from 'node:fs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { logicalRecordFixture } from '../../../helpers/evidence-v2/logical-records.mjs';
import { approvedFixture, fixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import { projectRequirements } from '../../../../task-tracker/lib/evidence-v2/subject-inputs.mjs';
import { buildEvidenceSubject } from '../../../../task-tracker/lib/evidence-v2/subject.mjs';

test('actual filesystem subject capture carries revision authority through identity hashing', async () => {
  const s = createSandbox();
  try {
    const { backend, context } = await approvedFixture({ unstampedIndependent: true });
    const f = logicalRecordFixture();
    const args = {
      ...f.input,
      repositoryId: { ...f.repositoryId, nameWithOwner: context.repository },
      sourceRoot: s.context.sourceRoot,
      ports: { env: s.env },
    };
    const ordinary = projectRequirements({
      body: backend.observation.body.bytes,
      target: f.target,
      policy: f.input.requirements.policy,
    });
    const baseline = buildEvidenceSubject({ ...args, requirements: ordinary });
    await withRevisionConsumer({ ...context, backend, activity: 'body-write' }, () => {
      const requirements = projectRequirements({
        body: backend.observation.body.bytes,
        target: f.target,
        policy: f.input.requirements.policy,
      });
      const current = buildEvidenceSubject({ ...args, requirements });
      assert.deepEqual(current.subject.revisionBinding, requirements.revisionBinding);
      assert.notEqual(current.subject.requirementsDigest, baseline.subject.requirementsDigest);
      assert.notEqual(current.subject.subjectId, baseline.subject.subjectId);
      assert.throws(
        () => buildEvidenceSubject({ ...args, repositoryId: f.repositoryId, requirements }),
        /revision.*identity/
      );
      const stripped = structuredClone(requirements);
      delete stripped.revisionBinding;
      assert.throws(() => buildEvidenceSubject({ ...args, requirements: stripped }), /revision/);
    });
  } finally {
    s.dispose();
  }
});
import path from 'node:path';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { currentSessionId } from '../../../../task-tracker/word-counter.mjs';
import { verbAcStamp } from '../../../../task-tracker/verbs/ac-stamp.mjs';
import { parseEvidenceAcs } from '../../../../task-tracker/lib/ac-evidence.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual AC stamp ${state} refuses before verifier execution and transport writes`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture(state);
      if (state === 'malformed')
        backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
      let body = backend.observation.body.bytes;
      const effects = [];
      const pexec = async (bin, args, opts = {}) => {
        if (bin === 'gh' && args[1] === 'view') return { stdout: body };
        if (bin === 'git' && args[0] === 'rev-parse') return { stdout: 'a'.repeat(40) };
        if (bin === 'git' && args[0] === 'status') return { stdout: '' };
        if (bin === 'node') {
          effects.push(['verifier', args]);
          return { stdout: '' };
        }
        if (bin === 'gh' && args[1] === 'edit') {
          effects.push(['push']);
          body = opts.input;
          return { stdout: '' };
        }
        throw new Error(`unexpected transport ${bin} ${args.join(' ')}`);
      };
      let refusal;
      try {
        await verbAcStamp({
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
          rest: [parseEvidenceAcs(body)[0].label],
          pexec,
          deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
        });
      } catch (error) {
        refusal = error;
      }
      assert.deepEqual(effects, []);
      assert.equal(
        refusal?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    } finally {
      s.dispose();
    }
  });
}
import { verbDodStamp } from '../../../../task-tracker/verbs/dod-stamp.mjs';

for (const state of ['pending', 'stale', 'unavailable', 'malformed']) {
  test(`actual DoD stamp ${state} refuses before verifier execution and transport writes`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture(state, { functionalKeys: true });
      if (state === 'malformed')
        backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
      let body = backend.observation.body.bytes;
      const effects = [];
      const pexec = async (bin, args, opts = {}) => {
        if (bin === 'gh' && args[1] === 'view') return { stdout: body };
        if (bin === 'git' && args[0] === 'rev-parse') return { stdout: 'a'.repeat(40) };
        if (bin === 'git' && args[0] === 'status') return { stdout: '' };
        if (bin === 'node') {
          effects.push(['verifier', args]);
          return { stdout: '' };
        }
        if (bin === 'gh' && args[1] === 'edit') {
          effects.push(['push']);
          body = opts.input;
          return { stdout: '' };
        }
        throw new Error(`unexpected transport ${bin} ${args.join(' ')}`);
      };
      let refusal;
      try {
        await verbDodStamp({
          cfg: { repo: context.repository },
          projectDir: s.context.sourceRoot,
          statePath: path.join(s.context.sourceRoot, '.ai-task-manager', 'task-tracker-state.json'),
          rest: ['tests'],
          pexec,
          deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
        });
      } catch (error) {
        refusal = error;
      }
      assert.deepEqual(effects, []);
      assert.equal(
        refusal?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    } finally {
      s.dispose();
    }
  });
}
import { parseBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { hashBytes } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';

for (const [name, adapter] of [
  ['AC', verbAcStamp],
  ['DoD', verbDodStamp],
]) {
  for (const state of name === 'DoD'
    ? ['baseline', 'approved', 'approved-citation', 'approved-orphan']
    : ['baseline', 'approved']) {
    test(`actual ${name} stamp ${state} ${state === 'approved-orphan' ? 'refuses an ungoverned VC amendment before push' : 'executes its verifier and leaves usable durable authority'}`, async () => {
      const s = createSandbox();
      try {
        writeFileSync(path.join(s.context.sourceRoot, 'package-lock.json'), '{}');
        const isApproved = state !== 'baseline';
        const { backend, context } = isApproved
          ? await approvedFixture({
              worktree: s.context.sourceRoot,
              branch: 'trunk',
              sharedDodCitation: state === 'approved-citation',
            })
          : await fixture('baseline', { functionalKeys: true });
        setActiveTask(currentSessionId(), { issue: `#${context.issue}` }, s.context.sourceRoot);
        let body = backend.observation.body.bytes;
        const effects = [];
        const pexec = async (bin, args, opts = {}) => {
          if (bin === 'gh' && args[1] === 'view') return { stdout: body };
          if (bin === 'git' && args[0] === 'rev-parse') return { stdout: 'a'.repeat(40) };
          if (bin === 'git' && args[0] === 'status') return { stdout: '' };
          if (bin === 'node') {
            effects.push(['verifier', args]);
            return { stdout: '' };
          }
          if (bin === 'gh' && args[1] === 'edit') {
            effects.push(['push']);
            body = opts.input;
            const next = backend.observation;
            next.body = { bytes: body, version: parseBodyVersion(body) };
            backend.replaceAuthority(next);
            if (isApproved)
              backend.replacePlanning({ ...backend.snapshot.planning, bodyHash: hashBytes(body) });
            return { stdout: '' };
          }
          throw new Error(`unexpected transport ${bin} ${args.join(' ')}`);
        };
        const invoke = () =>
          adapter({
            cfg: { repo: context.repository },
            projectDir: s.context.sourceRoot,
            statePath: path.join(
              s.context.sourceRoot,
              '.ai-task-manager',
              'task-tracker-state.json'
            ),
            rest:
              name === 'AC'
                ? [parseEvidenceAcs(body)[0].label]
                : [state === 'approved' ? 'lint' : 'tests'],
            pexec,
            deps: { revisionBackend: backend, getLiveState: async () => 'develop' },
          });
        if (state === 'approved-orphan') {
          await assert.rejects(invoke(), (error) => error.code === 'criteria-revision-required');
          assert.deepEqual(
            effects.map((x) => x[0]),
            ['verifier']
          );
          assert.equal((await observeRevision({ context, deps: backend })).status, 'applied');
          return;
        }
        await invoke();
        assert.deepEqual(
          effects.map((x) => x[0]),
          ['verifier', 'push']
        );
        const current = await observeRevision({ context, deps: backend });
        assert.equal(current.status, isApproved ? 'applied' : 'empty', JSON.stringify(current));
        if (isApproved) {
          const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
          assert.equal((await observeRevision({ context, deps: restored })).status, 'applied');
          assert.equal(restored.snapshot.nativeProofRecords.length, 1);
          assert.ok(backend.effects.indexOf('native-proof-journal-readback') >= 0);
        }
      } finally {
        s.dispose();
      }
    });
  }
}
