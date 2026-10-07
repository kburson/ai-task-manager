// @story #1855
import { assert, nativeFinalFixture, path, rawLifecycleSources, readFileSync, test, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

test('native stage item reader consumes real membership field pagination and final identity without caller readers', async t => {
  const module = await import('../../../../gh/lib/wave-admission.mjs');
  const f = await nativeFinalFixture();
  try {
    writeFileSync(path.join(f.projectDir, '.ai-task-manager/task-tracker.json'), JSON.stringify({ repo: f.context.repository,
      projectId: 'PVT_stage', kanbanFieldId: 'status-field', kanbanOptionDevelop: 'OPTION_develop', kanbanOptionTest: 'OPTION_test' }));
    const [owner, repo] = f.context.repository.split('/');
    const content = { __typename: 'Issue', id: 'I_native_subject', number: f.context.issue, repository: { nameWithOwner: f.context.repository } };
    const status = { __typename: 'ProjectV2ItemFieldSingleSelectValue', id: 'value-status', name: 'Develop', optionId: 'OPTION_develop', field: { id: 'status-field', name: 'Status' } };
    const estimate = { __typename: 'ProjectV2ItemFieldNumberValue', id: 'value-estimate', number: 80, field: { id: 'estimate-field', name: 'Estimate' } };
    const item = { id: 'PVTI_stage', project: { id: 'PVT_stage' }, content,
      fieldValues: { nodes: [status], totalCount: 2, pageInfo: { hasNextPage: true, endCursor: 'fields-1' } } };
    const response = (nodes, next, cursor) => ({ repository: { nameWithOwner: f.context.repository,
      issue: { number: f.context.issue, projectItems: { nodes, totalCount: 2, pageInfo: { hasNextPage: next, endCursor: cursor } } } } });
    const source = {
      membership: [
        { request: { owner, repo, issue: f.context.issue, after: null }, response: response([
          { id: 'PVTI_other', project: { id: 'PVT_other' }, content,
            fieldValues: { nodes: [], totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } } }], true, 'members-1') },
        { request: { owner, repo, issue: f.context.issue, after: 'members-1' }, response: response([item], false, null) },
      ],
      fields: [{ request: { item: 'PVTI_stage', after: 'fields-1' }, response: { node: { id: 'PVTI_stage', project: { id: 'PVT_stage' }, content,
        fieldValues: { nodes: [estimate], totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null } } } } }],
      final: [{ request: { item: 'PVTI_stage' }, response: { node: { id: 'PVTI_stage', project: { id: 'PVT_stage' }, content,
        fieldValueByName: status } } }],
    };
    f.restart(snapshot => { snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      snapshot.lifecycleSources.remote.stageItem = source; });
    const before = f.backend.snapshot;
    const input = { repo: f.context.repository, issueNumber: f.context.issue, projectId: 'PVT_stage' };
    const invoke = value => withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
      backend: f.backend, activity: 'stage-write' }, () => module.readNativeStageProjectItem(value));
    const result = await invoke(input);
    assert.deepEqual(result, { ...item, fieldValues: { nodes: [status, estimate], totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null } } });
    assert.deepEqual(module.readNativeStageProjectItemData(result), source);
    const { canonicalRecordJson } = await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
    const recordedFile = path.join(f.projectDir, 'recorded-stage-item.json');
    writeFileSync(recordedFile, canonicalRecordJson({ observation: f.backend.observation,
      lifecycleSources: f.backend.snapshot.lifecycleSources, projectId: input.projectId, kanbanFieldId: 'status-field' }));
    const recordedInput = JSON.parse(readFileSync(recordedFile, 'utf8'));
    const recorded = await module.deriveRecordedStageProjectItem(recordedInput);
    assert.deepEqual(recorded, { ...item, fieldValues: { nodes: [status, estimate], totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null } } });
    assert.equal(module.readNativeStageProjectItemData(recorded), null);
    await assert.rejects(module.deriveRecordedStageProjectItem({ ...recordedInput, ready: true }));
    assert.equal(module.readNativeStageProjectItemData(structuredClone(result)), null);
    assert.ok(Object.isFrozen(result.fieldValues.nodes));
    assert.deepEqual(f.backend.snapshot, before); assert.deepEqual(f.effects, []);
    const unknown = structuredClone(recordedInput);
    unknown.lifecycleSources.remote.stageItem.membership[0].response.repository.issue.ready = true;
    await assert.rejects(module.deriveRecordedStageProjectItem(unknown));
    const legacy = structuredClone(recordedInput);
    const removeNodeIds = value => { if (!value || typeof value !== 'object') return;
      if (value.__typename === 'Issue') delete value.id;
      Object.values(value).forEach(removeNodeIds); };
    removeNodeIds(legacy.lifecycleSources.remote.stageItem);
    const legacyBefore = canonicalRecordJson(legacy);
    const legacyItem = await module.deriveRecordedStageProjectItem(legacy);
    assert.equal(Object.hasOwn(legacyItem.content, 'id'), false, 'old absent source stays historical data');
    assert.equal(canonicalRecordJson(legacy), legacyBefore, 'historical bytes are not backfilled');
    f.restart(snapshot => { snapshot.lifecycleSources.remote.stageItem = legacy.lifecycleSources.remote.stageItem; });
    await assert.rejects(invoke(input), error => error.code === 'revision-authority-unavailable',
      'old source cannot qualify the actual current reader');
    f.restart(snapshot => { snapshot.lifecycleSources.remote.stageItem = structuredClone(source); });
    let calls = 0;
    await assert.rejects(invoke({ ...input, gqlFn: () => { calls++; return {}; } }), error => error.code === 'revision-authority-unavailable');
    assert.equal(calls, 0);
    for (const [name, change, code = 'revision-authority-unavailable'] of [
      ['mixed missing membership node ID', x => { delete x.membership[0].response.repository.issue.projectItems.nodes[0].content.id; }],
      ['empty subject node ID', x => { x.membership[1].response.repository.issue.projectItems.nodes[0].content.id = ''; }],
      ['foreign field subject node ID', x => { x.fields[0].response.node.content.id = 'I_foreign'; }],
      ['mixed missing field subject node ID', x => { delete x.fields[0].response.node.content.id; }],
      ['foreign final subject node ID', x => { x.final[0].response.node.content.id = 'I_foreign'; }],
      ['mixed missing final subject node ID', x => { delete x.final[0].response.node.content.id; }],
      ['missing membership page', x => { x.membership.pop(); }],
      ['unused page', x => { x.membership.push({ ...structuredClone(x.membership[1]), request: { owner, repo, issue: f.context.issue, after: 'unused' } }); }],
      ['missing page boolean', x => { delete x.membership[1].response.repository.issue.projectItems.pageInfo.hasNextPage; }],
      ['changed membership total', x => { x.membership[1].response.repository.issue.projectItems.totalCount++; }],
      ['duplicate item identity', x => { x.membership[1].response.repository.issue.projectItems.nodes[0].id = 'PVTI_other'; }],
      ['foreign selected content', x => { x.membership[1].response.repository.issue.projectItems.nodes[0].content.number++; }],
      ['foreign field item', x => { x.fields[0].response.node.id = 'PVTI_other'; }],
      ['changed field total', x => { x.fields[0].response.node.fieldValues.totalCount++; }],
      ['duplicate field identity', x => { x.fields[0].response.node.fieldValues.nodes[0].field.id = 'status-field'; }],
      ['duplicate value identity', x => { x.fields[0].response.node.fieldValues.nodes[0].id = 'value-status'; }],
      ['missing field page', x => { x.fields = []; }],
      ['repeated field cursor', x => { x.fields[0].response.node.fieldValues.pageInfo = { hasNextPage: true, endCursor: 'fields-1' }; }],
      ['foreign final identity', x => { x.final[0].response.node.content.repository.nameWithOwner = 'foreign/repository'; }],
      ['changed final status', x => { x.final[0].response.node.fieldValueByName.optionId = 'OPTION_other'; }],
      ['unhandled native value', x => { x.fields[0].response.node.fieldValues.nodes[0] = { __typename: 'ProjectV2ItemFieldUserValue' }; }, 'revision-topology-unsupported'],
    ]) await t.test(name, async () => {
      const changed = JSON.parse(JSON.stringify(source)); change(changed);
      f.restart(snapshot => { snapshot.lifecycleSources.remote.stageItem = changed; });
      const untouched = f.backend.snapshot;
      await assert.rejects(invoke(input), error => error.code === code &&
        error.status === 'indeterminate');
      await assert.rejects(module.deriveRecordedStageProjectItem({ ...recordedInput,
        observation: f.backend.observation, lifecycleSources: f.backend.snapshot.lifecycleSources }),
        error => error.message.includes('criteria-revision:native-stage-item-data'));
      assert.deepEqual(f.backend.snapshot, untouched); assert.deepEqual(f.effects, []);
    });
  } finally { f.dispose(); }
});
