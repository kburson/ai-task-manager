// @story #1909
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import {
  initializeIssueDirectory,
  repairIssueDirectory,
} from '../../../../task-tracker/lib/github-records/singleton-initializer.mjs';
import {
  createIssueComment,
  updateIssueComment,
} from '../../../../task-tracker/lib/github-records/github-comment-store.mjs';
import {
  createAitmRecordEnvelope,
  createRecordId,
  renderAitmRecord,
  parseAitmRecord,
} from '../../../../task-tracker/lib/github-records/record-envelope.mjs';

function writerStore({ backend, context }) {
  let body = '';
  const records = new Map(),
    effects = [];
  const recordBody = renderAitmRecord({
    envelope: createAitmRecordEnvelope({
      recordId: createRecordId(),
      recordType: 'verification-evidence',
      repository: context.repository,
      issue: context.issue,
      payload: { result: 'original-writer-control' },
      actor: 'fixture-writer',
      epoch: 1,
      grantId: createRecordId(),
      createdAt: '2026-10-01T00:00:00.000Z',
    }),
    visibleMarkdown: 'Original writer control.\n',
  });
  function store(value, id = `IC_writer_${records.size + 1}`) {
    const parsed = parseAitmRecord({
      commentNodeId: id,
      body: value,
      expectedRepository: context.repository,
      expectedIssue: context.issue,
    });
    const record = { ...parsed, body: value };
    records.set(id, record);
    return record;
  }
  const graphql = async ({ query, variables }) => {
    if (query.includes('mutation AitmUpdateIssueComment')) {
      effects.push('comment-update');
      store(variables.body, variables.id);
      return { data: { updateIssueComment: { issueComment: { id: variables.id } } } };
    }
    return {
      data: {
        nodes: variables.ids.map((id) => ({
          __typename: 'IssueComment',
          id,
          body: records.get(id).body,
          updatedAt: '2026-10-01T00:00:00.000Z',
          issue: { number: context.issue, repository: { nameWithOwner: context.repository } },
        })),
      },
    };
  };
  const deps = {
    revisionBackend: backend,
    readIssueBody: async () => {
      effects.push('original-body-read');
      return body;
    },
    writeIssueBody: async ({ body: next }) => {
      effects.push('body-write');
      body = next;
    },
    listIssueComments: async () => {
      effects.push('original-comments-read');
      return [...records.values()];
    },
    createIssueComment: async ({ body: next }) => {
      effects.push('singleton-write');
      return store(next);
    },
  };
  const input = {
    repository: context.repository,
    issue: context.issue,
    issueNodeId: 'ISSUE_WRITER_CONTROL',
    actor: 'fixture-writer',
    deps,
  };
  return {
    effects,
    records,
    input,
    recordBody,
    store,
    invoke: {
      initializeIssueDirectory: () => initializeIssueDirectory(input),
      repairIssueDirectory: () => repairIssueDirectory(input),
      createIssueComment: () =>
        createIssueComment({
          ...input,
          body: recordBody,
          graphql,
          rest: {
            createIssueComment: async ({ body: next }) => {
              effects.push('comment-create');
              return { node_id: store(next).commentNodeId };
            },
          },
        }),
      updateIssueComment: () =>
        updateIssueComment({
          ...input,
          body: recordBody,
          graphql,
          commentNodeId: store(recordBody, 'IC_writer_existing').commentNodeId,
        }),
    },
  };
}

for (const name of [
  'initializeIssueDirectory',
  'repairIssueDirectory',
  'createIssueComment',
  'updateIssueComment',
]) {
  for (const state of ['pending', 'stale', 'malformed', 'unavailable']) {
    test(`independent ${name} ${state} refuses before original callback or transport selection`, async () => {
      const f = await fixture(state);
      if (state === 'malformed')
        f.backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      const s = writerStore(f);
      let error;
      try {
        await s.invoke[name]();
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(
        s.effects,
        [],
        'No original callback or transport runs without fresh admission'
      );
      assert.equal(
        error?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    });
  }
  for (const state of ['baseline', 'approved']) {
    test(`independent ${name} ${state} retains its complete original algorithm`, async () => {
      const f = state === 'approved' ? await approvedFixture() : await fixture(state);
      const s = writerStore(f);
      if (name === 'repairIssueDirectory') {
        await initializeIssueDirectory({ ...s.input, publishDirectory: false });
        s.effects.length = 0;
      }
      const result = await s.invoke[name]();
      assert.ok(result);
      if (name.includes('Directory')) {
        assert.equal(result.directory.issueNodeId, s.input.issueNodeId);
        assert.equal(s.effects.filter((x) => x === 'body-write').length, 1);
        assert.equal(
          s.effects.filter((x) => x === 'singleton-write').length,
          name === 'initializeIssueDirectory' ? 4 : 0
        );
      } else {
        assert.equal(result.body, s.recordBody);
        assert.equal(
          s.effects.filter(
            (x) => x === (name === 'createIssueComment' ? 'comment-create' : 'comment-update')
          ).length,
          1
        );
      }
    });
  }
}

import { repairIssueProjections } from '../../../../task-tracker/lib/github-records/projection-repair.mjs';
import {
  appendLifecycleTransition,
  validateTransitionAuthority,
} from '../../../../task-tracker/lib/github-records/lifecycle-transition.mjs';
import { resolveCoordinatorAuthority } from '../../../../task-tracker/lib/github-records/coordination-authority.mjs';
import {
  activeAuthority,
  coordinator,
  id,
  sealedContract,
  transitionPayload,
  projectionBody,
} from '../../../helpers/github-record-lifecycle-fixtures.mjs';

async function historicalProjection(context, { durable = true } = {}) {
  const oldGrant = activeAuthority().grant;
  const grant = {
    ...oldGrant,
    scope: { scopeRootIssue: context.issue, includedIssues: [], excludedIssues: [] },
  };
  const authority = resolveCoordinatorAuthority({
    issueHierarchy: [{ issue: context.issue, parentIssue: null }],
    grants: [grant],
    revocations: [],
    coordinationProjection: {
      schema: 'aitm.coordination-projection/v1',
      grantId: grant.grantId,
      epoch: grant.epoch,
      adoptionState: 'adopted',
    },
    now: '2026-08-05T11:00:00.000Z',
  });
  assert.equal(authority.status, 'active');
  const payload = transitionPayload({ issue: context.issue });
  const records = [],
    effects = [],
    projections = new Map(
      payload.projections.map((p) => [
        p.singletonCommentNodeId,
        {
          kind: p.kind,
          commentNodeId: p.singletonCommentNodeId,
          revision: p.expectedRevision,
          bodyHash: p.expectedBodyHash,
          body: projectionBody(p.kind, p.expectedRevision),
        },
      ])
    );
  const deps = {
    listIssueComments: async () => {
      effects.push('capsule-list');
      return [...records];
    },
    createIssueComment: async ({ body }) => {
      effects.push('capsule-create');
      const parsed = parseAitmRecord({
        commentNodeId: 'IC_transition_original',
        body,
        expectedRepository: context.repository,
        expectedIssue: context.issue,
      });
      const record = { ...parsed, body };
      records.push(record);
      return record;
    },
    readBackComment: async () => {
      effects.push('capsule-readback');
      return records[0];
    },
    readProjection: async ({ commentNodeId }) => {
      effects.push('projection-read');
      return structuredClone(projections.get(commentNodeId));
    },
    updateProjection: async ({ commentNodeId, expected, next }) => {
      assert.deepEqual(projections.get(commentNodeId), expected);
      effects.push('projection-write');
      projections.set(commentNodeId, structuredClone(next));
      return structuredClone(next);
    },
  };
  const input = {
    repository: context.repository,
    issue: context.issue,
    payload,
    authority,
    coordinator,
    contract: sealedContract(),
    records,
  };
  if (!durable)
    return {
      effects,
      input: { ...input, transitionAuthority: validateTransitionAuthority(input), deps },
    };
  // Use the original append/readback path to obtain an actual durable capability.
  // A hand-built object or serialized observation cannot replace this proof.
  const appended = await appendLifecycleTransition({
    repository: context.repository,
    issue: context.issue,
    transitionAuthority: validateTransitionAuthority(input),
    recordId: id(200),
    createdAt: '2026-08-05T11:00:00.000Z',
    deps,
  });
  effects.length = 0;
  return { effects, input: { ...input, transitionAuthority: appended.transitionAuthority, deps } };
}

for (const state of ['pending', 'stale', 'malformed', 'unavailable', 'baseline', 'approved']) {
  test(`durable projection repair ${state} retains custody and rereads revision admission`, async () => {
    const f = state === 'approved' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      f.backend.addComment({
        id: 'bad',
        body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
      });
    const p = await historicalProjection(f.context);
    const input = { ...p.input, deps: { ...p.input.deps, revisionBackend: f.backend } };
    if (['baseline', 'approved'].includes(state)) {
      const result = await repairIssueProjections(input);
      assert.deepEqual(result.repairedKinds, ['evidence-projection', 'timing']);
      assert.equal(p.effects.filter((x) => x === 'projection-write').length, 2);
      await assert.rejects(
        repairIssueProjections({ ...input, transitionAuthority: {} }),
        /lifecycle-transition:capability/
      );
    } else {
      let error;
      try {
        await repairIssueProjections(input);
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(
        p.effects,
        [],
        'Historical transition custody cannot admit current unapproved repair effects'
      );
      assert.equal(
        error?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    }
  });
}

for (const state of ['pending', 'stale', 'malformed', 'unavailable', 'baseline', 'approved']) {
  test(`independent lifecycle append ${state} cannot reuse historical custody as current readiness`, async () => {
    const f = state === 'approved' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      f.backend.addComment({
        id: 'bad',
        body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
      });
    const p = await historicalProjection(f.context);
    const input = { ...p.input, deps: { ...p.input.deps, revisionBackend: f.backend } };
    if (['baseline', 'approved'].includes(state)) {
      const result = await appendLifecycleTransition(input);
      assert.equal(result.replayed, true);
      assert.deepEqual(p.effects, ['capsule-list']);
      assert.throws(
        () => appendLifecycleTransition({ ...input, transitionAuthority: {} }),
        (error) => error.message === 'lifecycle-transition:capability'
      );
    } else {
      let error;
      try {
        await appendLifecycleTransition(input);
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(p.effects, [], 'No original replay/capsule callback before fresh admission');
      assert.equal(
        error?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    }
  });
}

import { convergeSingletonProjections } from '../../../../task-tracker/lib/github-records/singleton-projections.mjs';

for (const state of ['pending', 'stale', 'malformed', 'unavailable', 'baseline', 'approved']) {
  test(`independent singleton convergence ${state} requires fresh admission before reads and writes`, async () => {
    const f = state === 'approved' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      f.backend.addComment({
        id: 'bad',
        body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
      });
    const effects = [];
    let body = 'old';
    const input = {
      repository: f.context.repository,
      issue: f.context.issue,
      desired: [{ kind: 'timing', commentNodeId: 'IC_timing', body: 'new' }],
      deps: {
        revisionBackend: f.backend,
        readProjection: async ({ commentNodeId }) => {
          effects.push('read');
          return { commentNodeId, body };
        },
        updateProjection: async ({ body: next }) => {
          effects.push('write');
          body = next;
        },
      },
    };
    if (['baseline', 'approved'].includes(state)) {
      const result = await convergeSingletonProjections(input);
      assert.deepEqual(result, { updatedKinds: ['timing'], unchangedKinds: [] });
      assert.deepEqual(effects, ['read', 'write', 'read']);
    } else {
      let error;
      try {
        await convergeSingletonProjections(input);
      } catch (caught) {
        error = caught;
      }
      assert.deepEqual(effects, [], 'No projection callbacks before current admission');
      assert.equal(
        error?.code,
        state === 'pending'
          ? 'revision-pending'
          : state === 'stale'
            ? 'revision-approval-stale'
            : 'revision-authority-unavailable'
      );
    }
  });
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { discoverWriterRoots } from '../../../helpers/criteria-revision-writer-discovery.mjs';
import { versionedWriteBody } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';

for (const [name, adapter] of [
  ['versionedWriteBody', versionedWriteBody],
  ['mutateIssueBody', mutateIssueBody],
]) {
  test(`${name} malformed authority refuses before original body callbacks`, async () => {
    const f = await fixture('baseline');
    f.backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
    const effects = [];
    await assert.rejects(
      adapter({
        repo: f.context.repository,
        issueNumber: f.context.issue,
        mutate: (body) => {
          effects.push('transform');
          return body + '\nNote.\n';
        },
        deps: {
          revisionBackend: f.backend,
          fetchBody: async () => {
            effects.push('read');
            return f.backend.observation.body.bytes;
          },
          pushBody: async () => effects.push('write'),
        },
      }),
      (error) => error.code === 'revision-authority-unavailable'
    );
    assert.deepEqual(effects, []);
  });
}
for (const state of ['baseline', 'approved']) {
  test(`versionedWriteBody ${state} retains its real read-transform-write-readback algorithm`, async () => {
    const f = state === 'approved' ? await approvedFixture() : await fixture(state);
    const effects = [];
    let remote = f.backend.observation.body.bytes;
    const result = await versionedWriteBody({
      repo: f.context.repository,
      issueNumber: f.context.issue,
      mutate: (body) => {
        effects.push('transform');
        return body + '\nNote.\n';
      },
      deps: {
        revisionBackend: f.backend,
        fetchBody: async () => {
          effects.push('read');
          return remote;
        },
        pushBody: async (_repo, _issue, body) => {
          effects.push('write');
          remote = body;
        },
      },
    });
    assert.equal(result.status, 'ok');
    assert.deepEqual(effects, ['read', 'transform', 'write', 'read']);
  });
}

test('independent source call graph accounts for every public writer in actual complete cases', async (t) => {
  const root = fileURLToPath(new URL('../../../../..', import.meta.url));
  const covered = new Map([
    ['appendCapsule', 'policy'],
    ['executeContractWrite', 'policy'],
    ['writeDirectoryContractOperation', 'policy'],
    ['versionedWriteBody', 'policy-and-direct'],
    ['mutateIssueBody', 'policy-and-direct'],
    ['initializeIssueDirectory', 'direct'],
    ['repairIssueDirectory', 'direct'],
    ['createIssueComment', 'direct'],
    ['updateIssueComment', 'direct'],
    ['repairIssueProjections', 'direct'],
    ['appendLifecycleTransition', 'direct'],
    ['convergeSingletonProjections', 'direct'],
  ]);
  const roots = discoverWriterRoots(root);
  assert.deepEqual(roots.map((x) => x.name).sort(), [...covered.keys()].sort());
  t.diagnostic(JSON.stringify(roots));
  const files = [
    'scripts/tests/unit/task-tracker/lib/criteria-revision/policy.test.mjs',
    'scripts/tests/integration/task-tracker/lib/criteria-revision-interlock.test.mjs',
    'scripts/tests/integration/task-tracker/lib/criteria-revision-consumers-admission.test.mjs',
  ].map((file) => path.join(root, file));
  for (const file of files)
    assert.ok(fs.statSync(file).isFile(), `Missing complete verifier: ${file}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files],
      { cwd: root, env, encoding: 'utf8', timeout: 600_000 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    )
  );
  if (result.error) t.diagnostic(result.stdout + result.stderr);
  assert.ifError(result.error);
  const count = Number(result.stdout.match(new RegExp('^# tests (\\d+)\\s*$', 'm'))?.[1]);
  assert.ok(count >= 62, `Incomplete original coverage: ${count}`);
  for (const field of ['fail', 'cancelled', 'skipped'])
    assert.match(result.stdout, new RegExp(`^# ${field} 0\\s*$`, 'm'));
  t.diagnostic(`Complete original policy/interlock/admission cases: ${count}`);
});

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';

test('source discovery detects a new imported writer and excludes an uncalled transport factory', (t) => {
  const actual = fileURLToPath(new URL('../../../../..', import.meta.url));
  const root = mkdtempProjectIsolated('writer-discovery-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lib = path.join(root, 'scripts/task-tracker/lib');
  fs.mkdirSync(lib, { recursive: true });
  fs.cpSync(
    path.join(actual, 'scripts/task-tracker/lib/github-records'),
    path.join(lib, 'github-records'),
    { recursive: true }
  );
  for (const name of ['issue-body-mutate.mjs', 'versioned-issue-write.mjs'])
    fs.copyFileSync(path.join(actual, 'scripts/task-tracker/lib', name), path.join(lib, name));
  fs.writeFileSync(
    path.join(lib, 'github-records/discovered-route.mjs'),
    `
    import { mutateIssueBody as original } from '../issue-body-mutate.mjs';
    export function discoveredRoute(input) { return original(input); }
    export function unusedFactory(deps) { return { write: () => deps.writeIssueBody('unused') }; }
  `
  );
  const names = discoverWriterRoots(root).map((x) => x.name);
  assert.ok(names.includes('discoveredRoute'));
  assert.ok(!names.includes('unusedFactory'));
});

test('singleton convergence refuses missing or mismatched identity in an authenticated revision frame', async () => {
  const f = await fixture('baseline');
  const effects = [];
  const input = {
    desired: [{ kind: 'timing', commentNodeId: 'IC_timing', body: 'new' }],
    deps: {
      readProjection: async () => {
        effects.push('read');
        return { commentNodeId: 'IC_timing', body: 'old' };
      },
      updateProjection: async () => effects.push('write'),
    },
  };
  await withRevisionConsumer(
    { ...f.context, backend: f.backend, activity: 'capsule-write' },
    async () => {
      for (const identity of [
        {},
        { repository: 'foreign/repo', issue: f.context.issue },
        { repository: f.context.repository, issue: f.context.issue + 1 },
      ]) {
        await assert.rejects(
          convergeSingletonProjections({ ...input, ...identity }),
          (error) => error.code === 'revision-conflict'
        );
      }
    }
  );
  assert.deepEqual(effects, []);
});

test('unidentified ordinary convergence remains compatible and an enabled real fixture domain fails closed', async (t) => {
  const root = mkdtempProjectIsolated('writer-domain-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const module = fileURLToPath(
    new URL(
      '../../../../task-tracker/lib/github-records/singleton-projections.mjs',
      import.meta.url
    )
  );
  const domain = fileURLToPath(
    new URL('../../../../task-tracker/lib/criteria-revision/domain.mjs', import.meta.url)
  );
  const code = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import {execFileSync} from 'node:child_process';
    import {convergeSingletonProjections} from ${JSON.stringify(module)};
    import {registerRevisionDomain, revisionRuntime} from ${JSON.stringify(domain)};
    const git = (...args) => execFileSync('git', args, {cwd: ${JSON.stringify(root)}, stdio: 'pipe'}).toString().trim();
    git('init', '-q'); git('remote', 'add', 'origin', 'https://github.com/owner/repo.git');
    const effects = []; let body = 'old';
    const input = {projectDir: ${JSON.stringify(root)}, desired:[{kind:'timing',commentNodeId:'IC_timing',body:'new'}],deps:{
      readProjection: async ({commentNodeId})=>{effects.push('read');return {commentNodeId,body};},
      updateProjection: async ({body:next})=>{effects.push('write');body=next;}
    }};
    assert.deepEqual(await convergeSingletonProjections(input), {updatedKinds:['timing'],unchangedKinds:[]});
    assert.deepEqual(effects,['read','write','read']); effects.length=0;
    const actual=revisionRuntime({worktree:${JSON.stringify(root)}}).inspect(${JSON.stringify(root)});
    registerRevisionDomain({repository:actual.repository,commonDir:actual.commonDirectory,host:actual.hostId,quiescenceConfirmed:true},{worktree:${JSON.stringify(root)}});
    await assert.rejects(convergeSingletonProjections(input), error=>error.code==='revision-authority-unavailable');
    assert.deepEqual(effects,[]);
  `;
  const env = { ...process.env, HOME: path.join(root, 'home') };
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ['--input-type=module', '-e', code],
      { cwd: root, env, timeout: 600_000 },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    )
  );
  if (result.error) t.diagnostic(result.stdout + result.stderr);
  assert.ifError(result.error);
});

for (const state of ['pending', 'stale', 'malformed', 'unavailable', 'baseline', 'approved']) {
  test(`fresh lifecycle append ${state} qualifies its original nested capsule path`, async () => {
    const f = state === 'approved' ? await approvedFixture() : await fixture(state);
    if (state === 'malformed')
      f.backend.addComment({
        id: 'bad',
        body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
      });
    const p = await historicalProjection(f.context, { durable: false });
    const input = {
      ...p.input,
      recordId: id(200),
      createdAt: '2026-08-05T11:00:00.000Z',
      deps: { ...p.input.deps, revisionBackend: f.backend },
    };
    if (['baseline', 'approved'].includes(state)) {
      const result = await appendLifecycleTransition(input);
      assert.equal(result.replayed, false);
      assert.equal(result.record.envelope.recordType, 'lifecycle-transition');
      assert.equal(p.effects.filter((x) => x === 'capsule-create').length, 1);
      assert.ok(p.effects.includes('capsule-readback'));
      const retry = await appendLifecycleTransition(input);
      assert.equal(retry.replayed, true);
      assert.equal(p.effects.filter((x) => x === 'capsule-create').length, 1);
    } else {
      await assert.rejects(
        appendLifecycleTransition(input),
        (error) =>
          error.code ===
          (state === 'pending'
            ? 'revision-pending'
            : state === 'stale'
              ? 'revision-approval-stale'
              : 'revision-authority-unavailable')
      );
      assert.deepEqual(p.effects, []);
    }
  });
}
