// @story #2073 — scalar observations cannot turn unavailable evidence into null.
import test from 'node:test';
import assert from 'node:assert/strict';
const moduleUrl = new URL(
  '../../../../task-tracker/lib/decomposition-target-observation.mjs',
  import.meta.url
);
const complete = (nodes) => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
async function fixture(options = {}) {
  const module = await import(moduleUrl).catch((error) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(
    typeof module.createFieldEffectReaders,
    'function',
    'exact target reader API is required'
  );
  const subject = { repository: 'o/r', issue: 2073, projectId: 'P', projectItemId: 'ITEM' };
  const cfg = { repo: 'o/r', projectId: 'P', fieldIds: { estimate: 'E', size: 'S' } };
  const content = {
    __typename: 'Issue',
    id: 'I',
    number: 2073,
    repository: { nameWithOwner: 'o/r' },
  };
  const state = {
    body: '<!-- aitm-fields: {"schema":1,"values":{"estimate":2,"size":"S"}} -->',
    item: {
      __typename: 'ProjectV2Item',
      id: 'ITEM',
      project: { id: 'P' },
      content,
      fieldValues: complete([
        { id: 'VE', __typename: 'ProjectV2ItemFieldNumberValue', number: 2, field: { id: 'E' } },
        {
          id: 'VS',
          __typename: 'ProjectV2ItemFieldSingleSelectValue',
          name: 'S',
          optionId: 'OS',
          field: { id: 'S' },
        },
      ]),
    },
    project: {
      __typename: 'ProjectV2',
      id: 'P',
      fields: complete([
        { id: 'E', dataType: 'NUMBER', project: { id: 'P' } },
        {
          id: 'S',
          dataType: 'SINGLE_SELECT',
          project: { id: 'P' },
          options: [
            { id: 'OS', name: 'S' },
            { id: 'OM', name: 'M' },
          ],
        },
      ]),
    },
  };
  const calls = [];
  const graphql = async (request) => {
    calls.push(request);
    if (options.respond) return options.respond(request, state);
    if (request.query.includes('TargetBinding'))
      return { data: { repository: { issue: content }, node: structuredClone(state.item) } };
    if (request.query.includes('TargetBodyFields'))
      return { data: { node: { ...content, body: state.body } } };
    if (request.query.includes('TargetProjectDefinitions'))
      return { data: { node: structuredClone(state.project) } };
    return { data: { node: structuredClone(state.item), project: structuredClone(state.project) } };
  };
  const readers = await module.createFieldEffectReaders({ subject, cfg, graphql, ...options });
  return { readers, state, calls };
}
export function registerTargetObservationCases() {
  test('fresh reads preserve zero, explicit null and complete absent values', async () => {
    const f = await fixture();
    assert.deepEqual(await f.readers.readProjectValues(), { estimate: 2, size: 'S' });
    f.state.item.fieldValues.nodes[0].number = 0;
    assert.deepEqual(await f.readers.readProjectValues(), { estimate: 0, size: 'S' });
    f.state.item.fieldValues.nodes = [];
    assert.deepEqual(await f.readers.readProjectValues(), { estimate: null, size: null });
    assert.equal(f.calls.length, 4);
    assert.deepEqual(await f.readers.readBodyFields(), { estimate: 2, size: 'S' });
    f.state.body = '<!-- aitm-fields: {"schema":1,"values":{}} -->';
    assert.deepEqual(await f.readers.readBodyFields(), { estimate: null, size: null });
  });
  for (const [name, change] of [
    ['removed definition', (s) => s.project.fields.nodes.shift()],
    ['wrong definition type', (s) => (s.project.fields.nodes[0].dataType = 'TEXT')],
    ['foreign definition', (s) => (s.project.fields.nodes[0].project.id = 'FOREIGN')],
    ['duplicate definition', (s) => s.project.fields.nodes.push(s.project.fields.nodes[0])],
    ['duplicate value', (s) => s.item.fieldValues.nodes.push(s.item.fieldValues.nodes[0])],
    ['unknown size option', (s) => (s.item.fieldValues.nodes[1].optionId = 'UNKNOWN')],
    ['missing number', (s) => delete s.item.fieldValues.nodes[0].number],
    ['string number', (s) => (s.item.fieldValues.nodes[0].number = '2')],
    ['negative number', (s) => (s.item.fieldValues.nodes[0].number = -1)],
    ['foreign item', (s) => (s.item.id = 'OTHER')],
    ['foreign project', (s) => (s.item.project.id = 'OTHER')],
    ['foreign content', (s) => (s.item.content.id = 'OTHER')],
    ['draft content', (s) => (s.item.content.__typename = 'DraftIssue')],
    ['missing page info', (s) => delete s.item.fieldValues.pageInfo],
    ['missing option name', (s) => delete s.item.fieldValues.nodes[1].name],
    [
      'duplicate option',
      (s) => s.project.fields.nodes[1].options.push(s.project.fields.nodes[1].options[0]),
    ],
  ])
    test('project observation refuses ' + name, async () => {
      const f = await fixture();
      change(f.state);
      await assert.rejects(f.readers.readProjectValues());
    });
  for (const body of [
    '',
    '<!-- aitm-fields: broken -->',
    '<!-- aitm-fields: {"values":null} -->',
    '<!-- aitm-fields: {"values":[]} -->',
    '<!-- aitm-fields: {"values":{"estimate":"2"}} -->',
    '<!-- aitm-fields: {"values":{}} -->\n<!-- aitm-fields:',
    '<!-- aitm-fields: {"values":{}} -->\n<!-- aitm-fields: {"values":{}} -->',
    '<!-- aitm-fields: {"values":{}} -->\n<!-- ai-task-manager:fields:start -->',
  ])
    test('body observation refuses malformed or ambiguous block ' + body.slice(0, 30), async () => {
      const f = await fixture();
      f.state.body = body;
      await assert.rejects(f.readers.readBodyFields());
    });
  test('valid legacy block retains missing-key null and changing body is read afresh', async () => {
    const f = await fixture();
    f.state.body =
      '<!-- ai-task-manager:fields:start -->\n```json\n{"estimate":0}\n```\n<!-- ai-task-manager:fields:end -->';
    assert.deepEqual(await f.readers.readBodyFields(), { estimate: 0, size: null });
  });
  test('injected transport obeys deadline and response-byte bound', async () => {
    const f = await fixture({ limits: { timeoutMs: 15 } });
    // The binding succeeds; actual observations remain independently bounded.
    f.state.body = 'x'.repeat(500);
    const g = await fixture({ limits: { maxResponseBytes: 2048 } });
    g.state.body = 'x'.repeat(4096);
    await assert.rejects(g.readers.readBodyFields(), /response/);
    const module = await import(moduleUrl);
    await assert.rejects(
      module.createFieldEffectReaders({
        subject: { repository: 'o/r', issue: 2073, projectId: 'P', projectItemId: 'ITEM' },
        cfg: { repo: 'o/r', projectId: 'P', fieldIds: { estimate: 'E', size: 'S' } },
        graphql: () => new Promise(() => {}),
        limits: { timeoutMs: 10 },
      }),
      /deadline/
    );
    assert.equal(f.calls.length, 1);
  });

  function pagedResponse(request, state) {
    const content = state.item.content;
    if (request.query.includes('TargetBinding'))
      return { data: { repository: { issue: content }, node: structuredClone(state.item) } };
    const page = (nodes) => {
      const offset = request.variables.after ? Number(request.variables.after) : 0;
      return {
        nodes: structuredClone(nodes.slice(offset, offset + 100)),
        pageInfo: {
          hasNextPage: offset + 100 < nodes.length,
          endCursor: offset + 100 < nodes.length ? String(offset + 100) : null,
        },
      };
    };
    const item = {
      ...structuredClone(state.item),
      fieldValues: page(state.item.fieldValues.nodes),
    };
    const project = { ...structuredClone(state.project), fields: page(state.project.fields.nodes) };
    if (request.query.includes('TargetProjectDefinitions')) return { data: { node: project } };
    return { data: { node: item, project } };
  }
  test('two three-page connections complete in five dispatches after one binding', async () => {
    const f = await fixture({ respond: pagedResponse });
    for (let i = 0; i < 199; i++) {
      f.state.project.fields.nodes.push({ id: 'F' + i, dataType: 'TEXT', project: { id: 'P' } });
      f.state.item.fieldValues.nodes.push({
        id: 'V' + i,
        __typename: 'ProjectV2ItemFieldTextValue',
        field: { id: 'F' + i },
      });
    }
    assert.deepEqual(await f.readers.readProjectValues(), { estimate: 2, size: 'S' });
    assert.equal(f.calls.length, 6);
    assert.ok(f.calls.every((call) => call.timeout <= 30000 && call.maxResponseBytes === 4194304));
  });
  for (const mode of ['fourth-page', 'repeated-cursor', 'mixed-project-page', 'mixed-item-page'])
    test('bounded pagination refuses ' + mode, async () => {
      const f = await fixture({
        respond: (request, state) => {
          const response = pagedResponse(request, state);
          if (request.query.includes('TargetProjectValuePage')) {
            if (mode === 'repeated-cursor')
              response.data.node.fieldValues.pageInfo = { hasNextPage: true, endCursor: '100' };
            if (mode === 'mixed-item-page') response.data.node.content.id = 'foreign';
          }
          if (request.query.includes('TargetProjectDefinitions') && mode === 'mixed-project-page')
            response.data.node.id = 'foreign';
          return response;
        },
      });
      for (let i = 0; i < (mode === 'fourth-page' ? 301 : 201); i++) {
        f.state.project.fields.nodes.push({ id: 'F' + i, dataType: 'TEXT', project: { id: 'P' } });
        f.state.item.fieldValues.nodes.push({
          id: 'V' + i,
          __typename: 'ProjectV2ItemFieldTextValue',
          field: { id: 'F' + i },
        });
      }
      await assert.rejects(f.readers.readProjectValues());
      assert.ok(f.calls.length <= 6);
    });
  test('dangling legacy block prefix cannot hide beside a valid current block', async () => {
    const f = await fixture();
    f.state.body += '\n<!-- ai-task-manager:fields:';
    await assert.rejects(f.readers.readBodyFields());
  });
}
