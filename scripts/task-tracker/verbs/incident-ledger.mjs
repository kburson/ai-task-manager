import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { gql } from '../../gh/lib/github-projects.mjs';
import {
  createIssueComment,
  listIssueCommentsSince,
  normalizeGitHubInstant,
} from '../lib/github-records/github-comment-store.mjs';
import {
  approveIncidentLedger,
  observeIncidentLedgerLive,
  recordIncidentLedger,
} from '../lib/delivery-incident-reconciliation.mjs';

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

function usageError() {
  throw new TypeError(
    'Usage: /task incident-ledger #1381 (--record <ledger.json> | --approve <ledger-id> --digest <sha256:digest>)'
  );
}

export function parseIncidentLedgerArgs(args = []) {
  const issueToken = String(args[0] || '').replace(/^#/, '');
  if (issueToken !== '1381') usageError();
  const recordIndex = args.indexOf('--record');
  const approveIndex = args.indexOf('--approve');
  const digestIndex = args.indexOf('--digest');
  if (recordIndex >= 0) {
    if (
      approveIndex >= 0 ||
      digestIndex >= 0 ||
      recordIndex !== 1 ||
      args.length !== 3 ||
      typeof args[2] !== 'string' ||
      args[2].length === 0
    ) {
      usageError();
    }
    return Object.freeze({ issueNumber: 1381, mode: 'record', recordPath: args[2] });
  }
  if (
    approveIndex !== 1 ||
    digestIndex !== 3 ||
    args.length !== 5 ||
    !ULID_RE.test(args[2] || '') ||
    !DIGEST_RE.test(args[4] || '')
  ) {
    usageError();
  }
  return Object.freeze({
    issueNumber: 1381,
    mode: 'approve',
    ledgerId: args[2],
    ledgerDigest: args[4],
  });
}

function normalizeCommentRecord(record) {
  return Object.freeze({
    id: record.commentNodeId,
    envelope: record.envelope,
    authorLogin: record.authorLogin,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function parseGhJson(stdout) {
  return JSON.parse(String(stdout || '').trim());
}

export function createProductionRuntime(ctx, deps = {}) {
  const run = deps.run || promisify(execFile);
  const projectDir = ctx.projectDir;
  const repository = ctx.cfg.repo;
  let pinnedTrunkSha = null;
  const graphql = ({ query, variables }) => gql(query, variables).then((data) => ({ data }));
  const listRecords = async (issue) =>
    (
      await listIssueCommentsSince({
        repository,
        issue,
        since: '1970-01-01T00:00:00.000Z',
        graphql,
      })
    ).map(normalizeCommentRecord);
  const appendRecord = async ({ issue, body }) => {
    const record = await createIssueComment({
      repository,
      issue,
      body,
      graphql,
      rest: {
        async createIssueComment({ repository: targetRepo, issue: targetIssue, body: targetBody }) {
          const { stdout } = await run('gh', [
            'api',
            `repos/${targetRepo}/issues/${targetIssue}/comments`,
            '--method',
            'POST',
            '-f',
            `body=${targetBody}`,
          ]);
          return { node_id: parseGhJson(stdout).node_id };
        },
      },
    });
    return normalizeCommentRecord(record);
  };
  const liveObservationDeps = {
    async readTrunkSha() {
      if (pinnedTrunkSha === null) {
        await run('git', ['fetch', 'origin', 'trunk'], { cwd: projectDir });
        const { stdout } = await run('git', ['rev-parse', 'origin/trunk'], { cwd: projectDir });
        pinnedTrunkSha = String(stdout).trim();
      }
      return pinnedTrunkSha;
    },
    async fetchIssue(issueNumber) {
      const { stdout } = await run('gh', [
        'issue',
        'view',
        String(issueNumber),
        '-R',
        repository,
        '--json',
        'state,body,labels',
      ]);
      return parseGhJson(stdout);
    },
    fetchBoardState: (issueNumber) => ctx.getIssueBoardState(issueNumber),
    async fetchPullRequest(prNumber) {
      const { stdout } = await run('gh', [
        'pr',
        'view',
        String(prNumber),
        '-R',
        repository,
        '--json',
        'number,headRefOid,mergeCommit',
      ]);
      const pr = parseGhJson(stdout);
      return {
        number: pr.number,
        headRefOid: pr.headRefOid,
        mergeCommitSha: pr.mergeCommit?.oid ?? null,
      };
    },
    async listComments(issueNumber) {
      const { stdout } = await run('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/${repository}/issues/${issueNumber}/comments`,
      ]);
      const pages = parseGhJson(stdout);
      return pages.flat().map((comment) => ({
        id: String(comment.id),
        url: comment.html_url,
        body: comment.body,
        createdAt: normalizeGitHubInstant(comment.created_at),
      }));
    },
    async isOnTrunk(sha) {
      try {
        const trunkSha = await this.readTrunkSha();
        await run('git', ['merge-base', '--is-ancestor', sha, trunkSha], {
          cwd: projectDir,
        });
        return true;
      } catch (error) {
        if (error?.code === 1) return false;
        throw error;
      }
    },
  };
  return {
    listIssueRecords: listRecords,
    listConvergenceRecords: () => listRecords(1381),
    listOwnerRecords: () => listRecords(939),
    appendConvergenceRecord: ({ body }) => appendRecord({ issue: 1381, body }),
    appendOwnerRecord: ({ body }) => appendRecord({ issue: 939, body }),
    observeLedger: ({ payload }) => observeIncidentLedgerLive(payload, liveObservationDeps),
    liveObservationDeps,
    async authenticate() {
      const { stdout } = await run('gh', ['api', 'user', '--include']);
      const raw = String(stdout || '');
      const jsonStart = raw.indexOf('{');
      if (jsonStart < 0) throw new Error('delivery-incident:authentication');
      const login = JSON.parse(raw.slice(jsonStart)).login;
      return { login };
    },
  };
}

export async function verbIncidentLedger(ctx, deps = {}) {
  const parsed = parseIncidentLedgerArgs(ctx?.rest || []);
  const runtime = deps.runtime || createProductionRuntime(ctx);
  if (parsed.mode === 'record') {
    const read = deps.readFile || readFile;
    const payload = JSON.parse(await read(parsed.recordPath, 'utf8'));
    const record = deps.recordLedger || recordIncidentLedger;
    const result = await record({
      repository: ctx.cfg.repo,
      convergenceIssue: parsed.issueNumber,
      payload,
      deps: runtime,
    });
    console.log(JSON.stringify(result));
    return result;
  }
  const approve = deps.approveLedger || approveIncidentLedger;
  const result = await approve({
    repository: ctx.cfg.repo,
    convergenceIssue: parsed.issueNumber,
    ledgerId: parsed.ledgerId,
    ledgerDigest: parsed.ledgerDigest,
    deps: runtime,
  });
  console.log(JSON.stringify(result));
  return result;
}
