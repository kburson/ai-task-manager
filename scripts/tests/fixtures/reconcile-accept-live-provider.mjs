#!/usr/bin/env node
// @story #2147 — private provider process for the physical public-entry test.
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), '.tmp', 'provider');
const stateFile = path.join(dir, 'state.json');
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
const args = process.argv.slice(2);
const issueArgs = ['71', '-R', 'fixture-b1/reconcile'];
const matches = (...expected) => JSON.stringify(args) === JSON.stringify(expected);
const log = (event) => appendFileSync(path.join(dir, 'events'), event + '\n');
const save = () => writeFileSync(stateFile, JSON.stringify(state));

// Reject changed query shapes and foreign arguments. These are normalized
// whitespace digests of the assignment, reconcile body and membership queries.
const queries = new Map([
  ['d2ad3a5f01d0d556b70d298b5cf38b85f69851c3e87c454b286742ae7e412b88', 'owner'],
  ['802facc66c61af4a0bb80b9f8f7615c672b9a8937a4285e84907d87270f623de', 'body'],
  ['b0aa2f053278ca7729318540ae5c20bbb6730144fcaa4f815a742f4ccbfee009', 'board'],
]);
const bindReads = new Set([
  '4cca214c084669e6b00b3907cb3b818c78e05caa2f3f2dd92d47f3df0f9bb642',
  'c5db3166672690db60c6546eee3cfa98f4cbb797efd98cc85fb0ba25db33382c',
  '1310c5d3d186a3a93a19fa18542776dd259ddfe86cabf45c3b3b5028b44c03fc',
  'bf20a8a660f5ae7d16effb9ff5b392129f285271b46fc6d8405e36163f2f373a',
  '7134155a394aae0eed8358ee99638dcee4fc2b4bed1c29fc2c115d01d7449889',
]);
const timingQuery =
  'query($owner:String!,$name:String!,$issue:Int!,$after:String){repository(owner:$owner,name:$name){nameWithOwner issue(number:$issue){number comments(first:100,after:$after){totalCount nodes{id body} pageInfo{hasNextPage endCursor}}}}}';
function comments() {
  const nodes = state.comments ?? [];
  return { nodes, totalCount: nodes.length, pageInfo: { hasNextPage: false, endCursor: null } };
}

function reject(reason) {
  log('unexpected: ' + reason);
  throw new Error(reason);
}

function graphql() {
  const { query, variables } = JSON.parse(readFileSync(0, 'utf8'));
  const digest = createHash('sha256').update(query.replace(/\s+/g, ' ').trim()).digest('hex');
  const kind = queries.get(digest) ?? (state.setup && bindReads.has(digest) ? 'binding' : null);
  if (
    !kind ||
    variables.owner !== 'fixture-b1' ||
    (variables.repo ?? variables.name) !== 'reconcile' ||
    variables.issue !== 71 ||
    variables.cursor ||
    variables.after
  )
    reject(query);
  log('query.' + kind);
  if (
    state.setup &&
    state.seedUnavailable &&
    digest === 'c5db3166672690db60c6546eee3cfa98f4cbb797efd98cc85fb0ba25db33382c'
  ) {
    log('seed.unavailable');
    throw new Error('cache-seeding body read unavailable');
  }
  if (kind === 'board' && state.auditBaseRead && state.mode === 'audit-board-unavailable')
    throw new Error('board unavailable at the success audit');
  let body = state.body;
  if (kind === 'body' && state.markerWritten) {
    if (state.mode === 'unavailable') throw new Error('provider unavailable after write');
    if (state.mode === 'audit-read-outage' && state.auditBaseRead)
      throw new Error('readback unavailable');
    if (state.mode === 'stale') body = state.initial;
    if (state.mode === 'restored-proof') {
      state.body = state.body.replace(
        'vc-list="vc:1" -->',
        'vc-list="vc:1" sha="abc1234" ts="2026-10-01T00:00:00Z" exit="0" -->'
      );
      body = state.body;
    }
    state.readBack = true;
    save();
  }
  const moved =
    (state.mode === 'lost-ack-moved' && state.markerWritten) ||
    (state.mode === 'board-drift' && state.markerWritten) ||
    (state.mode === 'prewrite-board-drift' && state.hasReadBase);
  const status =
    state.live ??
    (state.mode === 'legacy-destination'
      ? 'Development'
      : ['demote', 'retired-demote', 'restored-proof'].includes(state.mode)
        ? 'Develop'
        : moved
          ? 'Plan'
          : 'Backlog');
  const item = {
    id: 'ITEM',
    project: { id: 'PVT_71' },
    fieldValues: { nodes: [], pageInfo: { hasNextPage: false } },
    fieldValueByName: { name: status, optionId: status },
  };
  return JSON.stringify({
    data: {
      viewer: { login: 'operator' },
      repository: {
        id: 'R',
        nameWithOwner: 'fixture-b1/reconcile',
        issue: {
          id: 'I',
          number: 71,
          title: 'Fixture issue',
          url: 'https://example.invalid/71',
          body,
          state: 'OPEN',
          comments: comments(),
          createdAt: '2026-11-03T00:00:00Z',
          assignees: { nodes: [{ login: 'operator' }] },
          projectItems: { nodes: [item], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      },
    },
  });
}

function handle() {
  if (matches('api', 'user', '--jq', '.login')) return 'operator';
  if (matches('api', 'graphql', '--input', '-')) return graphql();
  if (state.setup) {
    if (matches('issue', 'view', ...issueArgs, '--json', 'body'))
      return JSON.stringify({ body: state.body });
    const updateTimingQuery = `
    mutation($id: ID!, $body: String!) {
      updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
    }`;
    if (
      matches(
        'api',
        'graphql',
        '-f',
        'query=' + updateTimingQuery,
        '-f',
        'id=IC_fixture101',
        '-f',
        args[7]
      ) &&
      args[7].startsWith('body=⏱ Timing Log\n') &&
      state.comments?.length === 1 &&
      state.comments[0].id === 'IC_fixture101'
    ) {
      state.comments[0].body = args[7].slice(5);
      log('timing.update');
      save();
      return JSON.stringify({
        data: { updateIssueComment: { issueComment: { id: 'IC_fixture101' } } },
      });
    }
    if (
      matches('issue', 'comment', ...issueArgs, '--body', args[6]) &&
      args[6].startsWith('⏱ Timing Log\n')
    ) {
      const url = 'https://github.com/fixture-b1/reconcile/issues/71#issuecomment-101';
      state.comments = [
        {
          id: 'IC_fixture101',
          databaseId: 101,
          node_id: 'IC_fixture101',
          url,
          body: args[6],
          author: { login: 'operator' },
          createdAt: '2026-11-03T00:00:00Z',
          updatedAt: '2026-11-03T00:00:00Z',
          issue: { number: 71, repository: { nameWithOwner: 'fixture-b1/reconcile' } },
        },
      ];
      save();
      return url;
    }
    if (matches('issue', 'view', ...issueArgs, '--json', 'body', '--jq', '.body'))
      return state.body;
    if (matches('issue', 'view', '71', '--repo', 'fixture-b1/reconcile', '--json', 'number,body'))
      return JSON.stringify({ number: 71, body: state.body });
    if (matches('issue', 'view', ...issueArgs, '--json', 'comments'))
      return JSON.stringify({ comments: comments().nodes });
    if (
      matches(
        'api',
        'graphql',
        '-f',
        'query=' + timingQuery,
        '-f',
        'owner=fixture-b1',
        '-f',
        'name=reconcile',
        '-F',
        'issue=71'
      )
    ) {
      return JSON.stringify({
        data: {
          repository: {
            nameWithOwner: 'fixture-b1/reconcile',
            issue: { number: 71, comments: comments() },
          },
        },
      });
    }
  }
  if (matches('issue', 'view', ...issueArgs, '--json', 'body', '-q', '.body')) {
    if (state.auditWritten && !state.faultDelivered && state.mode.startsWith('audit-fleeting-')) {
      state.faultDelivered = true;
      save();
      log('audit.conflict');
      return state.mode === 'audit-fleeting-state'
        ? state.body.replace(/state="(?:backlog|plan)"/, 'state="review"')
        : state.body + '\n<!-- aitm-entered-review ts="2026-11-03T02:00:00Z" -->\n';
    }
    if (state.markerWritten && state.mode === 'verify-fleeting' && !state.faultDelivered) {
      state.faultDelivered = true;
      state.body = state.initial;
      save();
      return '<!-- aitm-last-known-state: review -->\n' + state.initial;
    }
    if (state.readBack && !state.auditBaseRead) {
      state.auditBaseRead = true;
      save();
      if (state.mode === 'audit-read-outage') throw new Error('audit base unavailable');
    }
    if (!state.hasReadBase && state.mode === 'fleeting-conflict') {
      state.hasReadBase = true;
      save();
      return state.body + '\n<!-- aitm-last-known-state: plan -->\n';
    }
    if (state.readBack && state.mode === 'audit-drift') {
      state.body = state.body.replace('state="backlog"', 'state="plan"');
      save();
    }
    if (!state.hasReadBase) {
      state.hasReadBase = true;
      if (state.mode === 'prose') state.body += '\nConcurrent prose.\n';
      if (state.mode === 'history-drift')
        state.body += '\n<!-- aitm-entered-plan ts="2026-11-03T01:00:00Z" -->\n';
      if (state.mode === 'marker-drift') state.body += '\n<!-- aitm-last-known-state: test -->\n';
      save();
    }
    return state.body;
  }
  if (matches('issue', 'edit', ...issueArgs, '--body-file', args[6])) {
    const file = args[6];
    if (
      file !== '-' &&
      !path.resolve(file).startsWith(path.join(process.cwd(), '.scratch') + path.sep)
    )
      reject('foreign body path');
    const next = readFileSync(file === '-' ? 0 : file, 'utf8');
    if (state.setup) {
      state.body = next;
      save();
      return '';
    }
    if (next.includes('aitm-reconciled')) {
      log('audit.write');
      if (state.mode === 'audit-reject') throw new Error('audit write rejected');
      state.auditWritten = true;
    } else {
      log('marker.write');
      if (state.mode === 'reject') throw new Error('provider rejected the write');
      if (state.mode === 'drop') return '';
      state.markerWritten = true;
    }
    state.body = next;
    if (
      next.includes('aitm-reconciled') &&
      !state.faultDelivered &&
      !state.mode.startsWith('audit-fleeting-')
    ) {
      if (state.mode === 'audit-overlap') state.body = '<!-- aitm-last-known-state: review -->\n';
      if (state.mode === 'audit-prose')
        state.body = next.replace(/(<!-- aitm-reconciled.*?-->)/, '$1\nConcurrent audit note.');
      state.faultDelivered = true;
    }
    save();
    if (next.includes('aitm-reconciled') && state.mode === 'audit-lost-ack')
      throw new Error('audit landed but response was lost');
    if (
      !next.includes('aitm-reconciled') &&
      !state.faultDelivered &&
      ['lost-ack', 'lost-ack-moved', 'rebase'].includes(state.mode)
    ) {
      state.faultDelivered = true;
      if (state.mode === 'rebase') state.body = 'Concurrent prefix.\n' + state.initial;
      save();
      if (state.mode.startsWith('lost-ack')) throw new Error('write landed but response was lost');
    }
    return '';
  }
  if (
    matches('issue', 'comment', ...issueArgs, '--body', args[6]) &&
    args[6].includes('aitm-state-recording-failed')
  ) {
    log('failure.comment');
    return '';
  }
  if (
    matches('issue', 'comment', ...issueArgs, '--body', args[6]) &&
    args[6].includes('aitm-reconcile-partial')
  ) {
    log('partial.comment');
    return '';
  }
  reject(JSON.stringify(args));
}
process.stdout.write(handle());
