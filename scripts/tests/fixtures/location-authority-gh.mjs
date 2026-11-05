#!/usr/bin/env node
// @story #2148 — standalone GitHub transport for physical Start fixtures.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const dir = process.env.LOCATION_AUTHORITY_PROVIDER;
const file = path.join(dir, 'issue.json');
const issue = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const scenario = issue.scenario;
function flag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
function reply(value) {
  process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
}
function record(kind, detail) {
  appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify({ kind, detail }) + '\n');
}
function persist(kind, detail) {
  record(kind, detail);
  writeFileSync(file, JSON.stringify(issue));
}
function refuse() {
  record('refused', [...args, ...(typeof request === 'string' ? [request] : [])]);
  throw new Error('Unexpected fixture provider operation ' + JSON.stringify(args));
}

let request;
if (
  args[0] === 'issue' &&
  args[2] === String(issue.number) &&
  (flag('-R') ?? flag('--repo')) === issue.repo
) {
  if (args[1] === 'view' && flag('--json') === 'body') {
    reply(flag('-q') === '.body' || flag('--jq') === '.body' ? issue.body : { body: issue.body });
  } else if (args[1] === 'view' && flag('--json') === 'comments') {
    reply({ comments: issue.comments });
  } else if (args[1] === 'view' && flag('--json') === 'number,body') {
    reply({ number: issue.number, body: issue.body });
  } else if (args[1] === 'comment' && flag('--body')?.startsWith('⏱ Timing Log')) {
    const id = issue.comments.length + 1;
    const url = 'https://example.invalid/issue/2148#issuecomment-' + id;
    const at = new Date().toISOString();
    issue.comments.push({
      id: 'IC_' + id,
      databaseId: id,
      __typename: 'IssueComment',
      body: flag('--body'),
      url,
      author: { login: 'operator' },
      createdAt: at,
      updatedAt: at,
      issue: { number: issue.number, repository: { nameWithOwner: issue.repo } },
    });
    persist('comment-write', id);
    reply(url);
  } else if (args[1] === 'edit' && flag('--body-file') === '-') {
    const proposed = readFileSync(0, 'utf8');
    if (scenario?.afterWrite && !issue.raced) {
      issue.raced = true;
      issue.body = 'Concurrent note\n' + issue.body;
      Object.assign(issue, scenario.afterWrite);
    } else issue.body = proposed;
    persist('body-write', proposed);
  } else refuse();
} else if (args.join(' ') === 'api user --jq .login') {
  reply('operator');
} else if (
  args[0] === 'api' &&
  args[1] === 'graphql' &&
  args.includes('owner=fixture') &&
  args.includes('name=repository') &&
  args.includes('issue=' + issue.number) &&
  args.some(
    (a) => a.startsWith('query=query(') && a.includes('number comments(first:100,after:$after)')
  )
) {
  reply({
    data: {
      repository: {
        nameWithOwner: issue.repo,
        issue: {
          number: issue.number,
          comments: {
            totalCount: issue.comments.length,
            nodes: issue.comments,
            pageInfo: { hasNextPage: false },
          },
        },
      },
    },
  });
} else if (args.join(' ') === 'api graphql --input -') {
  const { query, variables } = JSON.parse(readFileSync(0, 'utf8'));
  const q = query.replace(/\s+/g, ' ').trim();
  request = q;
  if (
    variables.owner !== 'fixture' ||
    (variables.repo ?? variables.name) !== 'repository' ||
    Number(variables.issue) !== issue.number ||
    !/^query[ (]/.test(q)
  )
    refuse();
  const locationQuery = q.includes('viewer { login }') && q.includes('body state');
  if (locationQuery && scenario?.holdFinalObservation) {
    const log = path.join(dir, 'calls.jsonl');
    if (existsSync(log) && readFileSync(log, 'utf8').includes('"kind":"assignment-read"')) {
      record('await-local-change', null);
      const deadline = Date.now() + 10000;
      while (!existsSync(path.join(dir, 'continue'))) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the authority change');
        await delay(10);
      }
      Object.assign(issue, JSON.parse(readFileSync(file, 'utf8')));
    }
  }
  const pageInfo = { hasNextPage: false, endCursor: null };
  const nodes = [
    {
      id: 'item',
      project: { id: 'board', title: 'Fixture', url: 'https://example.invalid/board' },
      fieldValueByName: { name: issue.state, optionId: 'backlog' },
      fieldValues: { nodes: [], pageInfo },
    },
  ];
  const assignees = { nodes: issue.owners.map((login) => ({ login })) };
  if (
    q.includes('assignees(first: 100)') &&
    q.includes('projectItems(first: 50, after: $cursor)')
  ) {
    record('assignment-read', issue.owners);
    if (issue.failSnapshot) throw new Error('fixture assignment read failed');
    reply({
      data: {
        ...(locationQuery ? { viewer: { login: 'operator' } } : {}),
        repository: {
          issue: {
            ...(locationQuery ? { body: issue.body, state: 'OPEN' } : {}),
            assignees,
            projectItems: { nodes, pageInfo: { hasNextPage: false } },
          },
        },
      },
    });
    if (scenario?.afterEntry && !issue.raced) {
      issue.raced = true;
      Object.assign(issue, scenario.afterEntry);
      writeFileSync(file, JSON.stringify(issue));
    }
  } else if (q.includes('issue(number: $issue) { body }')) {
    reply({ data: { repository: { issue: { body: issue.body } } } });
  } else if (q.includes('issue(number: $issue) { id number title url projectItems(first: 50')) {
    reply({
      data: {
        repository: {
          id: 'repo',
          issue: {
            id: 'issue',
            number: issue.number,
            title: 'Fixture',
            url: 'https://example.invalid/issue/2148',
            projectItems: { nodes, pageInfo },
          },
        },
      },
    });
  } else if (q.startsWith('query AitmEstimationProjection(')) {
    reply({
      data: {
        repository: {
          issue: {
            body: issue.body,
            comments: { nodes: issue.comments, pageInfo },
            projectItems: { nodes, pageInfo },
          },
        },
      },
    });
  } else refuse();
} else refuse();
