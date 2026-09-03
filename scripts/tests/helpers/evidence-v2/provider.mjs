// @story #1496
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { rehearsalRefusal } from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';
import { providerCommand } from './provider-transport.mjs';
import { tripFault } from './faults.mjs';

export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function initializeProvider(context) {
  const number = 1000001;
  const issue = {
    id: `I_rehearsal_${number}`,
    number,
    title: 'Synthetic rehearsal issue',
    body: '## User Story\n\nSynthetic fixture only.\n',
    state: 'OPEN',
    stateReason: null,
    assignees: [{ login: 'rehearsal-author' }],
    labels: [],
    url: `https://example.invalid/${context.repositoryId}/issues/${number}`,
  };
  writeFileSync(
    path.join(context.root, 'provider.json'),
    JSON.stringify({
      schema: 1,
      repositoryId: context.repositoryId,
      issues: { [number]: issue },
      comments: [],
      boards: { [number]: 'Review' },
      operations: {},
      faults: [],
      effects: [],
      events: [],
      staleReads: {},
    })
  );
}

export function openProvider(context) {
  const file = path.join(context.root, 'provider.json');
  const load = () => {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.schema !== 1 || state.repositoryId !== context.repositoryId)
      throw rehearsalRefusal('provider-identity');
    return state;
  };
  const save = (state) => {
    const pending = `${file}.${process.pid}.pending`;
    writeFileSync(pending, JSON.stringify(state));
    renameSync(pending, file);
  };
  const issueFrom = (state, number) => {
    if (!Number.isSafeInteger(Number(number)) || Number(number) < 1000000)
      throw rehearsalRefusal('production-target');
    if (!state.issues[number]) throw rehearsalRefusal('unknown-issue');
    return state.issues[number];
  };
  const provider = {
    issue(number) {
      const s = load();
      const current = issueFrom(s, number);
      const queued = s.staleReads[number] || [];
      const result = queued.length ? queued.shift() : current;
      s.events.push({ kind: 'read', resource: 'issue', number, observed: structuredClone(result) });
      save(s);
      return structuredClone(result);
    },
    queueStaleRead(number) {
      const s = load();
      const snapshot = structuredClone(issueFrom(s, number));
      (s.staleReads[number] ||= []).push(snapshot);
      save(s);
    },
    events() {
      return load().events;
    },
    comments(number) {
      const s = load();
      issueFrom(s, number);
      return structuredClone(s.comments.filter((c) => c.issueNumber === Number(number)));
    },
    effects() {
      return load().effects;
    },
    checkpoint({ operationId, fault = null }) {
      const s = load();
      if (!s.operations[operationId]) throw rehearsalRefusal('checkpoint-without-response');
      tripFault(s, save, { operationId, fault, point: 'after-response' });
      s.operations[operationId].checkpointRecorded = true;
      save(s);
    },
    commentPage(number, { first = 100, after = null } = {}) {
      const all = provider.comments(number);
      const offset = after === null ? 0 : Number(String(after).replace(/^cursor:/, ''));
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > all.length ||
        !Number.isInteger(first) ||
        first < 1
      )
        throw rehearsalRefusal('pagination');
      const nodes = all.slice(offset, offset + first);
      return {
        nodes,
        pageInfo: {
          hasNextPage: offset + nodes.length < all.length,
          endCursor: nodes.length ? `cursor:${offset + nodes.length}` : null,
        },
      };
    },
    boardSnapshot(number) {
      const s = load();
      const issue = issueFrom(s, number);
      return {
        repository: {
          issue: {
            ...issue,
            subIssues: { nodes: [] },
            projectItems: {
              nodes: [
                {
                  id: `PVTI_${number}`,
                  project: { id: 'PVT_rehearsal' },
                  fieldValueByName: { name: s.boards[number] },
                },
              ],
            },
          },
        },
      };
    },
    apply({ kind, issueNumber, operationId, payload, fault = null }) {
      const s = load();
      const issue = issueFrom(s, issueNumber);
      if (!['body', 'comment', 'board', 'close', 'reopen'].includes(kind))
        throw rehearsalRefusal('unsupported-operation');
      if (
        typeof operationId !== 'string' ||
        !operationId ||
        !payload ||
        typeof payload !== 'object'
      )
        throw rehearsalRefusal('operation-input');
      const hash = digest({ kind, issueNumber, payload });
      const prior = Object.hasOwn(s.operations, operationId) ? s.operations[operationId] : null;
      if (prior) {
        if (prior.hash !== hash) throw rehearsalRefusal('operation-conflict');
        return structuredClone(prior.result);
      }
      const trip = (point) => tripFault(s, save, { operationId, fault, point });
      trip('before-effect');
      let result;
      if (kind === 'body') {
        if (typeof payload.body !== 'string') throw rehearsalRefusal('body-input');
        issue.body = payload.body;
        result = issue;
      }
      if (kind === 'comment') {
        if (typeof payload.body !== 'string') throw rehearsalRefusal('comment-input');
        result = {
          id: `IC_rehearsal_${s.comments.length + 1}`,
          databaseId: s.comments.length + 1,
          issueNumber,
          body: payload.body,
          author: { login: 'rehearsal-author' },
          createdAt: new Date().toISOString(),
        };
        s.comments.push(result);
      }
      if (kind === 'board') {
        if (
          ![
            'Backlog',
            'Refine',
            'Ready for Planning',
            'Plan',
            'Develop',
            'Test',
            'Review',
            'Done',
          ].includes(payload.state)
        )
          throw rehearsalRefusal('board-input');
        s.boards[issueNumber] = payload.state;
        result = { id: `PVTI_${issueNumber}`, state: payload.state };
      }
      if (kind === 'close' || kind === 'reopen') {
        issue.state = kind === 'close' ? 'CLOSED' : 'OPEN';
        issue.stateReason = kind === 'close' ? 'COMPLETED' : 'REOPENED';
        result = issue;
      }
      Object.defineProperty(s.operations, operationId, {
        value: { hash, result: structuredClone(result) },
        enumerable: true,
        writable: true,
        configurable: true,
      });
      s.effects.push({ kind, issueNumber, operationId, payload: structuredClone(payload) });
      s.events.push({ kind: 'write', operation: kind, issueNumber, operationId });
      save(s);
      trip('after-effect');
      return structuredClone(result);
    },
    command(args, options = {}) {
      return providerCommand({ provider, context, args, options });
    },
    async pexec(command, args, options = {}) {
      if (command !== 'gh') throw rehearsalRefusal('unsupported-process');
      return { stdout: provider.command(args, options), stderr: '' };
    },
  };
  return Object.freeze(provider);
}
