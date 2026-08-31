// @story #1117 #1455

import { withIssueLock } from '../issue-mutator-lock.mjs';
import { pexec } from '../../gh/lib/gh-client.mjs';
import {
  advanceActionLedgerHead,
  auditActionLedger,
  collectSupersededSpillHeads,
  reconcileActionLedger,
} from '../lib/resident-action-ledger-write.mjs';
import {
  fingerprint,
  parseBodyLedgerHead,
  parseEventComment,
  parseSpillHeadComment,
} from '../lib/resident-action-ledger-codec.mjs';

function usage() {
  throw new TypeError(
    'Usage: /task action-ledger #N <audit|gc|reconcile> [--comment <id>] [--accept-live --reason <text> --approved-by <login>]'
  );
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export function parseActionLedgerArgs(args = []) {
  const issue = Number(String(args[0] || '').replace(/^#/, ''));
  const mode = args[1];
  if (!Number.isInteger(issue) || issue < 1 || !['audit', 'gc', 'reconcile'].includes(mode))
    usage();
  if (mode === 'audit' && args.length === 2) return { issue, mode };
  if (mode === 'gc') {
    const commentId = valueAfter(args, '--comment');
    if (!commentId || args.length !== 4) usage();
    return { issue, mode, commentId };
  }
  const reason = valueAfter(args, '--reason');
  const approvedBy = valueAfter(args, '--approved-by');
  if (!args.includes('--accept-live') || !reason || !approvedBy) usage();
  return { issue, mode, acceptLive: true, reason, approvedBy };
}

function parseJson(stdout) {
  return JSON.parse(String(stdout || '').trim());
}

export function createActionLedgerRuntime(ctx, deps = {}) {
  const run = deps.run || pexec;
  const repository = ctx.cfg.repo;
  const issueBody = async (issue) => {
    const { stdout } = await run('gh', [
      'issue',
      'view',
      String(issue),
      '-R',
      repository,
      '--json',
      'body',
      '--jq',
      '.body',
    ]);
    return String(stdout).replace(/\n$/, '');
  };
  const readComment = async (_issue, id) => {
    const { stdout } = await run('gh', ['api', `repos/${repository}/issues/comments/${id}`]);
    const comment = parseJson(stdout);
    return { id: String(comment.id), body: comment.body };
  };
  const createComment = async (issue, body) => {
    const { stdout } = await run('gh', [
      'api',
      `repos/${repository}/issues/${issue}/comments`,
      '--method',
      'POST',
      '-f',
      `body=${body}`,
    ]);
    const comment = parseJson(stdout);
    return { id: String(comment.id), body: comment.body };
  };
  const fetchBody = async (_repo, issue) => issueBody(issue);
  const pushBody = async (_repo, issue, body) => {
    const pending = run(
      'gh',
      ['issue', 'edit', String(issue), '-R', repository, '--body-file', '-'],
      { input: body }
    );
    if (pending?.child?.stdin && pending.inputHandled !== true) pending.child.stdin.end(body);
    await pending;
  };
  const allComments = async (issue) => {
    const { stdout } = await run('gh', [
      'api',
      '--paginate',
      '--slurp',
      `repos/${repository}/issues/${issue}/comments`,
    ]);
    return parseJson(stdout)
      .flat()
      .map((comment) => ({ id: String(comment.id), body: comment.body }));
  };
  const common = { fetchBody, pushBody, readComment, createComment };
  return {
    audit: async ({ issue }) => {
      const comments = await allComments(issue);
      return auditActionLedger({
        listCommentsPage: async () => ({ comments, nextCursor: null }),
        inspectComment: (comment) => {
          try {
            const event = parseEventComment(comment.body);
            return { id: comment.id, kind: 'event', eventId: event.eventId, status: 'valid' };
          } catch {
            return { id: comment.id, kind: 'other', status: 'ignored' };
          }
        },
      });
    },
    gc: async ({ issue, commentId }) =>
      withIssueLock({ issue, verb: 'action-ledger-gc', projDir: ctx.projectDir }, async () => {
        const comments = await allComments(issue);
        const index = comments.findIndex((comment) => comment.id === String(commentId));
        const successor = index >= 0 ? comments[index + 1] : null;
        return collectSupersededSpillHeads({
          candidateCommentId: commentId,
          successorCommentId: successor?.id,
          readIssueBody: () => issueBody(issue),
          readComment: async (id) => comments.find((comment) => comment.id === String(id)),
          deleteComment: async (id) => {
            await run('gh', [
              'api',
              `repos/${repository}/issues/comments/${id}`,
              '--method',
              'DELETE',
            ]);
          },
        });
      }),
    reconcile: async ({ issue, approvedBy, reason }) => {
      const { stdout: userOut } = await run('gh', ['api', 'user', '--jq', '.login']);
      const authenticated = String(userOut).trim();
      if (!authenticated || authenticated.toLowerCase() !== approvedBy.toLowerCase()) {
        throw new Error('human-approval-identity-mismatch');
      }
      const body = await issueBody(issue);
      const bodyHead = parseBodyLedgerHead(body);
      if (!bodyHead) throw new Error('action-ledger-head-missing');
      let head = bodyHead;
      if (bodyHead.mode === 'spill') {
        const [id, expectedHash] = bodyHead.head.split(/:(?=sha256:)/);
        const comment = await readComment(issue, id);
        if (fingerprint(comment.body) !== expectedHash)
          throw new Error('action-ledger-head-damaged');
        head = parseSpillHeadComment(comment.body);
      }
      return reconcileActionLedger({
        issue,
        head,
        affectedActionIds: Object.keys(head.actions || {}),
        evidence: { acceptedLive: true },
        approvedBy,
        reason,
        deps: {
          ...common,
          withIssueLock: (options, operation) =>
            withIssueLock(
              { issue: options.issue, verb: 'action-ledger-reconcile', projDir: ctx.projectDir },
              operation
            ),
          advanceHead: ({ nextHead }) =>
            advanceActionLedgerHead({
              issue,
              repo: repository,
              expectedHead: bodyHead,
              nextHead,
              deps: common,
            }),
        },
      });
    },
  };
}

export async function verbActionLedger(ctx, deps = {}) {
  const parsed = parseActionLedgerArgs(ctx?.rest || []);
  const runtime = deps.runtime || createActionLedgerRuntime(ctx, deps);
  if (!runtime?.[parsed.mode]) throw new Error(`action-ledger-runtime:${parsed.mode}`);
  const result = await runtime[parsed.mode]({ ...parsed, repository: ctx.cfg.repo });
  if (!deps.quiet) console.log(JSON.stringify(result, null, 2));
  return result;
}
