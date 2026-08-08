// #887 — `/task epic-reconcile [<N>]` records that an epic's Acceptance Criteria
// have been reconciled against what its children actually delivered.
//
// An epic's ACs are written at decomposition time, when its children are still
// proposals. By the time the last child lands, delivery has usually drifted from
// description — so the epic's own acceptance is staler than anything else on the
// board precisely when it is about to be relied on. `gateCodeComplete` refuses
// develop-exit for an epic without this marker.
//
// The stamp is DELIBERATELY not wired into any promote path. Epic #883's
// decision 1 makes reconciliation a distinct act the operator performs; a verb
// that some transition called automatically would reintroduce exactly the
// never-revisited state the marker exists to detect.
//
// Refusing a non-epic target is not decoration either: it stops the marker
// decaying into a generic "I looked at this" stamp and losing its epic-only
// meaning.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadState } from '../state.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { setDeliverablePosted, setEpicAcReconciled, parseIssueKind } from '../lib/issue-kind.mjs';
import { fetchEpicChildren } from '../lib/epic-children-gate.mjs';
import { bijectionReport, formatBijectionReport } from '../lib/epic-ac-child-bijection.mjs';
import { parseFromCommentArg } from '../lib/deep-dive.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexecDefault = promisify(execFile);

function epicReconcileError(category) {
  return new TypeError(`epic-reconcile:${category}`);
}

export function parseEpicReconcileArgs(argv = [], state = {}) {
  const args = (argv || []).map((arg) => String(arg).trim()).filter(Boolean);
  let target = null;
  let deliverableComment = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (/^#?\d+$/.test(arg)) {
      if (target !== null) throw epicReconcileError('target');
      target = arg.replace(/^#/, '');
      continue;
    }
    if (arg === '--deliverable-comment') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw epicReconcileError('deliverable-comment');
      }
      if (deliverableComment !== null) throw epicReconcileError('deliverable-comment');
      deliverableComment = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--deliverable-comment=')) {
      const value = arg.slice('--deliverable-comment='.length);
      if (!value || deliverableComment !== null) {
        throw epicReconcileError('deliverable-comment');
      }
      deliverableComment = value;
      continue;
    }
    throw epicReconcileError('unknown');
  }

  if (target === null) {
    const active = String(state?.active || '').replace(/^#/, '');
    if (!active || active === 'discover') throw epicReconcileError('target');
    target = active;
  }
  if (!/^\d+$/.test(target)) throw epicReconcileError('target');
  return deliverableComment === null ? { target } : { target, deliverableComment };
}

export function validateEpicDeliverableComment({
  repository,
  issueNumber,
  commentId,
  comment,
} = {}) {
  const body = typeof comment?.body === 'string' ? comment.body : '';
  if (body.trim() === '') throw new TypeError('epic-deliverable-comment:empty');
  const url = typeof comment?.html_url === 'string' ? comment.html_url : '';
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)#issuecomment-(\d+)$/.exec(
    url
  );
  if (!match) throw new TypeError('epic-deliverable-comment:url');

  const [owner, name] = String(repository || '').split('/');
  if (
    !owner ||
    !name ||
    match[1].toLowerCase() !== owner.toLowerCase() ||
    match[2].toLowerCase() !== name.toLowerCase()
  ) {
    throw new TypeError('epic-deliverable-comment:repository');
  }
  if (Number(match[3]) !== Number(issueNumber)) {
    throw new TypeError('epic-deliverable-comment:issue');
  }
  if (commentId !== undefined && match[4] !== String(commentId)) {
    throw new TypeError('epic-deliverable-comment:id');
  }
  return { body, url };
}

async function defaultFetchDeliverableComment({ repository, commentId, pexec }) {
  const [owner, name] = String(repository || '').split('/');
  if (!owner || !name) throw epicReconcileError('repository');
  const run = pexec || pexecDefault;
  const { stdout } = await run(
    'gh',
    ['api', `repos/${owner}/${name}/issues/comments/${commentId}`, '--jq', '{body,html_url}'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  try {
    return JSON.parse(stdout || '{}');
  } catch {
    throw new TypeError('epic-deliverable-comment:json');
  }
}

export async function verbEpicReconcile(ctx) {
  const { cfg, statePath, rest, pexec, deps = {} } = ctx;
  let state = {};
  if (statePath) state = loadState(statePath);
  const { target, deliverableComment } = parseEpicReconcileArgs(rest, state);
  const stamp = typeof deps.now === 'function' ? deps.now() : new Date().toISOString();

  let deliverable = null;
  if (deliverableComment !== undefined) {
    const commentId = parseFromCommentArg(deliverableComment);
    const fetchDeliverableComment = deps.fetchDeliverableComment || defaultFetchDeliverableComment;
    const comment = await fetchDeliverableComment({
      repository: cfg.repo,
      commentId,
      pexec,
    });
    deliverable = validateEpicDeliverableComment({
      repository: cfg.repo,
      issueNumber: Number(target),
      commentId,
      comment,
    });
  }

  let refused = null;
  let reconciledBody = null;
  const mutateIssueBodyFn = deps.mutateIssueBody || mutateIssueBody;
  await mutateIssueBodyFn({
    issueNumber: target,
    repo: cfg.repo,
    deps: { pexec },
    mutate: (base) => {
      reconciledBody = base;
      const kind = parseIssueKind(base);
      if (kind !== 'epic') {
        // Refuse by returning the body unchanged — `mutateIssueBody` owns the
        // write, so the guard belongs inside the same transaction that read the
        // live body rather than in a separate fetch that could race it.
        refused = kind;
        return base;
      }
      let next = setEpicAcReconciled(base, stamp);
      if (deliverable) {
        next = setDeliverablePosted(next, { url: deliverable.url, ts: stamp });
      }
      reconciledBody = next;
      return next;
    },
  });

  if (refused) {
    console.error(
      `[task-tracker] epic-reconcile: #${target} is kind "${refused}", not "epic" — AC reconciliation is epic-only. Run \`/task kind ${target} epic\` first if this really is a container epic.`
    );
    process.exit(1);
  }

  console.log(
    `[task-tracker] ✓ #${target} AC-reconciled: epic goals re-read against delivered children.`
  );
  if (deliverable) {
    console.log(`[task-tracker] ✓ #${target} deliverable recorded: ${deliverable.url}`);
  }

  // #889 — the bijection report prints HERE, at the one moment it is actionable.
  // #887 made develop-exit depend on the operator asserting they re-read the
  // epic's ACs against what shipped, but handed them nothing to read; naming the
  // ACs with no child and the children with no AC is what turns the stamp from
  // ceremony into a decision. Advisory by design — see the module header. Its
  // failure is swallowed for the same reason: an advisory that can break the
  // stamp it advises would be a gate wearing a report's clothes.
  try {
    const fetchEpicChildrenFn = deps.fetchEpicChildren || fetchEpicChildren;
    const children = await fetchEpicChildrenFn({
      cfg,
      parentEpicNumber: target,
      deps: { pexec },
    });
    const text = formatBijectionReport(bijectionReport({ body: reconciledBody, children }), {
      issueNumber: target,
    });
    if (text) console.log(text);
  } catch (err) {
    console.log(`[task-tracker] AC↔child bijection report unavailable: ${err.message}`);
  }
}
