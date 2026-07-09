// @story #758
// The move-invariant auditor (Design §8/§10). Enforcement-by-detection: the
// #361 layers (MarkerLossError, the Bash gh-edit-guard) only fire when a write
// goes THROUGH the tooling. A wrapper script or a raw GitHub Projects API call
// that flips `Status` directly bypasses all of them — the board moves, no saga
// runs, no `aitm-move-complete` sentinel is written. This auditor does not
// depend on the write being cooperative: it treats the saga-written markers as
// the verified truth and flags any board Status that lacks matching provenance.
//
// The invariant is `sentinel ⟺ Status ⟺ markers`. Three signals:
//   boardState     the authoritative live Status field (also the one an
//                  out-of-band actor can move without our tooling).
//   recordedState  `aitm-last-known-state`, stamped by the saga success path.
//   sentinelState  `aitm-move-complete`, written LAST by the saga — the
//                  strongest proof a move actually completed through the saga.
//
// `classifyMoveInvariants` and `planReconcile` are PURE (no I/O), so the unit
// test drives them fully offline. `auditMoveInvariants` is the injectable-I/O
// seam that bind + pull-next call.

import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { readMoveCompleteState } from './move-state/sentinel.mjs';

/**
 * Pure classifier over the three location signals.
 *
 * Clean is checked FIRST and unconditionally: when the sentinel vouches for the
 * board (`boardState === sentinelState`) the move is legitimate even if the
 * recordedState marker lags a step — which is what keeps a real saga move from
 * being false-flagged (AC4). Only when the sentinel disagrees with the board do
 * we treat the board as the suspect, and only reconcile toward the sentinel —
 * never the other way around.
 *
 * @param {{boardState:string, recordedState:string, sentinelState:string}} s
 * @returns {{ok:boolean, drift:'none'|'out-of-band'|'indeterminate',
 *   boardState:string, recordedState:string, sentinelState:string,
 *   reconcileAction:'none'|'revert-to-sentinel'|'report-only', message:string}}
 */
export function classifyMoveInvariants({ boardState, recordedState, sentinelState } = {}) {
  const board = boardState || '';
  const recorded = recordedState || '';
  const sentinel = sentinelState || '';
  const base = { boardState: board, recordedState: recorded, sentinelState: sentinel };

  // Clean: the sentinel — the saga's last write — agrees with the live board.
  if (board && sentinel && board === sentinel) {
    return {
      ...base,
      ok: true,
      drift: 'none',
      reconcileAction: 'none',
      message: `#move-invariants ok: Status "${board}" matches the move-complete sentinel.`,
    };
  }

  // A sentinel exists but disagrees with the board ⇒ the board sits at a state
  // the saga never stamped: an out-of-band bypass. The verified truth is the
  // sentinel; reconcile by reverting the board back to it.
  if (sentinel && board !== sentinel) {
    return {
      ...base,
      ok: false,
      drift: 'out-of-band',
      reconcileAction: 'revert-to-sentinel',
      message:
        `#move-invariants OUT-OF-BAND: Status is "${board}" but the last saga-verified ` +
        `state (move-complete sentinel) is "${sentinel}" — no saga produced this move. ` +
        `Reconcile by reverting Status to "${sentinel}" (verified truth); a re-run of the ` +
        `saga is the only honest way to land "${board}".`,
    };
  }

  // No sentinel at all (legacy issue predating the saga, or one never moved
  // through it) and the board disagrees with the record. We cannot prove truth
  // either way, so we report and touch nothing — never fabricate provenance.
  return {
    ...base,
    ok: false,
    drift: 'indeterminate',
    reconcileAction: 'report-only',
    message:
      `#move-invariants indeterminate: Status "${board}" has no move-complete sentinel to ` +
      `vouch for it (recorded "${recorded || 'none'}"). Cannot auto-reconcile without ` +
      `fabricating provenance — reporting only.`,
  };
}

/**
 * Turn a drift verdict into an ordered list of concrete reconcile ops. The ONE
 * op this will never emit is a sentinel write for the board state: fabricating
 * `aitm-move-complete state=<boardState>` would launder a bypass into a forged
 * saga completion — exactly the dishonesty the epic exists to prevent (AC3).
 *
 * @param {ReturnType<typeof classifyMoveInvariants>} verdict
 * @returns {Array<{op:string, to?:string}>}
 */
export function planReconcile(verdict) {
  if (!verdict || verdict.reconcileAction === 'revert-to-sentinel') {
    if (verdict && verdict.sentinelState) {
      return [{ op: 'set-status', to: verdict.sentinelState }];
    }
  }
  return [];
}

/** Render a one-block operator readout from a verdict (+ its reconcile plan). */
export function formatAuditReadout({ issueNumber, verdict }) {
  if (verdict.ok) {
    return `✓ #${issueNumber} move-invariants: Status "${verdict.boardState}" verified by sentinel.`;
  }
  const banner =
    verdict.drift === 'out-of-band'
      ? `⚠ #${issueNumber} OUT-OF-BAND Status drift`
      : `⚠ #${issueNumber} move-invariants indeterminate`;
  const lines = [
    banner,
    `  board       : ${verdict.boardState || '(none)'}`,
    `  recorded    : ${verdict.recordedState || '(none)'}`,
    `  sentinel    : ${verdict.sentinelState || '(none)'}`,
    `  ${verdict.message}`,
  ];
  const ops = planReconcile(verdict);
  if (ops.length) {
    lines.push(
      `  recommend   : reconcile revert-to-sentinel #${issueNumber} (set Status → "${verdict.sentinelState}")`
    );
  }
  return lines.join('\n');
}

async function defaultFetchBody({ cfg, issueNumber, deps = {} }) {
  const gqlFn = deps.gql || gql;
  const splitRepoFn = deps.splitRepo || splitRepo;
  const { owner, repoName } = splitRepoFn(cfg.repo);
  const data = await gqlFn(
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

async function defaultReadBoardState({ issueNumber }) {
  const mod = await import('../task-tracker.mjs');
  return mod.getIssueBoardState(String(issueNumber).replace(/^#/, ''));
}

/**
 * The injectable-I/O seam bind + pull-next call. Composes the three readers into
 * the pure classifier and returns `{ verdict, readout }`. Never throws for a
 * drift result — a bad audit read resolves to an `error`-flavoured verdict so a
 * caller can stay best-effort.
 *
 * @param {{issueNumber:number|string, cfg:object, deps?:object}} args
 */
export async function auditMoveInvariants({ issueNumber, cfg, deps = {} } = {}) {
  const fetchBody = deps.fetchBody || ((a) => defaultFetchBody({ ...a, deps }));
  const readBoardState = deps.readBoardState || defaultReadBoardState;
  const readRecordedState = deps.readRecordedState || readLastKnownState;
  const readSentinelState = deps.readSentinelState || readMoveCompleteState;

  let body;
  let boardState;
  try {
    [body, boardState] = await Promise.all([
      fetchBody({ cfg, issueNumber }),
      readBoardState({ issueNumber, cfg }),
    ]);
  } catch (err) {
    const verdict = {
      ok: false,
      drift: 'error',
      boardState: '',
      recordedState: '',
      sentinelState: '',
      reconcileAction: 'report-only',
      message: `#move-invariants audit read failed: ${err.message}`,
    };
    return {
      verdict,
      readout: `⚠ #${issueNumber} move-invariants: audit read failed (${err.message})`,
    };
  }

  const recorded = readRecordedState(body) || {};
  const verdict = classifyMoveInvariants({
    boardState: boardState || '',
    recordedState: recorded.state || '',
    sentinelState: readSentinelState(body) || '',
  });
  return { verdict, readout: formatAuditReadout({ issueNumber, verdict }) };
}

/**
 * Best-effort wiring seam for bind + pull-next. Runs the auditor, prints the
 * readout, and returns the verdict — but NEVER throws and never mutates the
 * board: a drift report must not break a bind or a pull-next. On `out-of-band`
 * drift the readout already carries the recommended `reconcile` command; we do
 * not auto-apply it here (bind/pull-next stay read-only). Clean verdicts are
 * silent unless `verbose` is set, so the happy path adds no noise.
 *
 * @param {{issueNumber:number|string, cfg:object, deps?:object,
 *   verbose?:boolean, log?:Function, warn?:Function}} args
 * @returns {Promise<ReturnType<typeof classifyMoveInvariants>|null>}
 */
export async function runMoveInvariantAudit({
  issueNumber,
  cfg,
  deps = {},
  verbose = false,
  log = console.log,
  warn = (m) => process.stderr.write(`${m}\n`),
} = {}) {
  if (!cfg?.repo || issueNumber == null) return null;
  try {
    const { verdict, readout } = await auditMoveInvariants({ issueNumber, cfg, deps });
    if (verdict.drift === 'error') return verdict; // swallow read errors silently
    if (!verdict.ok) warn(readout);
    else if (verbose) log(readout);
    return verdict;
  } catch {
    // A best-effort audit must never abort the operation it decorates.
    return null;
  }
}
