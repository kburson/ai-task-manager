// `approve` verb — Review -> Done human gate.
//
// Records human review approval on an issue by appending a hidden marker to
// the issue body. `verbClose` reads the marker; without it (and with
// `gateReviewToDone=true`), close refuses.
//
// Idempotent: re-invocation with the marker already present is a no-op.
// Refuses if the issue is not in `review` state.

// cspell:ignore optout optouts Optouts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { getProjectDir } from '../paths.mjs';
import { durableWordMarker } from '../state.mjs';
import {
  buildReviewApprovedMarker,
  hasReviewApprovedMarker,
  insertReviewApprovedMarker,
  insertFullAutoFootnote,
  removeFullAutoFootnote,
  REVIEW_APPROVED_RE,
  parseDodVerifiedMarker,
} from '../lib/markers.mjs';
import {
  tickLifecycleItem,
  untickLifecycleItem,
  parseLifecycleOptouts,
  lifecycleItemState,
} from '../lib/lifecycle-dod.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { buildReviewNotesComment } from '../lib/review-notes.mjs';
import { deriveDrivers } from '../lib/derive-drivers.mjs';
import { isFullAuto } from '../lib/human-reviewer-audit.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { assertMarkerPersisted } from '../lib/stamp-verify.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import { agentReviewIncompleteReason } from '../lib/agent-review/review-gate.mjs';
import {
  deriveReviewAuthority,
  parseReviewAuthority,
  serializeReviewInvalidation,
} from '../lib/review-authority.mjs';
import { serializeMarker } from '../lib/marker-grammar.mjs';

const pexec = promisify(execFile);

// Approval binds the exact current proof to the versioned body used for the
// write. A retry could otherwise rebase a prepared approval onto a body whose
// proof changed during the conflict, so this proof-bearing write fails closed.
export const APPROVAL_STAMP_MAX_RETRIES = 1;

// Re-exports for back-compat with existing tests/callers that imported the
// helpers from this module before the centralization in lib/markers.mjs.
export const buildMarker = buildReviewApprovedMarker;
export const hasApprovalMarker = hasReviewApprovedMarker;
export const insertApprovalMarker = insertReviewApprovedMarker;

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

// #295 — closure-form body write; mutate is reapplied against the FRESH base
// on every push attempt, preserving concurrent writes.
async function defaultMutateIssueBody({
  issueNumber,
  repo,
  mutate,
  allowUnverifiedTicks,
  maxRetries,
}) {
  return mutateIssueBody({
    issueNumber,
    repo,
    mutate,
    deps: { pexec },
    allowUnverifiedTicks,
    maxRetries,
  });
}

async function defaultGetBoardState({ issueNumber, projectDir: _projectDir }) {
  const mod = await import('../task-tracker.mjs');
  return mod.getIssueBoardState(String(issueNumber).replace(/^#/, ''));
}

async function defaultPostComment({ issueNumber, repo, body }) {
  await pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

async function defaultFetchComments({ issueNumber, repo }) {
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'comments'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed.comments) ? parsed.comments : [];
  } catch {
    return [];
  }
}

async function defaultProjectValues({ cfg, issueNumber }) {
  if (!cfg?.projectId) return {};
  try {
    const { projectValuesForIssue } = await import('../../gh/lib/github-projects.mjs');
    const { loadProjectFieldDefs } = await import('../project-fields.mjs');
    const fieldDefs = loadProjectFieldDefs();
    return await projectValuesForIssue({ cfg, fieldDefs, issueNumber });
  } catch {
    return {};
  }
}

// Prompt the reviewer for driver bullets via stdin. One bullet per line; blank
// line ends input. Returns string[]. Empty input is allowed.
async function defaultPromptDrivers() {
  return new Promise((resolve) => {
    if (!process.stdin || process.stdin.isTTY !== true) {
      resolve([]);
      return;
    }
    process.stderr.write(
      'Enter Review Notes drivers, one bullet per line. Blank line to finish:\n'
    );
    const out = [];
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim() === '') {
          process.stdin.off('data', onData);
          process.stdin.pause();
          resolve(out);
          return;
        }
        out.push(line.trim());
      }
    };
    process.stdin.on('data', onData);
    process.stdin.resume();
  });
}

// #156 / #177 — Detect "no human in the loop" so the approve verb can stamp
// an audit marker that flags machine-generated approvals. Unified with the
// audit-comment path (`enforceFullAutoAudit`) via the shared `isFullAuto`
// predicate, anchored on absence of `TASK_TRACKER_HUMAN_REVIEWER` — the only
// signal an operator sets explicitly. Legacy OR-signals are retained so
// explicit-override paths (CI runners, scripted approvals, fleet
// orchestration) keep working:
//   - `TT_FULL_AUTO=1` (explicit, set by fleet/orchestrator)
//   - `process.stdin.isTTY === false` (headless inference)
//   - `CI=1` (generic CI flag)
// If any fires, we record which ones via the signals string so the audit
// trail explains its own confidence later. `env` defaults to process.env;
// `tty` defaults to process.stdin.isTTY so tests can stub.
export function detectFullAuto({ env = process.env, tty = process.stdin?.isTTY } = {}) {
  const reviewerUnset = isFullAuto(env);
  const envOn = env.TT_FULL_AUTO === '1';
  const ttyOff = tty === false;
  const ciOn = env.CI === '1' || env.CI === 'true';
  const fired = reviewerUnset || envOn || ttyOff || ciOn;
  if (!fired) return { fired: false, signals: '' };
  const parts = [
    `reviewer-unset=${reviewerUnset ? 1 : 0}`,
    `env=${envOn ? 1 : 0}`,
    `tty=${ttyOff ? 0 : 1}`,
    `ci=${ciOn ? 1 : 0}`,
  ];
  return { fired: true, signals: parts.join(',') };
}

function deriveAuthorityForBody(body) {
  // The Test/DoD evidence is the authority source for a versioned proof. The
  // legacy fallback only lets the reducer classify a legacy marker as stale;
  // callers still require an epoch-bound matching proof before no-op or stamp.
  const verifiedSha = parseDodVerifiedMarker(body)?.sha || 'legacy';
  return { ...deriveReviewAuthority(body, { verifiedSha }), verifiedSha };
}

function hasCurrentPassingProof(authority) {
  return Boolean(
    authority.epoch &&
    authority.proof?.epoch === authority.epoch &&
    authority.proof.result === 'pass' &&
    authority.proof.sha &&
    authority.proof.sha === authority.verifiedSha &&
    !authority.reasons.includes('verified-sha-mismatch')
  );
}

function shouldArchiveApproval(authority) {
  return Boolean(authority.approval && (authority.status === 'stale' || authority.approval.legacy));
}

function serializeApprovalHistory(approval, ts) {
  const props = {
    schema: '1',
    ts: approval.ts,
    provenance: approval.provenance,
    'archived-at': ts,
  };
  if (approval.legacy) props.legacy = 'yes';
  else {
    props.epoch = approval.epoch;
    props['proof-sha'] = approval.proofSha;
  }
  if (approval.provenance === 'full-auto') props.signals = approval.signals;
  return serializeMarker('review-approval-history', props);
}

function replaceUnfencedApprovalMarkers(body, approvals, ts) {
  const lines = String(body || '').split(/(\n)/);
  let fence = null;
  let approvalIndex = 0;
  const markerRe = new RegExp(REVIEW_APPROVED_RE.source, 'gi');
  return lines
    .map((line) => {
      const opener = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!fence && opener) {
        fence = { char: opener[1][0], length: opener[1].length };
        return line;
      }
      if (fence) {
        const closer = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
        if (closer && closer[1][0] === fence.char && closer[1].length >= fence.length) fence = null;
        return line;
      }
      return line.replace(markerRe, () => {
        const approval = approvals[approvalIndex++];
        return approval ? serializeApprovalHistory(approval, ts) : '';
      });
    })
    .join('');
}

function archiveStaleApprovals(body, ts) {
  const parsed = parseReviewAuthority(body);
  const approvals = parsed.approvals;
  if (approvals.length === 0) return body;
  let updated = replaceUnfencedApprovalMarkers(body, approvals, ts);
  updated = removeFullAutoFootnote(updated);
  updated = untickLifecycleItem(updated, 'passed-final-review');
  const invalidatedEpochs = new Set(
    approvals.filter((approval) => approval.epoch).map((a) => a.epoch)
  );
  const latestEpoch = [...parsed.epochs].sort((a, b) => a.visit - b.visit).at(-1)?.epoch;
  if (approvals.some((approval) => approval.legacy) && latestEpoch)
    invalidatedEpochs.add(latestEpoch);
  for (const epoch of invalidatedEpochs) {
    updated = `${updated.replace(/\s*$/, '')}\n${serializeReviewInvalidation({
      epoch,
      ts,
      reason: 'approval-refreshed',
    })}\n`;
  }
  return updated;
}

export async function runApprove({ issueNumber, cfg, projectDir, deps = {}, human = false } = {}) {
  if (!issueNumber) throw new Error('approve: issueNumber is required');
  if (!cfg) throw new Error('approve: cfg is required');
  const assertBound = deps.assertBound ?? assertBoundToIssue;
  assertBound(issueNumber);

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const getBoardState = deps.getBoardState || defaultGetBoardState;
  const nowIso = deps.nowIso || (() => new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
  const detect = deps.detectFullAuto || detectFullAuto;
  const postComment = deps.postComment || defaultPostComment;
  const fetchComments = deps.fetchComments || defaultFetchComments;
  const fetchProjectValues = deps.fetchProjectValues || defaultProjectValues;
  const promptDrivers = deps.promptDrivers || defaultPromptDrivers;
  const derive = deps.deriveDrivers || deriveDrivers;

  const state = await getBoardState({ issueNumber, projectDir });
  if (state !== 'review') {
    return {
      status: 'wrong-state',
      message: `#${issueNumber} is in '${state ?? 'unknown'}', expected 'review' — approve only applies to issues in Review.`,
    };
  }

  return withIssueLock(
    { issue: issueNumber, verb: 'approve', projDir: projectDir || getProjectDir() },
    async () => {
      let body = await fetchIssueBody({ issueNumber, repo: cfg.repo });
      let authority = deriveAuthorityForBody(body);
      if (authority.status === 'current' && hasCurrentPassingProof(authority)) {
        return { status: 'already-approved' };
      }
      // A stale approval must be retained as auditable history and explicitly
      // invalidated before we consider a replacement. This prevents a stale
      // lifecycle tick or Full-Auto footnote from being mistaken for current
      // human authority while the current Review still lacks a passing proof.
      if (shouldArchiveApproval(authority)) {
        const archiveResult = await mutateBody({
          issueNumber,
          repo: cfg.repo,
          mutate: (base) => {
            const freshAuthority = deriveAuthorityForBody(base);
            return shouldArchiveApproval(freshAuthority)
              ? archiveStaleApprovals(base, nowIso())
              : base;
          },
          allowUnverifiedTicks: true,
          maxRetries: APPROVAL_STAMP_MAX_RETRIES,
        });
        body = archiveResult.body;
        authority = deriveAuthorityForBody(body);
        if (authority.status === 'current' && hasCurrentPassingProof(authority)) {
          return { status: 'already-approved' };
        }
      }
      // #881 — the human approval is the Review → Done EXIT condition, offered
      // only once the Review state's ACTION (the Agent Review Gate) has completed
      // with `result="pass"`. Refuse while it is incomplete or failing, so a human
      // is never asked to sign off on a story the agent has not signed off on
      // (observed on #878, where the gate ran only after the human was asked).
      if (!hasCurrentPassingProof(authority)) {
        const reason = authority.epoch ? 'review-incomplete' : agentReviewIncompleteReason(body);
        return {
          status: 'agent-review-incomplete',
          reason,
          message:
            reason === 'review-failed'
              ? `#${issueNumber} carries an \`aitm-review-failed\` marker — the Agent Review Gate objected and its objections are unresolved. Fix them in place, then re-run \`/task review #${issueNumber}\` before approving.`
              : `#${issueNumber} has no passing Agent Review evidence — the Review state's action has not completed. Run \`/task review #${issueNumber}\` first; the human approval is the exit condition, not the action.`,
        };
      }
      const ts = nowIso();
      // #979 — env-only Full-Auto detection misclassifies a genuinely
      // human-approved review whenever `TASK_TRACKER_HUMAN_REVIEWER` is
      // unset. Two independent signals prove a human already reviewed this
      // issue regardless of env/tty/CI state: the "Passed final human
      // review" lifecycle box was already ticked (GitHub-UI approval before
      // approve ran), or the caller passed `--human` (chat-relayed approval
      // that never touched the UI). Either short-circuits `detect()` so the
      // marker/footnote stay non-full-auto.
      const preTickedByHuman =
        authority.status !== 'stale' &&
        lifecycleItemState({
          body,
          key: 'passed-final-review',
        }).alreadyTicked;
      const humanOverride = preTickedByHuman || Boolean(human);
      const auto = humanOverride ? { fired: false, signals: '' } : detect();

      // D1 — post `### 📝 Review Notes` comment BEFORE the approval marker so the
      // delta-comment in `close` can consume it. Human mode prompts stdin; full-
      // auto mode derives from observable signals. Either may yield zero drivers;
      // that's fine — the renderer omits the Drivers section when empty.
      let drivers = [];
      let notesSource = null;
      try {
        if (auto.fired) {
          const [comments, fields] = await Promise.all([
            fetchComments({ issueNumber, repo: cfg.repo }),
            fetchProjectValues({ cfg, issueNumber }),
          ]);
          drivers = derive({ body, comments, fields });
          notesSource = 'auto';
        } else {
          drivers = await promptDrivers();
          notesSource = 'human';
        }
        if (drivers.length > 0 || notesSource === 'auto') {
          const noteBody = buildReviewNotesComment(drivers, { source: notesSource });
          await postComment({ issueNumber, repo: cfg.repo, body: noteBody });
        }
      } catch (err) {
        process.stderr.write(`⚠ approve: review-notes post failed: ${err.message}\n`);
      }

      // #295 — re-derive everything inside the closure on the FRESH base so
      // a concurrent writer landing between our pre-fetch (`body`) and the
      // push is preserved. The pre-fetched `body` is only used above for the
      // gate (hasApprovalMarker / state check / drivers derivation); the
      // actual write transform reads its own base.
      let preparedCanStamp = false;
      let preparedAlreadyApproved = false;
      const stamp = (base) => {
        const freshAuthority = deriveAuthorityForBody(base);
        if (freshAuthority.status === 'current' && hasCurrentPassingProof(freshAuthority)) {
          preparedAlreadyApproved = true;
          return base;
        }
        preparedCanStamp = hasCurrentPassingProof(freshAuthority);
        if (!preparedCanStamp) return base;
        // #480 — single consolidated marker: the full-auto audit props ride on
        // `aitm-review-approved` itself, replacing the separate hidden
        // `aitm-full-auto-approved` marker. The visible footnote stays as a
        // human-readable audit signal.
        let updated = base;
        if (shouldArchiveApproval(freshAuthority)) updated = archiveStaleApprovals(updated, ts);
        updated = freshAuthority.epoch
          ? insertApprovalMarker(updated, ts, {
              epoch: freshAuthority.epoch,
              proofSha: freshAuthority.proof.sha,
              provenance: auto.fired ? 'full-auto' : 'human',
              signals: auto.fired ? auto.signals : '',
            })
          : updated;
        if (auto.fired) {
          updated = insertFullAutoFootnote(updated, { ts, signals: auto.signals });
        }
        return tickLifecycleItem(updated, 'passed-final-review');
      };
      // Diagnostic-only: compute against the pre-fetched body to surface the
      // legacy-DoD warning. This duplicates the early transform but is
      // observability rather than correctness — the closure above is the
      // authoritative write.
      let updated = body;
      if (shouldArchiveApproval(authority)) updated = archiveStaleApprovals(updated, ts);
      if (hasCurrentPassingProof(authority)) {
        updated = insertApprovalMarker(updated, ts, {
          epoch: authority.epoch,
          proofSha: authority.proof.sha,
          provenance: auto.fired ? 'full-auto' : 'human',
          signals: auto.fired ? auto.signals : '',
        });
      }
      if (auto.fired) {
        updated = insertFullAutoFootnote(updated, { ts, signals: auto.signals });
      }
      const beforeTick = updated;
      updated = tickLifecycleItem(updated, 'passed-final-review');
      // #302 — distinguish "label genuinely missing" (warn) from "box already
      // ticked" (silent happy path). Both produce a no-op write, but only the
      // former is a signal the operator's DoD has diverged from the template.
      const state = lifecycleItemState({ body: beforeTick, key: 'passed-final-review' });
      const optouts = parseLifecycleOptouts(beforeTick);
      if (!state.labelFound && !optouts.has('passed-final-review')) {
        process.stderr.write(
          `approve: lifecycle-tick-noop: 'passed-final-review' label not matched — body may use legacy heading or customized DoD\n`
        );
        try {
          const { buildRow: _br, postTimingEvent: _pe } = await import('../gh-timing-comment.mjs');
          const { deriveStateMoveDelta: _dsm } = await import('../lib/timing-rows.mjs');
          const _ts = new Date().toISOString();
          const _d = _dsm(beforeTick, _ts);
          await _pe({
            issueNumber,
            repo: cfg.repo,
            timeoutMs: 3000,
            row: _br({
              ts: _ts,
              event: 'lifecycle-warn',
              activeSec: _d.activeSec,
              idleSec: _d.idleSec,
              deltaWords: 0,
              // #475 AC1 — carried-forward durable marker (lifecycle-noop warning, no active session work)
              wordMarker: durableWordMarker(getProjectDir()),
              description: `WARN: lifecycle-tick-noop 'passed-final-review' — customized DoD or legacy heading; stamp <!-- aitm-lifecycle-optout: passed-final-review --> to acknowledge.`,
            }),
          });
        } catch {
          /* fire-and-forget */
        }
      }
      // #363 — `stamp` ticks the "Passed final human review" lifecycle box.
      // The truth-bearing proof for that tick is the audit comment (posted
      // above as Review Notes) plus the `aitm-full-auto-approved` body marker
      // (Full-Auto) or the `aitm-review-approved` marker (human reviewer) —
      // not an inline `aitm-verified-at` HTML comment on the lifecycle row.
      // #362's checkbox-proof gate is designed to catch agent pre-ticks of
      // AC / Functional DoD boxes, not verb-driven lifecycle ticks. Stamping
      // an inline proof marker here would also break lifecycle-dod.mjs's
      // exact-label match. Bypass the gate scoped to this single call site.
      const writeResult = await mutateBody({
        issueNumber,
        repo: cfg.repo,
        mutate: stamp,
        allowUnverifiedTicks: true,
        maxRetries: APPROVAL_STAMP_MAX_RETRIES,
      });
      // #655 — read-back verification. The write call not throwing is NOT proof
      // the `aitm-review-approved` marker persisted (the #652 silent-success
      // failure). Inspect the verified live body the write path already fetched
      // and refuse to report `approved` unless the marker is actually present.
      // No extra GitHub round-trip: `writeResult.body` is the post-write verify
      // fetch (ok path) or the top-of-loop fetch (no-op / idempotent path).
      const persistedAuthority = deriveAuthorityForBody(writeResult.body);
      const persistedCurrent =
        persistedAuthority.status === 'current' && hasCurrentPassingProof(persistedAuthority);
      if (preparedAlreadyApproved) {
        if (!persistedCurrent) {
          throw new Error(`approve: current review authority did not persist for #${issueNumber}`);
        }
        return { status: 'already-approved' };
      }
      if (!preparedCanStamp) {
        const reason = agentReviewIncompleteReason(writeResult.body);
        return {
          status: 'agent-review-incomplete',
          reason,
          message: `#${issueNumber} has no current passing Agent Review evidence — run \`/task review #${issueNumber}\` before approving.`,
        };
      }
      assertMarkerPersisted({
        result: writeResult,
        predicate: (persistedBody) => {
          const currentAuthority = deriveAuthorityForBody(persistedBody);
          return currentAuthority.status === 'current' && hasCurrentPassingProof(currentAuthority);
        },
        marker: 'current aitm-review-approved',
        issueNumber,
      });
      if (!persistedCurrent) {
        throw new Error(`approve: current review authority did not persist for #${issueNumber}`);
      }
      return {
        status: 'approved',
        ts,
        fullAuto: auto.fired,
        signals: auto.signals,
        drivers,
        notesSource,
      };
    }
  );
}

export function parseArgs(rest) {
  const out = { issueNumber: null, human: false };
  for (const a of rest) {
    if (a === '--human') {
      out.human = true;
      continue;
    }
    const m = String(a).match(/^#?(\d+)$/);
    if (m && out.issueNumber === null) out.issueNumber = Number(m[1]);
  }
  return out;
}

export async function verbApprove(rest, cfg, deps = {}) {
  const { issueNumber, human } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: /task approve #N [--human]\n');
    process.exit(1);
  }
  if (process.env.TT_SKIP_NETWORK === '1') {
    process.stderr.write('approve: TT_SKIP_NETWORK set — refusing to run gate offline\n');
    process.exit(1);
  }
  const projectDir = getProjectDir();
  let result;
  try {
    result = await runApprove({ issueNumber, cfg, projectDir, deps, human });
  } catch (err) {
    if (err instanceof IssueLockError) {
      process.stderr.write(`⛔ ${err.message}\n`);
      process.exit(7);
    }
    process.stderr.write(`approve: ${err.message}\n`);
    process.exit(1);
  }
  switch (result.status) {
    case 'approved':
      process.stdout.write(
        `✓ Review approved for #${issueNumber} at ${result.ts}. \`/task close #${issueNumber}\` may now proceed.\n`
      );
      return;
    case 'already-approved':
      process.stdout.write(`#${issueNumber} already has a review-approval marker — no change.\n`);
      return;
    case 'wrong-state':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(3);
    // #881 — distinct exit code from `wrong-state`: the issue IS in Review, but
    // the state's action has not completed, so the exit condition is not offered.
    case 'agent-review-incomplete':
      process.stderr.write(`⛔ ${result.message}\n`);
      process.exit(6);
    default:
      process.stderr.write(`approve: unknown result: ${result.status}\n`);
      process.exit(1);
  }
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  const { loadConfig } = await import('../config.mjs');
  const cfg = loadConfig();
  await verbApprove(process.argv.slice(2), cfg);
}
