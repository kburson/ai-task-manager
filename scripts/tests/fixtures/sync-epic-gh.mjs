#!/usr/bin/env node
// @story #2145 — read-only GitHub boundary for the physical registered sync CLI.
import { readFileSync, appendFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.AITM_SYNC_CLI_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
if (args.join(' ') !== 'api graphql --input -')
  throw new Error('unexpected fixture gh operation ' + args.join(' '));
const request = JSON.parse(readFileSync(0, 'utf8'));
appendFileSync(fixture.trace, JSON.stringify(request) + '\n');
const connection = { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
const membership = {
  nodes: [
    {
      id: 'PVTI_fixture',
      project: { id: 'PVT_fixture' },
      fieldValues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const issue = {
  id: 'I_fixture',
  number: request.variables.issue || 905,
  state: 'OPEN',
  stateReason: null,
  body: fixture.body,
  parent: null,
  blockedBy: connection,
  blocking: connection,
  projectItems: membership,
  subIssues: {
    totalCount: 1,
    nodes: [{ id: 'I_child', number: 910, state: 'OPEN', body: '', projectItems: membership }],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};
if (fixture.unreadableParent && request.query.includes('parent { number }')) delete issue.parent;
process.stdout.write(JSON.stringify({ data: { repository: { issue } } }));
