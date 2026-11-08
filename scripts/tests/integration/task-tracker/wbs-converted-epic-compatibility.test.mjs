// @story #2169 — actual collectors and native producers with disposable provider transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { firstChildFixture } from '../../fixtures/first-child-epic-provider.mjs';
import { collectHookDecompositionSnapshot } from '../../../task-tracker/lib/decomposition-hook-authority.mjs';

function hookConversionFixture(t) {
  const f = firstChildFixture(t, 'develop');
  f.content = '### Task 1: 🐞 [BUG] Retain WBS child\n\nRun: `node verify.mjs`\n';
  mkdirSync(path.join(f.root, 'docs'));
  writeFileSync(path.join(f.root, 'docs/plan.md'), f.content);
  f.node.body =
    f.node.body.replace(
      '## Scope',
      '## Plan Metadata\n- **Implementation-plan**: docs/plan.md\n- **Plan-commit**: ' +
        '1'.repeat(40) +
        '\n\n## Scope'
    ) + '\n<!-- aitm-issue-kind kind="epic" -->';
  f.node.projectItems.nodes[0].fieldValues.nodes.push(
    { id: 'PI_E', number: 4, field: { id: 'E', name: 'Estimate' } },
    { id: 'PI_S', name: 'M', field: { id: 'S', name: 'Size' } }
  );
  Object.assign(f.child, {
    repository: { nameWithOwner: 'o/r' },
    title: '🧑‍🧒‍🧒 [Epic] Retain WBS child',
    body:
      '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n- **Source-plan-section**: ### Task 1: 🐞 [BUG] Retain WBS child\n\n## AITM Progress Markers\n<!-- aitm-issue-kind kind="epic" -->',
    state: 'CLOSED',
    stateReason: 'COMPLETED',
  });
  f.child.projectItems.nodes[0].fieldValues.nodes[0].name = 'Done';
  f.child.projectItems.nodes[0].fieldValueByName.name = 'Done';
  f.deps.readPlanAtCommit = async () => f.content;
  f.collect = () =>
    collectHookDecompositionSnapshot({ issue: 42, cfg: f.cfg, projectDir: f.root, deps: f.deps });
  return f;
}
for (const space of ['', 'leading', 'trailing'])
  test('#2169 hook collector raw-title ' + (space || 'positive'), async (t) => {
    const f = hookConversionFixture(t);
    if (space === 'leading') f.child.title = ' ' + f.child.title;
    if (space === 'trailing') f.child.title += ' ';
    const result = await f.collect();
    assert.equal(
      result.current.input.epicReadiness.planning,
      !space,
      JSON.stringify(result.current.input)
    );
    assert.equal(f.queries.length, 3);
    assert.equal(f.writes.length, 0);
    assert.ok(f.queries.every((q) => !/mutation/.test(q)));
  });
for (const [name, mutate] of [
  ['missing child repo', (f) => delete f.child.repository],
  ['foreign child repo', (f) => (f.child.repository.nameWithOwner = 'foreign/r')],
  [
    'missing kind',
    (f) => (f.child.body = f.child.body.replace('<!-- aitm-issue-kind kind="epic" -->', '')),
  ],
  ['duplicate kind', (f) => (f.child.body += '\n<!-- aitm-issue-kind kind="epic" -->')],
  [
    'wrong source path',
    (f) => (f.child.body = f.child.body.replace('docs/plan.md', 'docs/other.md')),
  ],
])
  test('#2169 hook refuses ' + name, async (t) => {
    const f = hookConversionFixture(t);
    mutate(f);
    const result = await f.collect();
    assert.equal(result.current.input.epicReadiness.planning, false);
    assert.equal(f.writes.length, 0);
    assert.equal(f.queries.length, 3);
  });

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  installFirstChildCli,
  wbsCompatibilityCapture,
} from '../../fixtures/first-child-epic-provider.mjs';
import { PROJECT_ROOT_ALIASES } from '../../../task-tracker/lib/runtime-storage.mjs';
import { getActiveTask } from '../../../task-tracker/session-state.mjs';
import { fetchAllSubIssueNodes, mapSubIssueNodes } from '../../../gh/lib/wave-admission.mjs';
import { evaluateMaterializedWbsReadiness } from '../../../task-tracker/lib/decomposition-delivery-readiness.mjs';
import { classifyDecomposition } from '../../../task-tracker/lib/decomposition-policy.mjs';

const connection = (nodes) => ({
  nodes,
  totalCount: nodes.length,
  pageInfo: { hasNextPage: false, endCursor: null },
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function nativeActor(f, t) {
  const sid = f.inheritedEnv.CODEX_THREAD_ID ?? f.inheritedEnv.CODEX_SESSION_ID;
  if (!sid) {
    t.skip('requires inherited native provider actor; SKIP is not native qualification');
    return null;
  }
  return {
    sid,
    env: {
      AI_TASK_MANAGER_SESSION_ID: '',
      AI_TASK_MANAGER_APP_NAME: 'codex',
      ...Object.fromEntries(PROJECT_ROOT_ALIASES.map((key) => [key, ''])),
    },
  };
}
function addFields(node, hours = 4) {
  node.projectItems.nodes[0].fieldValues.nodes.push(
    {
      id: node.id + '-E',
      __typename: 'ProjectV2ItemFieldNumberValue',
      number: hours,
      field: { id: 'E', name: 'Estimate' },
    },
    {
      id: node.id + '-S',
      __typename: 'ProjectV2ItemFieldSingleSelectValue',
      name: 'M',
      field: { id: 'S', name: 'Size' },
    }
  );
}
function metadata(body, lines) {
  return body.replace('## Scope', '## Plan Metadata\n' + lines.join('\n') + '\n\n## Scope');
}
function fixtureNode(template, number, id, body, title, state = 'OPEN') {
  const node = structuredClone(template);
  Object.assign(node, {
    number,
    id,
    title,
    body,
    state,
    stateReason: state === 'CLOSED' ? 'COMPLETED' : null,
    childNumbers: [],
    comments: connection([]),
    blockedBy: connection([]),
    parent: null,
    url: 'https://example.invalid/' + node.repository.nameWithOwner + '/issues/' + number,
  });
  const item = node.projectItems.nodes[0];
  item.id = id + '_ITEM';
  item.content = {
    __typename: 'Issue',
    id,
    number,
    title,
    url: node.url,
    repository: node.repository,
  };
  for (const field of item.fieldValues.nodes) field.id = item.id + '_' + field.field.id;
  const status = item.fieldValues.nodes.find((entry) => entry.field.id === 'STATUS');
  status.name = state === 'CLOSED' ? 'Done' : 'Plan';
  status.optionId = 'OPT_' + status.name;
  return node;
}
function providerQuery(cli, query, variables = {}) {
  const args = ['api', 'graphql', '--input', '-'];
  return JSON.parse(
    execFileSync(path.join(cli.env.AITM_GH_TEST_DOUBLE_BIN, 'gh'), args, {
      cwd: path.dirname(cli.file),
      env: cli.env,
      input: JSON.stringify({ query, variables }),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  );
}
async function bothOuterCollectors(f, cli, parentNumber, planPath, bytes) {
  const state = cli.read(),
    parent = state.issues[parentNumber];
  const before = JSON.stringify(state.effects);
  let waveCalls = 0,
    hookCalls = 0;
  const raw = await fetchAllSubIssueNodes({
    parentEpicNumber: parentNumber,
    repo: f.cfg.repo,
    projectId: 'P',
    gqlFn: async (query, variables) => {
      waveCalls++;
      return providerQuery(cli, query, variables).data;
    },
  });
  const children = mapSubIssueNodes(raw, f.cfg).map((child) => ({
    ...child,
    blockedBy: state.issues[child.number].blockedBy.nodes.map((entry) => entry.number),
  }));
  const result = await evaluateMaterializedWbsReadiness({
    issueNumber: parentNumber,
    repository: f.cfg.repo,
    tasks: classifyDecomposition({ planText: bytes }).tasks,
    acceptedPlanPath: planPath,
    acceptedPlanText: bytes,
    epicBody: parent.body,
    children,
    readPlanAtCommit: async ({ planCommit, planPath: p }) =>
      execFileSync('git', ['show', planCommit + ':' + p], {
        cwd: f.root,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      }),
  });
  const hook = await collectHookDecompositionSnapshot({
    issue: parentNumber,
    cfg: f.cfg,
    projectDir: f.root,
    deps: {
      graphql: async ({ query }) => {
        hookCalls++;
        return providerQuery(cli, query);
      },
    },
  });
  assert.equal(waveCalls, 2);
  assert.equal(hookCalls, 3);
  assert.equal(
    JSON.stringify(cli.read().effects),
    before,
    'read-only assessment has zero provider writes'
  );
  return { result, hook, children };
}

test('#2169 native kind retains all 31 sibling bytes/states in exact J 32-child WBS', async (t) => {
  const capture = wbsCompatibilityCapture(),
    f = firstChildFixture(t),
    actor = nativeActor(f, t);
  if (!actor) return;
  f.cfg.repo = 'kburson/ai-task-manager';
  const original = capture.snapshot.subIssues.nodes.find((entry) => entry.number === 2071);
  Object.assign(f.node, {
    number: 2071,
    id: original.id,
    title: original.title,
    repository: original.repository,
    stateReason: null,
  });
  f.node.body = metadata(f.node.body, [
    '- **Source-plan**: ' + capture.planPath,
    '- **Source-plan-commit**: ' + capture.pin,
    '- **Source-plan-section**: ### Task 30: 🐞 [BUG] Coordinated public writer and reader activation',
  ]);
  addFields(f.node);
  f.child.number = 2072;
  const cli = installFirstChildCli(f),
    state = cli.read();
  for (const object of capture.objects) {
    const oid = execFileSync('git', ['hash-object', '-w', '-t', object.kind, '--stdin'], {
      cwd: f.root,
      input: Buffer.from(object.data, 'base64'),
      encoding: 'utf8',
    }).trim();
    assert.equal(oid, object.oid);
  }
  mkdirSync(path.dirname(path.join(f.root, capture.planPath)), { recursive: true });
  writeFileSync(path.join(f.root, capture.planPath), capture.j);
  const parentBody =
    metadata(firstChildBody(state.issues[2071].body), [
      '- **Implementation-plan**: ' + capture.planPath,
      '- **Plan-commit**: ' + capture.pin,
    ]) + '\n<!-- aitm-issue-kind kind="epic" -->';
  state.issues[2039] = fixtureNode(
    state.issues[2071],
    2039,
    capture.snapshot.id,
    parentBody,
    capture.snapshot.title
  );
  state.issues[2039].childNumbers = capture.snapshot.subIssues.nodes.map((entry) => entry.number);
  for (const child of capture.snapshot.subIssues.nodes) {
    if (child.number !== 2071) {
      state.issues[child.number] = fixtureNode(
        state.issues[2071],
        child.number,
        child.id,
        child.body,
        child.title,
        child.state
      );
      state.issues[child.number].stateReason = child.stateReason;
    }
    state.issues[child.number].blockedBy = structuredClone(child.blockedBy);
    state.issues[child.number].parent = {
      id: capture.snapshot.id,
      number: 2039,
      repository: capture.snapshot.repository,
    };
  }
  // Native kind is exercised on an actual first-child parent; only fixture #2071 is rewritten.
  state.issues[2072] = state.childTemplate;
  state.issues[2071].childNumbers = [2072];
  cli.write(state);
  const siblings = Object.fromEntries(
    Object.entries(state.issues).filter(([n]) => n !== '2071' && n !== '2039' && n !== '2072')
  );
  assert.equal(Object.values(siblings).filter((n) => n.state === 'CLOSED').length, 29);
  assert.deepEqual(
    Object.values(siblings)
      .filter((n) => n.state === 'OPEN')
      .map((n) => n.number),
    [2050, 2051]
  );
  const before = await bothOuterCollectors(f, cli, 2039, capture.planPath, capture.j);
  assert.equal(before.result.boundaries.coverage.ok, true, before.result.blockers.join('\n'));
  const started = cli.run(['start', '2071', '--role', 'agent'], actor.env);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(getActiveTask(actor.sid, f.root).issue, '#2071');
  const converted = cli.run(['kind', '2071', 'epic'], actor.env);
  assert.equal(converted.status, 0, converted.stdout + converted.stderr);
  const after = await bothOuterCollectors(f, cli, 2039, capture.planPath, capture.j);
  assert.equal(after.result.boundaries.coverage.ok, true, after.result.blockers.join('\n'));
  assert.equal(after.result.boundaries.coverage.coveredCount, 32);
  assert.equal(after.result.deliveryReady, false);
  assert.equal(after.hook.current.input.epicReadiness.planning, false);
  assert.notEqual(after.hook.current.inputDigest, before.hook.current.inputDigest);
  for (const boundary of ['planning', 'branch'])
    assert.deepEqual(after.result.boundaries[boundary], before.result.boundaries[boundary]);
  const actual = cli.read();
  for (const [number, bytes] of Object.entries(siblings))
    assert.deepEqual(actual.issues[number], bytes);
  assert.deepEqual(
    actual.issues[2071].blockedBy.nodes.map((n) => n.number),
    [2145, 2070, 2049]
  );
  assert.equal(
    digest(readFileSync(path.join(f.root, capture.planPath))),
    'c97f0e5b8aa560e3c9fd89e066e71880510b6ac77dbf8aaebd3fa1c14508b39a'
  );
});
function firstChildBody(body) {
  return body.replace(/## Plan Metadata\n[\s\S]*?(?=## Scope)/, '');
}

import { fileURLToPath } from 'node:url';
const sourceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
test('#2169 actual formatter preserves J only while sibling and K archive remain formatted', (t) => {
  const f = firstChildFixture(t),
    capture = wbsCompatibilityCapture();
  const sibling = 'docs/superpowers/plans/2169-unformatted-sibling.md';
  const archive = 'docs/superpowers/plans/archive/2169-k.md';
  for (const name of [capture.planPath, sibling, archive])
    mkdirSync(path.dirname(path.join(f.root, name)), { recursive: true });
  writeFileSync(path.join(f.root, capture.planPath), capture.j);
  writeFileSync(path.join(f.root, sibling), '# Sibling\n\n-   unformatted   text\n');
  assert.equal(
    digest(capture.k),
    '781fde3c0a27c14c2db48c819218f4616f8214d18068ebd6cd929a8c047c38e2'
  );
  // K already passes current Prettier; perturb only this disposable archive copy.
  writeFileSync(path.join(f.root, archive), capture.k + '\n-   archive formatting probe\n');
  copyFileSync(path.join(sourceRoot, '.prettierignore'), path.join(f.root, '.prettierignore'));
  const format = (...args) =>
    spawnSync(
      process.execPath,
      [path.join(sourceRoot, 'node_modules/prettier/bin/prettier.cjs'), ...args],
      { cwd: f.root, encoding: 'utf8' }
    );
  const beforeJ = readFileSync(path.join(f.root, capture.planPath));
  assert.equal(digest(beforeJ), 'c97f0e5b8aa560e3c9fd89e066e71880510b6ac77dbf8aaebd3fa1c14508b39a');
  const checked = format('--check', capture.planPath);
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  for (const name of [sibling, archive]) {
    const before = readFileSync(path.join(f.root, name));
    assert.equal(format('--check', name).status, 1, name);
    const formatted = format('--write', name);
    assert.equal(formatted.status, 0, formatted.stdout + formatted.stderr);
    assert.notDeepEqual(readFileSync(path.join(f.root, name)), before);
    assert.equal(format('--check', name).status, 0);
  }
  assert.equal(format('--write', 'docs/**/*.md').status, 0);
  assert.deepEqual(readFileSync(path.join(f.root, capture.planPath)), beforeJ);
  assert.equal(
    execFileSync('git', ['hash-object', capture.planPath], {
      cwd: f.root,
      encoding: 'utf8',
    }).trim(),
    'b67d48b254e0d26d558ae22a8ca525ff38468c3d'
  );
  const entries = readFileSync(path.join(f.root, '.prettierignore'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'));
  assert.equal(entries.filter((line) => line === '/' + capture.planPath).length, 1);
  assert.ok(
    !entries.includes('/docs/superpowers/plans/') && !entries.includes('docs/superpowers/plans/**')
  );
});

import { formatIssueFieldDb } from '../../../task-tracker/issue-field-db.mjs';
import { stampRefinementSnapshot } from '../../../task-tracker/lib/refinement-snapshot.mjs';
import { createDecompositionRuntime } from '../../../task-tracker/lib/decomposition-authority.mjs';
import { publishEstimateRevision } from '../../../task-tracker/lib/decomposition-publication.mjs';
import { readDecompositionRecords } from '../../../task-tracker/lib/decomposition-records.mjs';
import { canonicalDecompositionJson } from '../../../task-tracker/lib/decomposition-assessment.mjs';
import { fetchEpicChildren } from '../../../task-tracker/lib/epic-children-gate.mjs';
function positiveNativeFixture(t, hours = 4) {
  const f = firstChildFixture(t),
    actor = nativeActor(f, t);
  if (!actor) return null;
  const content =
    '# Native fixture\n\n### Task 1: 🐞 [BUG] Retain WBS child\n\n#### Story Intent\n\n- **Beneficiary:** task operator\n- **Capability:** retain the accepted child\n- **Need:** native conversion can lose WBS coverage\n- **Value or failure prevented:** unchanged provenance remains usable\n\n#### Implementation\n\nPreserve the child claim.\n\n**Verification Commands:**\n\n```sh\nnode verify.mjs\n```\n';
  mkdirSync(path.join(f.root, 'docs'));
  writeFileSync(path.join(f.root, 'docs/plan.md'), content);
  f.git('add', 'docs/plan.md');
  f.git('commit', '-qm', 'Fixture accepted plan');
  const pin = f.git('rev-parse', 'HEAD');
  const base = f.node.body;
  f.node.title = '🐞 [BUG] Retain WBS child';
  f.node.stateReason = null;
  f.node.blockedBy = connection([]);
  // A label alone confers no kind authority; keeping labels stable isolates representation drift.
  f.node.labels = ['bug', 'epic'];
  f.node.body =
    metadata(base, [
      '- **Source-plan**: docs/plan.md',
      '- **Source-plan-commit**: ' + pin,
      '- **Source-plan-section**: ### Task 1: 🐞 [BUG] Retain WBS child',
      ...(hours === 25
        ? ['- **Implementation-plan**: docs/plan.md', '- **Governing-spec**: docs/plan.md']
        : []),
    ]).replace(
      /<!-- aitm-fields: .*? -->/,
      formatIssueFieldDb({ priority: 'P1', size: 'M', estimate: hours, rank: 1 })
    ) + '\n<!-- aitm-refinement-rationale: {"rationale":"bounded fixture child"} -->';
  f.node.body = stampRefinementSnapshot(f.node.body, {
    labels: f.node.labels,
    ts: '2026-11-06T00:00:00Z',
  });
  addFields(f.node, hours);
  f.node.projectItems.nodes[0].fieldValues.nodes.push({
    id: 'PI_RANK',
    __typename: 'ProjectV2ItemFieldNumberValue',
    number: 1,
    field: { id: 'RANK', name: 'Rank' },
  });
  const cli = installFirstChildCli(f),
    state = cli.read();
  const parentBody =
    metadata(base, ['- **Implementation-plan**: docs/plan.md', '- **Plan-commit**: ' + pin]) +
    '\n<!-- aitm-issue-kind kind="epic" -->';
  state.issues[99] = fixtureNode(state.issues[42], 99, 'OUTER', parentBody, '🧑‍🧒‍🧒 [Epic] Outer WBS');
  state.issues[99].projectItems.nodes[0].fieldValues.nodes.find((v) => v.field.id === 'E').number =
    4;
  state.issues[99].childNumbers = [42];
  state.issues[42].parent = { number: 99, id: 'OUTER', repository: { nameWithOwner: 'o/r' } };
  cli.write(state);
  Object.assign(process.env, cli.env);
  return { f, cli, actor, content, pin };
}

test('#2169 public split creator/tether preserves its outer claim through both collectors', async (t) => {
  const x = positiveNativeFixture(t, 25);
  if (!x) return;
  const { f, cli, actor, content } = x;
  const started = cli.run(['start', '42', '--role', 'agent'], actor.env);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  const result = cli.run(['split-plan', '42', '--confirm', '--json'], actor.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const state = cli.read();
  assert.deepEqual(state.issues[42].childNumbers, [43]);
  assert.equal(state.effects.filter((e) => e === 'create:43').length, 1);
  assert.equal(state.issues[42].title, '🧑‍🧒‍🧒 [Epic] Retain WBS child');
  const outer = await bothOuterCollectors(f, cli, 99, 'docs/plan.md', content);
  assert.equal(outer.result.boundaries.coverage.ok, true, outer.result.blockers.join('\n'));
  assert.equal(outer.result.deliveryReady, true, outer.result.blockers.join('\n'));
  assert.equal(outer.hook.current.input.epicReadiness.planning, true);
});

test('#2169 public resume confirms converted authority and preserves completed publication history', async (t) => {
  const x = positiveNativeFixture(t);
  if (!x) return;
  const { f, cli, actor, content } = x;
  const originalOuter = await bothOuterCollectors(f, cli, 99, 'docs/plan.md', content);
  assert.equal(originalOuter.result.deliveryReady, true, originalOuter.result.blockers.join('\n'));
  const enriched = await fetchEpicChildren({ cfg: f.cfg, parentEpicNumber: 99 });
  assert.ok(
    enriched.every((c) => !c.childEvidenceError),
    JSON.stringify(enriched)
  );
  const subject = { repository: 'o/r', issue: 99, projectId: 'P', projectItemId: 'OUTER_ITEM' };
  const readEstimate = async () => {
    const value = cli
      .read()
      .issues[99].projectItems.nodes[0].fieldValues.nodes.find((v) => v.field.id === 'E').number;
    return {
      status: 'observed',
      value,
      revision: null,
      digest: digest(canonicalDecompositionJson(value)),
    };
  };
  const runtime = createDecompositionRuntime({
    cfg: f.cfg,
    projectDir: f.root,
    deps: {
      findMainWorktreePath: (dir) => dir,
      readPublicationEffect: async ({ effect }) => {
        assert.equal(effect.id, 'estimate');
        assert.equal(effect.targetIdentity, 'OUTER_ITEM');
        return readEstimate();
      },
    },
  });
  const original = await runtime.collect(subject);
  assert.equal(original.input.epicReadiness.planning, true, JSON.stringify(original.input));
  assert.equal((await runtime.refresh(subject)).status, 'confirmed');
  const value = 4;
  const effect = {
    id: 'estimate',
    resource: 'project-estimate',
    targetIdentity: 'OUTER_ITEM',
    value,
    read: readEstimate,
    apply: async () => {
      throw new Error('already-matching effect must not be replayed');
    },
  };
  const publicationArgs = {
    subject,
    operationId: '79b8d90f-5f09-4409-9657-f2d797983616',
    expectedInputDigest: original.inputDigest,
    proposal: { estimate: { basis: 'published', hours: 4, proposalId: null }, size: 'M' },
    effects: [effect],
    deps: { writerId: 'inflate-estimate', intendedInputDigest: original.inputDigest, runtime },
  };
  const published = await publishEstimateRevision(publicationArgs);
  assert.equal(published.status, 'recorded', JSON.stringify(published));
  const oldBody = cli.read().issues[99].body;
  const pubBytes = (body) => body.match(/<!-- aitm-decomposition-publication[^\n]+/)[0];
  const oldPublication = readDecompositionRecords(oldBody).publication;
  assert.equal(oldPublication.status, 'complete');
  const ordinaryResume = cli.run(
    ['resume', '99', '--role', 'agent', '--confirm-relocation'],
    actor.env
  );
  assert.equal(ordinaryResume.status, 0, ordinaryResume.stdout + ordinaryResume.stderr);
  const ordinaryCurrent = await runtime.collect(subject);
  assert.equal(ordinaryCurrent.inputDigest, original.inputDigest);
  assert.equal(ordinaryCurrent.projection.status, 'current');
  assert.equal(pubBytes(cli.read().issues[99].body), pubBytes(oldBody));
  const started = cli.run(['start', '42', '--role', 'agent'], actor.env);
  assert.equal(started.status, 0, started.stdout + started.stderr);
  const kind = cli.run(['kind', '42', 'epic'], actor.env);
  assert.equal(kind.status, 0, kind.stdout + kind.stderr);
  const stale = await runtime.collect(subject);
  assert.equal(stale.input.epicReadiness.planning, true);
  assert.equal(stale.projection.status, 'stale');
  assert.notEqual(stale.inputDigest, original.inputDigest);
  assert.equal(stale.capabilities.includes('scoped-completion'), false);
  assert.equal(pubBytes(cli.read().issues[99].body), pubBytes(oldBody));
  const beforeEffects = [...cli.read().effects];
  const inspected = cli.run(['decompose-check', '99', '--json'], actor.env);
  assert.equal(inspected.status, 3, inspected.stdout + inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).projection.status, 'stale');
  assert.deepEqual(cli.read().effects, beforeEffects);
  // Switching the actor from the child selects the outer issue. Its subsequent
  // same-issue resume owns refresh; the existing cross-issue switch does not.
  const selected = cli.run(['start', '99', '--role', 'agent'], actor.env);
  assert.equal(selected.status, 0, selected.stdout + selected.stderr);
  assert.equal((await runtime.collect(subject)).projection.status, 'stale');
  const resumed = cli.run(['resume', '99', '--role', 'agent', '--confirm-relocation'], actor.env);
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  assert.equal(getActiveTask(actor.sid, f.root).issue, '#99');
  const current = await runtime.collect(subject);
  assert.equal(current.projection.status, 'current');
  assert.equal(current.input.epicReadiness.planning, true);
  assert.equal(current.inputDigest, stale.inputDigest);
  assert.deepEqual(current.publication, oldPublication);
  assert.equal(pubBytes(cli.read().issues[99].body), pubBytes(oldBody));
  const retry = await publishEstimateRevision(publicationArgs);
  assert.equal(retry.status, 'refused');
  assert.match(retry.reason, /completed-authority-drift/);
  const outer = await bothOuterCollectors(f, cli, 99, 'docs/plan.md', content);
  assert.equal(outer.hook.current.projection.status, 'current');
  assert.equal(outer.result.deliveryReady, true);
});

test('#2169 ordinary leaf public resume retains input and current scoped capability', async (t) => {
  const x = positiveNativeFixture(t);
  if (!x) return;
  const { f, cli, actor } = x;
  const subject = { repository: 'o/r', issue: 42, projectId: 'P', projectItemId: 'PI' };
  const runtime = createDecompositionRuntime({
    cfg: f.cfg,
    projectDir: f.root,
    deps: { findMainWorktreePath: (dir) => dir },
  });
  assert.equal((await runtime.refresh(subject)).status, 'confirmed');
  const before = await runtime.collect(subject);
  assert.equal(before.projection.status, 'current');
  assert.ok(before.capabilities.includes('scoped-implementation'));
  const resumed = cli.run(['resume', '42', '--role', 'agent', '--confirm-relocation'], actor.env);
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
  const after = await runtime.collect(subject);
  assert.equal(after.inputDigest, before.inputDigest);
  assert.equal(after.projection.status, 'current');
  assert.deepEqual(after.capabilities, before.capabilities);
});
