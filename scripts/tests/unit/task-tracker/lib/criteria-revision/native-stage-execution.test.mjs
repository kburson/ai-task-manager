// @story #1855
// Closed stage leaf data; coherent fixture JSON is not execution authority.
import test from 'node:test';
import assert from 'node:assert/strict';
const stage = await import('../../../../../task-tracker/lib/criteria-revision/stage-execution.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const original = '<!-- aitm-last-known-state state="develop" ts="2026-10-06T09:00:00.000Z" -->\n## Scope\nKeep this text.\n\n<!-- aitm-body-version version="4" -->\n';
const after = '<!-- aitm-last-known-state state="test" ts="2026-10-06T10:00:00.010Z" -->\n## Scope\nKeep this text.\n\n## AITM Progress Markers\n\n<!-- aitm-entered-test ts="2026-10-06T10:00:00.000Z" move="move-124-test" -->\n\n<!-- aitm-body-version version="5" -->\n';
function fixture() {
  const previous = 'sha256:' + '1'.repeat(64);
  return { repository: 'o/r', issue: 124, transitionId: 'move-124-test', body: original,
    ordinal: 10, previous,
    step: { ordinal: 10, previous, kind: 'entry-body', intent: {
      entryTs: '2026-10-06T10:00:00.000Z', stateTs: '2026-10-06T10:00:00.010Z', visit: 1 },
      readback: { request: { file: 'gh', args: ['issue', 'view', '124', '-R', 'o/r', '--json', 'body', '-q', '.body'] },
        response: { stdout: after, stderr: '', exitCode: 0 },
        resource: { request: { file: 'gh', args: ['issue', 'view', '124', '-R', 'o/r', '--json', 'body'] },
          response: { stdout: JSON.stringify({ body: after }), stderr: '', exitCode: 0 } } } } };
}

test('native stage body step derives exact fixed effect and original subject readback without admitting execution', () => {
  const input = fixture(), copy = structuredClone(input);
  const result = stage.reconstructNativeStageBodyStep(input);
  assert.equal(result.afterBody, after);
  assert.equal(result.readbackBody, after);
  assert.match(result.stepHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(result).sort(), ['afterBody', 'readbackBody', 'stepHash']);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(input, copy);
  input.step.readback = null;
  const pending = stage.reconstructNativeStageBodyStep(input);
  assert.equal(pending.afterBody, after);
  assert.equal(pending.readbackBody, null, 'sealed intent alone does not establish readback');
  assert.notEqual(pending.stepHash, result.stepHash);
});

for (const [name, change] of [
  ['ordinal', x => { x.step.ordinal++; }],
  ['predecessor', x => { x.step.previous = 'sha256:' + '2'.repeat(64); }],
  ['kind', x => { x.step.kind = 'arbitrary-body'; }],
  ['intent bytes', x => { x.step.intent.afterBody = 'forged'; }],
  ['visit', x => { x.step.intent.visit = 2; }],
  ['foreign issue', x => { x.step.readback.request.args[2] = '125'; }],
  ['foreign repository', x => { x.step.readback.request.args[4] = 'foreign/repo'; }],
  ['failed read', x => { x.step.readback.response.exitCode = 1; }],
  ['partial read', x => { x.step.readback.response.stderr = 'partial'; }],
  ['unrelated body', x => { x.step.readback.response.stdout = after.replace('Keep this text.', 'Changed scope.'); }],
  ['forged version', x => { x.step.readback.response.stdout = after.replace('version="5"', 'version="6"'); }],
  ['success scalar', x => { x.step.readback.ok = true; }],
  ['caller callback', x => { x.read = () => after; }],
]) test('native stage body step refuses ' + name + ' drift', () => {
  const input = fixture(); change(input);
  assert.throws(() => stage.reconstructNativeStageBodyStep(input), /criteria-revision:native-stage-body-step/);
});

import { versionedWriteBody } from '../../../../../task-tracker/lib/versioned-issue-write.mjs';
import { writeMoveCompleteMarker } from '../../../../../task-tracker/lib/move-state/sentinel.mjs';

test('native stage body readback retains CLI suffix while matching actual native write verification', async () => {
  let remote = original;
  let pushed = null;
  const ts = '2026-10-06T10:01:00.000Z';
  const actual = await versionedWriteBody({ repo: 'o/r', issueNumber: 124,
    mutate: base => writeMoveCompleteMarker(base, 'test', ts, 'move-124-test'),
    deps: { fetchBody: async () => remote + '\n', pushBody: async (_repo, _issue, body) => { remote = body; pushed = body; } } });
  assert.equal(actual.status, 'ok');
  assert.equal(actual.body, pushed + '\n');
  const input = fixture();
  input.step.kind = 'sentinel-body'; input.step.intent = { ts };
  input.step.readback.response.stdout = actual.body;
  input.step.readback.resource.response.stdout = JSON.stringify({ body: pushed });
  const reconstructed = stage.reconstructNativeStageBodyStep(input);
  assert.equal(reconstructed.afterBody, pushed);
  assert.equal(reconstructed.readbackBody, pushed);
});

for (const [name, change] of [
  ['missing resource', x => { delete x.step.readback.resource; }],
  ['resource foreign issue', x => { x.step.readback.resource.request.args[2] = '125'; }],
  ['resource failed read', x => { x.step.readback.resource.response.exitCode = 1; }],
  ['resource partial read', x => { x.step.readback.resource.response.stderr = 'partial'; }],
  ['malformed resource', x => { x.step.readback.resource.response.stdout = '{'; }],
  ['resource extra key', x => { x.step.readback.resource.response.stdout = JSON.stringify({ body: after, ok: true }); }],
  ['resource trailing byte drift', x => { x.step.readback.resource.response.stdout = JSON.stringify({ body: after + '\n' }); }],
  ['coherent raw resource delta', x => {
    const changed = after.replace('Keep this text.', 'Changed scope.');
    x.step.readback.response.stdout = changed + '\n';
    x.step.readback.resource.response.stdout = JSON.stringify({ body: changed });
  }],
]) test('native stage body readback refuses ' + name, () => {
  const input = fixture(); change(input);
  assert.throws(() => stage.reconstructNativeStageBodyStep(input), /criteria-revision:native-stage-body-step/);
});


import { writeTransitionCommit, renderTransitionCommitComment } from '../../../../../task-tracker/lib/move-state/transition-commit.mjs';
import { fingerprint } from '../../../../../task-tracker/lib/resident-action-ledger-codec.mjs';
async function transitionFixture() {
  const visitMarker = '<!-- aitm-entered-test ts="2026-10-06T10:00:00.000Z" move="move-124-test" -->';
  const sentinelMarker = '<!-- aitm-move-complete state=test ts=2026-10-06T10:01:00.000Z move=move-124-test -->';
  const calls = [];
  let published;
  const result = await writeTransitionCommit({ cfg: { repo: 'o/r' }, issueArg: 124,
    transitionId: 'move-124-test', resolvedFromState: 'develop', stateArg: 'test', actor: 'native-actor',
    pexec: async (file, args) => {
      let response;
      if (args[2] === '--method') {
        published = args[5].slice(5);
        response = { id: 771, body: published, issue_url: 'https://api.github.com/repos/o/r/issues/124', node_id: 'IC_fixture' };
      } else response = { id: 771, body: published, issue_url: 'https://api.github.com/repos/o/r/issues/124', node_id: 'IC_fixture' };
      const raw = { stdout: JSON.stringify(response), stderr: '', exitCode: 0 };
      calls.push({ request: { file, args }, response: raw });
      return raw;
    } }, { visitMarker, sentinelMarker });
  assert.equal(result.record.actor, 'native-actor');
  assert.equal(result.record.sentinelFingerprint, fingerprint(sentinelMarker));
  assert.equal(result.commentId, '771');
  assert.equal(calls.length, 2);
  const previous = 'sha256:' + '1'.repeat(64);
  return { repository: 'o/r', issue: 124, transitionId: 'move-124-test', actor: 'native-actor',
    visitMarker, sentinelMarker, ordinal: 15, previous,
    step: { ordinal: 15, previous, kind: 'transition-comment', intent: { record: structuredClone(result.record) },
      readback: { create: calls[0], read: calls[1] } } };
}

test('native stage transition step reconstructs actual native publication requests and exact record readback', async () => {
  const input = await transitionFixture();
  const result = stage.reconstructNativeStageTransitionStep(input);
  assert.equal(result.commentId, '771');
  assert.equal(result.body, JSON.parse(input.step.readback.read.response.stdout).body);
  assert.match(result.stepHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(result).sort(), ['body', 'commentId', 'stepHash']);
  assert.ok(Object.isFrozen(result));
  input.step.readback = null;
  assert.equal(stage.reconstructNativeStageTransitionStep(input).commentId, null);
});

for (const [name, change] of [
  ['extra record key', x => { x.step.intent.record.savedReady = true; }],
  ['foreign actor', x => { x.step.intent.record.actor = 'other'; }],
  ['foreign sentinel', x => { x.sentinelMarker += 'changed'; }],
  ['foreign visit', x => { x.visitMarker += 'changed'; }],
  ['ordinal', x => { x.step.ordinal++; }],
  ['predecessor', x => { x.step.previous = 'sha256:' + '2'.repeat(64); }],
  ['foreign POST issue', x => { x.step.readback.create.request.args[1] = 'repos/o/r/issues/125/comments'; }],
  ['foreign read comment', x => { x.step.readback.read.request.args[1] = 'repos/o/r/issues/comments/772'; }],
  ['partial POST', x => { x.step.readback.create.response.stderr = 'partial'; }],
  ['failed read', x => { x.step.readback.read.response.exitCode = 1; }],
  ['foreign owner', x => { const v=JSON.parse(x.step.readback.read.response.stdout); v.issue_url='https://api.github.com/repos/o/r/issues/125'; x.step.readback.read.response.stdout=JSON.stringify(v); }],
  ['read id mismatch', x => { const v=JSON.parse(x.step.readback.read.response.stdout); v.id=772; x.step.readback.read.response.stdout=JSON.stringify(v); }],
  ['same id different record', x => { const v=JSON.parse(x.step.readback.read.response.stdout); v.body=renderTransitionCommitComment({...x.step.intent.record,actor:'other'}); x.step.readback.read.response.stdout=JSON.stringify(v); }],
  ['success scalar', x => { x.step.readback.verified = true; }],
]) test('native stage transition step refuses ' + name, async () => {
  const input = await transitionFixture(); change(input);
  assert.throws(() => stage.reconstructNativeStageTransitionStep(input), /criteria-revision:native-stage-transition-step/);
});


import { createRevisionMemory } from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
import { makeLegacyRevisionFixture } from '../../../../fixtures/criteria-revision.mjs';
function resourceFixture() {
  const { observation } = makeLegacyRevisionFixture();
  const comment = { id: 71, node_id: 'native-comment-71', body: 'Original retained record bytes.\n',
    issue_url: 'https://api.github.com/repos/example/criteria/issues/124', user: { login: 'original-author' },
    created_at: '2026-10-06T09:00:00Z', updated_at: '2026-10-06T09:00:00Z' };
  const item = { id: 'item-124', project: { id: 'project-1' },
    content: { number: 124, repository: { nameWithOwner: 'example/criteria' } },
    fieldValues: { nodes: [{ field: { id: 'status-field', name: 'Status' }, name: 'Develop', optionId: 'develop-option' },
      { field: { id: 'estimate-field', name: 'Estimate' }, number: 80 }], totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: null } } };
  return { observation, comments: [{ id: comment.node_id, body: comment.body }], hostMessages: [],
    nativeStageResources: { schema: 'aitm.native-stage-resources/v1',
      comments: [{ id: String(comment.id), nodeId: comment.node_id, bytes: JSON.stringify(comment, null, 2) }],
      membership: { projectId: 'project-1', itemId: 'item-124', bytes: JSON.stringify(item, null, 2) },
      local: { activeTask: { bytes: '{"original":"session"}\n' }, actorTiming: null, actorFlush: null,
        wordCursor: { bytes: 'original cursor bytes\n' }, trackerState: { bytes: '{}\n' }, queue: null } } };
}

test('native stage current resources retain independent complete fixture bytes without authority or effects', () => {
  const input = resourceFixture(), original = structuredClone(input);
  const backend = createRevisionMemory(input);
  assert.deepEqual(backend.snapshot.nativeStageResources, original.nativeStageResources);
  input.nativeStageResources.comments[0].bytes = '{}';
  const snapshot = backend.snapshot;
  snapshot.nativeStageResources.local.activeTask.bytes = 'changed detached copy';
  assert.deepEqual(backend.snapshot.nativeStageResources, original.nativeStageResources);
  const restored = createRevisionMemory(JSON.parse(JSON.stringify(backend.snapshot)));
  assert.deepEqual(restored.snapshot.nativeStageResources, original.nativeStageResources);
  assert.deepEqual(restored.observation, original.observation);
  assert.deepEqual(restored.effects, []);
  assert.equal(restored.admission?.state === 'allow', false, 'coherent constructor DATA does not publish allow');
});
for (const [name, change] of [
  ['unknown vector member', x => { x.nativeStageResources.ready = true; }],
  ['unknown local resource', x => { x.nativeStageResources.local.path = process.cwd(); }],
  ['local path selector', x => { x.nativeStageResources.local.activeTask.path = process.cwd(); }],
  ['missing local member', x => { delete x.nativeStageResources.local.queue; }],
  ['nonstring local bytes', x => { x.nativeStageResources.local.activeTask.bytes = {}; }],
  ['missing retained comment', x => { x.nativeStageResources.comments = []; }],
  ['duplicate comment', x => { x.nativeStageResources.comments.push(structuredClone(x.nativeStageResources.comments[0])); }],
  ['comment identity', x => { x.nativeStageResources.comments[0].nodeId = 'foreign'; }],
  ['comment bytes', x => { x.nativeStageResources.comments[0].bytes = '{'; }],
  ['foreign comment', x => { const c = JSON.parse(x.nativeStageResources.comments[0].bytes); c.issue_url += '5'; x.nativeStageResources.comments[0].bytes = JSON.stringify(c); }],
  ['retained body drift', x => { const c = JSON.parse(x.nativeStageResources.comments[0].bytes); c.body += 'changed'; x.nativeStageResources.comments[0].bytes = JSON.stringify(c); }],
  ['foreign item', x => { x.nativeStageResources.membership.itemId = 'other'; }],
  ['foreign project', x => { x.nativeStageResources.membership.projectId = 'other'; }],
  ['foreign content', x => { const m = JSON.parse(x.nativeStageResources.membership.bytes); m.content.number++; x.nativeStageResources.membership.bytes = JSON.stringify(m); }],
  ['partial fields', x => { const m = JSON.parse(x.nativeStageResources.membership.bytes); m.fieldValues.pageInfo.hasNextPage = true; x.nativeStageResources.membership.bytes = JSON.stringify(m); }],
  ['field census drift', x => { const m = JSON.parse(x.nativeStageResources.membership.bytes); m.fieldValues.totalCount++; x.nativeStageResources.membership.bytes = JSON.stringify(m); }],
  ['duplicate field', x => { const m = JSON.parse(x.nativeStageResources.membership.bytes); m.fieldValues.nodes[1].field.id = m.fieldValues.nodes[0].field.id; x.nativeStageResources.membership.bytes = JSON.stringify(m); }],
]) test('native stage current resources refuse ' + name, () => {
  const input = resourceFixture(); change(input);
  assert.throws(() => createRevisionMemory(input), /criteria-revision:native-stage-resources/);
});

import { rawLifecycleSources } from '../../../../helpers/native-lifecycle-sources.mjs';
import * as stageStore from '../../../../../task-tracker/lib/criteria-revision/store.mjs';
test('historical lifecycle source shape shares native validation without a backend or readiness', () => {
  const { observation } = makeLegacyRevisionFixture();
  const input = { observation, source: rawLifecycleSources(observation) };
  const original = structuredClone(input);
  assert.equal(stageStore.assertNativeLifecycleSourceData(input), undefined);
  assert.deepEqual(input, original);
  for (const change of [
    value => { value.approved = true; },
    value => { value.source.remote.dependencies[0].request.issueNumber++; },
    value => { value.source.remote.parent[0].response.repository.issue.ready = true; },
    value => { value.source.bodyHash = 'sha256:' + '0'.repeat(64); },
    value => { value.observation.issue++; },
    value => { value.source.remote.comments.commit[0].response.push({ body: 'x', ready: true }); },
    value => { value.source.remote.children.pages[0].response.repository.issue.subIssues.pageInfo.hasNextPage = 'false'; },
  ]) {
    const bad = structuredClone(input); change(bad);
    assert.throws(() => stageStore.assertNativeLifecycleSourceData(bad), /criteria-revision:/);
  }
});

test('recorded CodeComplete Git data uses native file and dirty parsers with exact leaf membership', async () => {
  const code = await import('../../../../../task-tracker/lib/code-complete-gate.mjs');
  const projectDir = process.cwd(), sha = 'a'.repeat(40);
  const input = { projectDir, shas: [sha], reads: [
    { kind: 'root', cwd: projectDir, stdout: projectDir + '\n', stderr: '', exitCode: 0 },
    { kind: 'files', cwd: projectDir, sha, stdout: ' first.mjs \nsecond.mjs\n\n', stderr: '', exitCode: 0 },
    { kind: 'dirty', cwd: projectDir, stdout: ' M first.mjs\n?? untracked.mjs\n A third.mjs\n', stderr: '', exitCode: 0 },
  ] };
  assert.deepEqual(code.deriveRecordedCodeCompleteGit(input), { touchedFiles: ['first.mjs', 'second.mjs'], dirtyFiles: ['first.mjs', 'third.mjs'] });
  for (const change of [
    value => { value.reads.pop(); },
    value => { value.reads[1].exitCode = 1; },
    value => { value.reads[0].stdout = 'foreign\n'; },
    value => { value.reads[1].sha = 'b'.repeat(40); },
    value => { value.reads.push(structuredClone(value.reads[2])); },
    value => { value.reads[2].stderr = 'partial'; },
    value => { value.reads[2].ready = true; },
  ]) { const bad = structuredClone(input); change(bad); assert.throws(() => code.deriveRecordedCodeCompleteGit(bad), /code-complete-data/); }
});


test('recorded transition actor follows native environment fallback without authorizing caller override', async () => {
  const { deriveRecordedTransitionActor } = await import('../../../../../task-tracker/lib/move-state/transition-commit.mjs');
  for (const [input, expected] of [
    [{ githubActor: 'github-owner', user: 'local-user' }, 'github-owner'],
    [{ githubActor: '', user: 'local-user' }, 'local-user'],
    [{ githubActor: null, user: 'local-user' }, 'local-user'],
    [{ githubActor: '', user: '' }, 'aitm'],
    [{ githubActor: null, user: null }, 'aitm'],
  ]) assert.equal(deriveRecordedTransitionActor(input), expected);
  for (const input of [{ githubActor: null, user: null, actor: 'caller' }, { githubActor: 1, user: null }, { user: null }])
    assert.throws(() => deriveRecordedTransitionActor(input), error => error.message.includes('recorded-transition-actor'));
});

function sourceItemFixture() {
  return { config: { projectId: 'PVT_native', kanbanFieldId: 'FIELD_status', kanbanOptionDevelop: 'OPTION_develop' },
    item: { id: 'PVTI_subject', fieldValues: { nodes: [{ field: { id: 'FIELD_status' }, name: 'Develop', optionId: 'OPTION_develop' }] } },
    assignmentReads: { reads: [{ kind: 'page', response: { repository: { issue: { projectItems: { nodes: [
      { id: 'PVTI_subject', project: { id: 'PVT_native' }, fieldValueByName: { name: 'Develop' } }
    ] } } } } }] } };
}

test('native stage source item binds actual status option and unique assignment membership', () => {
  assert.equal(stage.assertNativeStageSourceItem(sourceItemFixture()), undefined);
  for (const [name, change] of [
    ['coherent wrong option', x => { x.item.fieldValues.nodes[0].optionId = 'OPTION_other'; }],
    ['wrong item', x => { x.item.id = 'PVTI_other'; }],
    ['wrong assignment item', x => { x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes[0].id = 'PVTI_other'; }],
    ['wrong assignment state', x => { x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes[0].fieldValueByName.name = 'Test'; }],
    ['duplicate status', x => { x.item.fieldValues.nodes.push(structuredClone(x.item.fieldValues.nodes[0])); }],
    ['duplicate membership', x => { const n = x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes; n.push(structuredClone(n[0])); }],
    ['missing status', x => { x.item.fieldValues.nodes = []; }],
    ['foreign project', x => { x.assignmentReads.reads[0].response.repository.issue.projectItems.nodes[0].project.id = 'PVT_other'; }],
  ]) { const input = sourceItemFixture(); change(input); assert.throws(() => stage.assertNativeStageSourceItem(input), /native-stage-source-item/, name); }
});

test('native stage persistence rejects caller token and closed-input authority additions before writes', async () => {
  const backend = createRevisionMemory(resourceFixture()), original = backend.snapshot;
  const context = { repository: backend.observation.repository, issue: backend.observation.issue,
    executor: backend.observation.executor };
  await stageStore.withMemoryInterlock(backend, context, async capability => {
    await assert.rejects(stageStore.persistMemoryNativeStage({ backend, capability, context, token: {} }), /revision-authority-unavailable/);
    for (const extra of [{ header: {} }, { journal: {} }, { ready: true }, { observe: () => ({ ready: true }) }])
      await assert.rejects(stageStore.persistMemoryNativeStage({ backend, capability, context, token: {}, ...extra }), /native-stage-input/);
  });
  assert.deepEqual(backend.snapshot, original);
  assert.ok(backend.effects.every(effect => !effect.endsWith('-write')));
});
