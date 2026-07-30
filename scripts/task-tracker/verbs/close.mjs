import { randomUUID } from 'node:crypto';

import { loadState, saveState, clearActive } from '../state.mjs';
import { deregisterTask } from '../fleet-registry.mjs';
import { loadSession } from '../lib/session-store.mjs';
import { resolveGate } from '../lib/gate-resolve.mjs';
import { rawProjectConfig } from '../config.mjs';
import { currentSessionId } from '../word-counter.mjs';
import {
  checkDirty,
  formatSummary,
  shortAuditDescription,
  resolveWorkspaceForIssue,
  CLEANUP_GUIDANCE,
} from '../../gh/lib/dirty-workspace.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { assertVerbHomeState } from '../lib/verb-home-state-guard.mjs';
import { runDispose } from '../lib/close-disposition.mjs';
import { writeTerminalDisposition } from '../lib/terminal-disposition.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { isFullAuto } from '../lib/human-reviewer-audit.mjs';
import {
  detectLinkedWorktree,
  makeCloseTrunkRefResolver,
  enableFullAutoMergeForClose,
} from '../lib/full-auto-merge-execute.mjs';
import { tickLifecycleItem } from '../lib/lifecycle-dod.mjs';
import { assertLifecycleSatisfied } from '../close-gate.mjs';
import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { closeLabelRemoveArgs } from '../lib/close-labels.mjs';
import {
  decideCloseConvergence,
  decideBoardMoveFailure,
  decideGateEvalFailure,
  shouldEmitReviewApprovedRow,
  resolveBoardStateForClose,
} from '../lib/close-convergence.mjs';
import {
  deriveClosedIssueIntegrity,
  readUnauthorizedCloseRecovery,
  runClosedIssueConvergence,
  upsertUnauthorizedCloseRecovery,
} from '../lib/closed-issue-convergence.mjs';
import { resolveTailProfile } from '../lib/move-state/tail-profiles.mjs';

// #705 — best-effort: a label-strip failure must never block or fail the
// close itself, mirroring the deregisterTask cleanup calls below.
async function stripCloseLabels({ pexec, cfg, issueNum }) {
  try {
    await pexec('gh', [...closeLabelRemoveArgs(issueNum), '-R', cfg.repo], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } catch (err) {
    console.error(
      `[task-tracker] warn: failed to strip ToDo/BLOCKED labels on #${issueNum}: ${err.message}`
    );
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timingAuditHasExactTransaction(body, tx) {
  const exactTxField = new RegExp(`(?:^|[;\\s])tx=${escapeRegExp(tx)}(?=;|\\s|$)`);
  return String(body || '')
    .split('\n')
    .some((line) => {
      const cells = line.split('|');
      return String(cells[2] || '').trim() === 'unauthorized-close' && exactTxField.test(line);
    });
}

// #801 — emit the terminal `review:approved → issue:wrap` close pair, shared by
// BOTH the full close pipeline and the converge/no-op fast-path so the two can
// never drift apart. Historically only the full pipeline emitted the pair; an
// issue closed out-of-band (GitHub UI / Projects auto-close) then converged via
// `/task close` took the noop branch and returned before this block, leaving the
// per-issue Timing Log without its closing audit rows.
//
// Emission is idempotent (`pendingClosePairState` skips a half already present,
// so a re-run or a converge-after-normal-close is a no-op) and anti-fabrication
// safe: `review:approved` is emitted only when the caller reports a real approval
// marker OR an explicitly-bypassed review gate (`shouldEmitReviewApprovedRow`);
// `issue:wrap` is unconditional — it records the terminal close, not an approval.
async function emitReviewToDoneClosePair({
  closeTarget,
  closeIssueNum,
  cfg,
  body,
  reviewGateBypassed,
  lastWordMarker,
  ctx,
  SKIP_NETWORK,
  nowIso,
  safePostTiming,
}) {
  const { deriveStateMoveDelta } = await import('../lib/timing-rows.mjs');
  const ts = nowIso();
  // #692 — the prior timing ROWS live in the ⏱ comment, NOT the issue body, so
  // the delta must be derived from the comment. Fetch it once; it also drives the
  // retry-idempotency guard below. Gated on `!SKIP_NETWORK`; tests inject
  // `ctx.readTimingCommentBody` to exercise both paths offline.
  let timingBody = '';
  const { readTimingCommentBody, bodyOf } = await import('../gh-timing-comment.mjs');
  const readTiming = ctx.readTimingCommentBody || (SKIP_NETWORK ? null : readTimingCommentBody);
  if (readTiming && closeIssueNum) {
    try {
      timingBody = bodyOf(
        await readTiming({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          timeoutMs: GH_API_TIMEOUT_MS,
        })
      );
    } catch (err) {
      process.stderr.write(`⚠ timing-comment read for close pair failed: ${err.message}\n`);
    }
  }
  const delta = deriveStateMoveDelta(timingBody, ts);
  // #540 — emit in canonical order (`review:approved → issue:wrap`), both sharing
  // `ts`. The approval row carries the real review→close active/idle delta; the
  // wrap row is the zero-delta paired half.
  const { buildReviewToDoneClosePair } = await import('../gh-timing-comment.mjs');
  const [reviewApprovedRow, issueWrapRow] = buildReviewToDoneClosePair({
    ts,
    activeSec: delta.activeSec,
    idleSec: delta.idleSec,
    // #475 AC1 — carried-forward durable marker (timing flushed at Review; close audit row)
    wordMarker: lastWordMarker ?? 0,
  });
  const { pendingClosePairState } = await import('../timing-rollup.mjs');
  const pending = pendingClosePairState(timingBody);
  if (!pending.reviewApproved && shouldEmitReviewApprovedRow({ body, reviewGateBypassed })) {
    await safePostTiming(closeTarget, reviewApprovedRow);
  }
  if (!pending.issueWrap) {
    await safePostTiming(closeTarget, issueWrapRow);
  }
}

export async function verbClose(ctx) {
  const convergenceTailProfile = resolveTailProfile(
    ctx.convergenceTailProfile === undefined ? 'task-owner' : ctx.convergenceTailProfile
  ).name;
  // #561 — verbClose reads its collaborators from the grouped capability
  // objects assembled by buildContext (the narrow dependency interface) rather
  // than from a flat 18-member destructure. Each `?? ctx` fallback keeps the
  // verb runnable against a flat ctx (back-compat) and lets a fixture supply
  // only the capabilities a given code path actually touches.
  const projectConfig = ctx.projectConfig ?? ctx;
  const timingRecorder = ctx.timingRecorder ?? ctx;
  const stateRunner = ctx.stateRunner ?? ctx;
  const githubClient = ctx.githubClient ?? ctx;
  const issueBodyMutator = ctx.issueBodyMutator;
  const { cfg, statePath, projectDir, SKIP_NETWORK, pexec, uncheckedPreCloseCheckboxes, nowIso } =
    projectConfig;
  const { rest } = ctx;
  const { drainQueueIfAny, flushAndForgetQueueFor, safePostTiming } = timingRecorder;
  const { runMoveState, runMoveStateDone, runLogIssueTime } = stateRunner;
  const {
    fetchSubIssueBoardSnapshot,
    fetchSubIssues,
    getIssueBoardState,
    getIssueCloseSnapshot,
    getIssueClosedState,
  } = githubClient;
  const mutateBody = issueBodyMutator?.mutate;
  const dispositionWriter = ctx.writeTerminalDisposition || writeTerminalDisposition;
  const writeDeliveredOrRefuse = async ({ issueNumber, targetRef }) => {
    try {
      await dispositionWriter({
        cfg,
        issueNumber,
        disposition: 'Delivered',
      });
      return true;
    } catch (err) {
      console.error(
        `[task-tracker] ⛔ Refusing to close ${targetRef}: ${err.message}\n` +
          `   Issue left OPEN — run \`node scripts/gh/init-repair.mjs\` and retry.`
      );
      process.exitCode = 1;
      return false;
    }
  };
  // #753 — the lifecycle-box reconcile is invoked from BOTH the converge/no-op
  // fast-path and the full close pipeline, through one seam so a fixture can
  // observe it and the two call sites can never drift apart. Falls back to the
  // module helper when the ctx does not inject one (production).
  const reconcileLifecycleBoxes = ctx.tickLifecycleOnClose || tickLifecycleOnClose;
  await drainQueueIfAny();
  const initialState = loadState(statePath);
  const target = rest.find((a) => /^#\d+$/.test(a));
  let s = initialState;

  const closeTarget = target || s.active || '';
  const closeIssueNum = closeTarget.replace(/^#/, '');
  // #708 — `--repair` forces the full atomic close pipeline even when the board
  // is already Done / the issue already CLOSED (e.g. a PR closing-reference
  // auto-closed it out-of-band), so the timing flush, lifecycle-box ticking, and
  // audit rows that the noop/close-issue short-circuits skip get replayed.
  const repair = rest.includes('--repair');

  // #208 — bind-mismatch check moved to shared preflight (dispatcher).
  if (!s.active && target) {
    s = {
      ...s,
      active: target,
      lastActive: target,
      entryStartTs: nowIso(),
      wordsAtEntryStart: 0,
    };
    saveState(s, statePath);
  }
  if (!closeTarget) {
    console.log('no active task');
    return;
  }

  // #761 — disposition close-lane. `close --as duplicate --of <M>` /
  // `close --as not-planned` close the issue WITHOUT the Done DoD/commit-trace
  // gate: the issue is un-tracked from the board (it does NOT land in Done) and
  // an `aitm-closed-as` audit marker + comment record the disposition. Branch
  // and return here, before any shared gate state below is read.
  const asIdx = rest.indexOf('--as');
  if (asIdx !== -1) {
    const disposition = rest[asIdx + 1];
    const ofIdx = rest.indexOf('--of');
    const ofRef = ofIdx !== -1 ? rest[ofIdx + 1] : '';
    const result = await runDispose({
      issueNumber: closeIssueNum,
      reason: disposition,
      of: ofRef,
      repo: cfg.repo,
      projectId: cfg.projectId,
      cfg,
      deps: {
        mutateIssueBody: mutateBody,
        pexec: (bin, argv) => pexec(bin, argv, { timeout: GH_API_TIMEOUT_MS }),
        postComment: ({ issueNumber, repo, body }) =>
          pexec('gh', ['issue', 'comment', String(issueNumber), '-R', repo, '--body', body], {
            timeout: GH_API_TIMEOUT_MS,
          }),
        flushTiming: (n) =>
          flushAndForgetQueueFor ? flushAndForgetQueueFor(`#${n}`) : Promise.resolve(),
        now: nowIso,
        warn: (msg) => console.error(`[task-tracker] warn: ${msg}`),
      },
    });
    // Clear local active-task state so a subsequent bind is clean.
    try {
      clearActive(statePath);
    } catch {
      /* best-effort; a residual active pointer is harmless */
    }
    deregisterTask(projectDir, closeTarget);
    console.log(
      `Closed ${closeTarget} as ${result.reason}` +
        (result.of ? ` (duplicate of ${result.of})` : '') +
        ` — retained in Done, stateReason=${result.stateReason}.`
    );
    return;
  }

  const configuredReviewToDoneGate = resolveGate('reviewToDone', {
    session: loadSession(currentSessionId()),
    projectConfig: rawProjectConfig(),
  });
  const configuredReviewAuthority = configuredReviewToDoneGate ? 'human-gate' : 'gate-bypassed';

  // #425 / #925 — converge the independent GitHub issue and project-board
  // signals. The additive close snapshot lets a CLOSED + not-Done issue be
  // classified as delivered, dead, or unauthorized before any mutation.
  if (!SKIP_NETWORK && closeIssueNum) {
    const hasExpandedCloseSnapshot = typeof getIssueCloseSnapshot === 'function';
    const [boardState, closeSnapshot] = await Promise.all([
      getIssueBoardState(closeIssueNum),
      hasExpandedCloseSnapshot
        ? getIssueCloseSnapshot(closeIssueNum)
        : Promise.resolve(
            getIssueClosedState
              ? getIssueClosedState(closeIssueNum).then((issueClosed) => ({
                  issueClosed,
                  stateReason: undefined,
                }))
              : { issueClosed: null, stateReason: undefined }
          ),
    ]);
    const decisionInput = {
      boardState,
      issueClosed: closeSnapshot.issueClosed,
      repair,
    };
    let convergeBody = ctx.closeBody ?? '';
    let integrity = { allTicked: false, unticked: [], childrenDone: true };
    let fullAuto = false;
    let recovery = null;
    let authoritativeDoneBodyInspected = false;
    const configuredFullAuto = configuredReviewAuthority === 'gate-bypassed';
    const readConvergenceBody = async () => {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return JSON.parse(stdout).body ?? '';
    };
    const failInspection = (failedStep, error, message) => {
      const detail = error?.message || String(error);
      console.error(`${message}: ${detail}\nNo convergence mutation was attempted; retry later.`);
      process.exitCode = 1;
      return {
        action: 'inspect',
        status: 'failed',
        failedStep,
        error: detail,
      };
    };

    let decision;
    if (repair) {
      // Explicit repair is the highest authority and runs the existing full
      // pipeline without integrity inspection.
      decision = decideCloseConvergence(decisionInput);
    } else if (!hasExpandedCloseSnapshot) {
      // Legacy close snapshots still need current authority before a Done-board
      // convergence can close an open issue. Read the body rather than
      // preserving the old two-signal shortcut.
      if (closeSnapshot.issueClosed === false) {
        try {
          convergeBody = ctx.closeBody || (await readConvergenceBody());
        } catch (error) {
          return failInspection(
            'readIssueBody',
            error,
            `${closeTarget} is open but its body could not be read for convergence authority`
          );
        }
        Object.assign(decisionInput, {
          body: convergeBody,
          reviewGateBypassed: configuredFullAuto,
        });
      }
      decision = decideCloseConvergence(decisionInput);
    } else if (closeSnapshot.issueClosed === true) {
      Object.assign(decisionInput, {
        stateReason: closeSnapshot.stateReason,
      });

      if (closeSnapshot.stateReason !== 'completed') {
        // A close-for-cause is dead before any issue-body or child read.
        decision = decideCloseConvergence(decisionInput);
      } else if (boardState === 'done') {
        // Completed + Done is already authoritative. Housekeeping below may
        // make one best-effort body read so a pending durable recovery can
        // outrank noop; a read outage cannot reinterpret the terminal state.
        fullAuto = configuredFullAuto;
        authoritativeDoneBodyInspected = true;
        try {
          convergeBody = await readConvergenceBody();
          const inspectedRecovery = readUnauthorizedCloseRecovery(convergeBody);
          recovery = inspectedRecovery?.phase === 'complete' ? null : inspectedRecovery;
          Object.assign(decisionInput, {
            recoveryPhase: inspectedRecovery?.phase ?? null,
          });
        } catch {
          // Best-effort by design: closed + completed + Done remains noop when
          // its body is temporarily unreadable.
        }
        decision = decideCloseConvergence(decisionInput);
      } else {
        // Only completed, closed, not-Done issues require strict integrity.
        try {
          convergeBody = await readConvergenceBody();
        } catch (error) {
          return failInspection(
            'readIssueBody',
            error,
            `${closeTarget} is closed on GitHub but its body could not be read for integrity checking`
          );
        }
        const inspectedRecovery = readUnauthorizedCloseRecovery(convergeBody);
        recovery = inspectedRecovery?.phase === 'complete' ? null : inspectedRecovery;
        Object.assign(decisionInput, {
          recoveryPhase: inspectedRecovery?.phase ?? null,
        });

        if (recovery) {
          // A durable pending transaction has already established recovery
          // authority. Resume it before unrelated child inventory can fail.
          decision = decideCloseConvergence(decisionInput);
        } else {
          if (typeof fetchSubIssueBoardSnapshot !== 'function') {
            return failInspection(
              'fetchSubIssueBoardSnapshot',
              new Error('strict child snapshot capability is unavailable'),
              `${closeTarget} child inventory is unknown`
            );
          }
          const childSnapshot = await fetchSubIssueBoardSnapshot(closeIssueNum);
          if (childSnapshot?.status !== 'ok') {
            return failInspection(
              'fetchSubIssueBoardSnapshot',
              new Error(childSnapshot?.error || 'strict child snapshot returned unknown'),
              `${closeTarget} child inventory is unknown`
            );
          }

          fullAuto = configuredFullAuto;
          integrity = deriveClosedIssueIntegrity({
            body: convergeBody,
            fullAuto,
            childBoardStates: childSnapshot.children.map(({ number, boardState: childState }) => ({
              number,
              state: childState,
            })),
          });
          Object.assign(decisionInput, {
            nonLifecycleBoxesAllTicked: integrity.allTicked,
            fullAuto,
          });
          decision = decideCloseConvergence(decisionInput);
        }
      }
    } else if (closeSnapshot.issueClosed === false) {
      // Reopen is an intermediate recovery phase, not evidence that the
      // transaction disappeared. Read the protected marker before allowing
      // normal open-state policy to proceed.
      try {
        convergeBody = await readConvergenceBody();
      } catch (error) {
        return failInspection(
          'readIssueBody',
          error,
          `${closeTarget} is open but its body could not be read for recovery inspection`
        );
      }
      const inspectedRecovery = readUnauthorizedCloseRecovery(convergeBody);
      recovery = inspectedRecovery?.phase === 'complete' ? null : inspectedRecovery;
      Object.assign(decisionInput, {
        recoveryPhase: inspectedRecovery?.phase ?? null,
        body: convergeBody,
        reviewGateBypassed: configuredFullAuto,
      });
      decision = decideCloseConvergence(decisionInput);
    } else {
      decision = decideCloseConvergence(decisionInput);
    }

    if (decision.action === 'close-issue') {
      // Board reads Done but the issue is still OPEN — the Projects auto-close
      // workflow did not fire. Close the primary explicitly. On failure, surface
      // it and exit non-zero WITHOUT clearing local state so a re-run recovers.
      if (
        !(await writeDeliveredOrRefuse({
          issueNumber: closeIssueNum,
          targetRef: closeTarget,
        }))
      ) {
        return;
      }
      try {
        await pexec('gh', ['issue', 'close', closeIssueNum, '-R', cfg.repo], {
          timeout: GH_API_TIMEOUT_MS,
        });
      } catch (err) {
        console.error(
          `Failed to close ${closeTarget} on GitHub (board is Done but the issue was still OPEN): ${err.message}\n` +
            `Local state left intact — re-run \`/task close ${closeTarget}\` once GitHub is reachable.`
        );
        process.exitCode = 1;
        return;
      }
      await stripCloseLabels({ pexec, cfg, issueNum: closeIssueNum });
      clearActive(statePath);
      try {
        deregisterTask(projectDir, closeTarget);
      } catch {
        /* best-effort: cleanup; failure is non-fatal */
      }
      console.log(
        `${closeTarget} board was Done but the GitHub issue was still OPEN — closed it now; local state and fleet cleaned up.`
      );
      return;
    }

    if (decision.action === 'authority-refused') {
      process.stderr.write(
        `${closeTarget} cannot converge Done → closed: current Review authority is ${decision.authority?.status || 'missing'}. ` +
          'Re-run Test and Review, then record a current approval before closing.\n'
      );
      process.exitCode = 3;
      return;
    }

    if (['dead', 'finalize', 'aberration', 'noop'].includes(decision.action)) {
      const convergence = await runClosedIssueConvergence(
        {
          decision,
          issueNumber: closeIssueNum,
          issueClosed: closeSnapshot.issueClosed,
          boardState,
          stateReason: recovery?.stateReason ?? closeSnapshot.stateReason,
          unticked: recovery?.unticked ?? integrity.unticked,
          actor: recovery?.actor ?? 'unknown',
          ts: recovery?.ts ?? nowIso(),
          recovery,
        },
        {
          moveToDone: async () => {
            const moveResult = await runMoveStateDone(closeTarget, {
              silent: true,
              tailProfile: convergenceTailProfile,
              reviewAuthority: configuredReviewAuthority,
            });
            if (!moveResult.ok && !moveResult.benign) {
              const postBoardState = await getIssueBoardState(closeTarget);
              if (decideBoardMoveFailure({ moveResult, boardState: postBoardState }).surface) {
                return moveResult;
              }
            }
            return { ok: true };
          },
          emitClosePair: async () => {
            if (!authoritativeDoneBodyInspected) {
              try {
                const { stdout } = await pexec(
                  'gh',
                  ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
                  { timeout: GH_API_TIMEOUT_MS }
                );
                convergeBody = JSON.parse(stdout).body ?? convergeBody;
              } catch (err) {
                process.stderr.write(
                  `⚠ body read for converge close pair failed: ${err.message}\n`
                );
              }
            }
            await emitReviewToDoneClosePair({
              closeTarget,
              closeIssueNum,
              cfg,
              body: convergeBody,
              reviewGateBypassed: fullAuto,
              lastWordMarker: s.lastWordMarker,
              ctx,
              SKIP_NETWORK,
              nowIso,
              safePostTiming,
            });
            return { ok: true };
          },
          reconcileLifecycle: async () => {
            if (
              reconcileLifecycleBoxes === tickLifecycleOnClose &&
              typeof issueBodyMutator?.mutate !== 'function'
            ) {
              throw new Error(
                'issueBodyMutator.mutate capability is required for lifecycle reconciliation'
              );
            }
            return reconcileLifecycleBoxes({
              cfg,
              issueNum: closeIssueNum,
              pexec,
              deps: { mutateIssueBody: issueBodyMutator?.mutate },
            });
          },
          cleanup: async () => {
            if (!ctx.preserveActiveOnConvergence) clearActive(statePath);
            try {
              deregisterTask(projectDir, closeTarget);
            } catch {
              /* best-effort: cleanup; failure is non-fatal */
            }
            return { ok: true };
          },
          reopenIssue: async () => {
            await pexec('gh', ['issue', 'reopen', closeIssueNum, '-R', cfg.repo], {
              timeout: GH_API_TIMEOUT_MS,
            });
            return { ok: true };
          },
          moveToReview: async () => {
            const extraArgs = ['--force'];
            if (boardState) extraArgs.push('--from', boardState);
            return runMoveState(closeTarget, 'review', {
              silent: true,
              extraArgs,
              tailProfile: convergenceTailProfile,
            });
          },
          postTimingAudit: async ({ recovery: activeRecovery }) => {
            const { buildRow } = await import('../gh-timing-comment.mjs');
            return safePostTiming(
              closeTarget,
              buildRow({
                ts: nowIso(),
                event: 'unauthorized-close',
                // This out-of-band recovery has no active session segment;
                // honest 0/0 records audit occurrence without fabricating work.
                activeSec: 0,
                idleSec: 0,
                deltaWords: 0,
                wordMarker: s.lastWordMarker ?? 0,
                description:
                  `closed without authorization — reopened and restored to Review; ` +
                  `tx=${activeRecovery.tx}; ` +
                  `stateReason=${activeRecovery.stateReason || 'unknown'}; ` +
                  `unticked=${activeRecovery.unticked.join(', ') || 'unknown'}`,
              })
            );
          },
          createTransactionId: () => randomUUID(),
          timingAuditPresent: async (tx) => {
            const { readTimingCommentBody, bodyOf } = await import('../gh-timing-comment.mjs');
            const readTiming = ctx.readTimingCommentBody || readTimingCommentBody;
            const result = await readTiming({
              issueNumber: closeIssueNum,
              repo: cfg.repo,
              timeoutMs: GH_API_TIMEOUT_MS,
            });
            if (result?.status === 'error') {
              throw result.error || new Error('timing audit read failed');
            }
            return timingAuditHasExactTransaction(bodyOf(result), tx);
          },
          writeRecoveryPhase: async (phase, activeRecovery) => {
            if (typeof issueBodyMutator?.mutate !== 'function') {
              throw new Error(
                'issueBodyMutator.mutate capability is required for recovery persistence'
              );
            }
            const mutation = await issueBodyMutator.mutate({
              issueNumber: closeIssueNum,
              repo: cfg.repo,
              mutate: (base) =>
                upsertUnauthorizedCloseRecovery(base, {
                  ...activeRecovery,
                  phase,
                }),
            });
            const mutationSucceeded =
              mutation &&
              mutation !== false &&
              mutation.ok !== false &&
              (mutation.status === 'ok' || mutation.status === 'no-op') &&
              typeof mutation.body === 'string';
            if (!mutationSucceeded) {
              throw new Error(
                `recovery marker mutation failed for phase ${phase}: expected status ok/no-op with verified body`
              );
            }
            const persisted = readUnauthorizedCloseRecovery(mutation.body);
            if (!persisted) {
              throw new Error(`recovery marker readback failed for phase ${phase}`);
            }
            if (persisted.tx !== activeRecovery.tx) {
              throw new Error(
                `recovery marker readback mismatch for transaction: expected ${activeRecovery.tx}, got ${persisted.tx}`
              );
            }
            if (persisted.phase !== phase) {
              throw new Error(
                `recovery marker readback mismatch for phase: expected ${phase}, got ${persisted.phase}`
              );
            }
            return persisted;
          },
        }
      );

      if (convergence.status === 'failed') {
        if (decision.action === 'noop' && convergence.failedStep === 'moveToDone') {
          console.error(
            `${closeTarget} is closed on GitHub but the board move to Done failed: ${convergence.error}\n` +
              `Local state left intact — re-run \`/task close ${closeTarget}\` to retry the board move.`
          );
        } else {
          console.error(
            `${closeTarget} closed-issue ${decision.action} failed at ${convergence.failedStep}: ` +
              `${convergence.error}. Local task state was retained for retry.`
          );
        }
        process.exitCode = 1;
        return convergence;
      }
      if (convergence.status === 'untouched') {
        console.log(
          `${closeTarget} is closed for ${closeSnapshot.stateReason || 'an unknown non-delivery reason'} — left issue and board untouched.`
        );
        return convergence;
      }
      if (convergence.status === 'recovered') {
        console.log(`${closeTarget} ${convergence.message}.`);
        return convergence;
      }

      console.log(
        decision.action === 'finalize' || decision.boardDrift
          ? `${closeTarget} was already closed on GitHub — finalized housekeeping and converged the board to Done.`
          : `${closeTarget} is already fully closed — reconciled housekeeping and cleaned local state.`
      );
      return convergence;
    }
    // decision.action === 'proceed' → fall through to the full close pipeline.
  }

  if (closeTarget === 'discover') {
    console.log('Discarded discovery bucket.');
    saveState({ ...s, active: null, discoverBucket: null }, statePath);
    return;
  }

  let dirtyAuditRow = null;
  // #655 — `?? ctx.closeBody` lets a SKIP_NETWORK fixture seed the live body the
  // `!SKIP_NETWORK` block would otherwise fetch, so the review:approved emission
  // gate (which predicates on the approval marker) is exercisable in-process.
  let closeBody = ctx.closeBody ?? '';
  // #655 — hoisted out of the `!SKIP_NETWORK` gate-evaluation block (where
  // `_resolvedReviewGate` is scoped) so the later `review:approved` timing-row
  // emission can predicate on it. True iff the review→done gate was explicitly
  // disabled (session/project override), which carries its own
  // `aitm-gate-bypassed` audit row.
  let reviewGateBypassed = configuredReviewAuthority === 'gate-bypassed';
  if (process.env.TT_SKIP_DIRTY_CHECK !== '1') {
    const answerIdx = rest.indexOf('--answer');
    const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
    const cwd = resolveWorkspaceForIssue({ issueRef: closeTarget, projectDir });
    const dirty = await checkDirty({ cwd });
    if (dirty.dirty) {
      if (!answerArg) {
        if (process.env.CI === '1') {
          console.error(
            `⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)) and running headless.`
          );
          console.error(formatSummary(dirty));
          console.error('');
          console.error('Headless mode requires --answer yes|no|cancel.');
          console.error('   yes    — refuse close, show cleanup flow (recommended)');
          console.error('   no     — close with `closed-with-dirty-tree` audit row');
          console.error('   cancel — abort, leave in Review');
          process.exit(5);
        } else {
          console.error(`⚠ Workspace is dirty (${dirty.total} path(s)) for ${closeTarget}:`);
          console.error(formatSummary(dirty));
          console.log(`PROMPT_REQUIRED: dirty-close-confirm ${closeTarget}`);
          // #710 — exit non-zero so callers (e.g. `promote`) can distinguish a
          // blocked prompt from a completed close. Every sibling PROMPT_REQUIRED
          // emitter (CI dirty branch above → exit 5, review-approval → exit 7,
          // preflightVerb prompts) exits non-zero; the bare `return` here (exit 0)
          // was the lone anomaly that let `promote` report a false `✓ promoted`.
          // The PROMPT_REQUIRED stdout line is emitted first, so the interactive
          // skill loop still surfaces the prompt and re-invokes with --answer.
          process.exit(5);
        }
      } else if (answerArg === 'yes') {
        console.error(
          `⛔ Refusing to close ${closeTarget} — workspace is dirty (${dirty.total} path(s)).`
        );
        console.error(formatSummary(dirty));
        console.error('');
        console.error(CLEANUP_GUIDANCE);
        process.exit(6);
      } else if (answerArg === 'cancel') {
        console.log(
          `Cancelled close of ${closeTarget}; left in Review (workspace dirty: ${dirty.total} path(s)).`
        );
        return;
      } else if (answerArg === 'no') {
        console.warn(
          `[task-tracker] Closing ${closeTarget} with dirty workspace (${dirty.total} path(s)) — appending audit row.`
        );
        const { buildRow: dbr } = await import('../gh-timing-comment.mjs');
        const { deriveStateMoveDelta: _dsm1 } = await import('../lib/timing-rows.mjs');
        const _ts1 = nowIso();
        const _d1 = _dsm1(closeBody, _ts1);
        dirtyAuditRow = dbr({
          ts: _ts1,
          event: 'closed-with-dirty-tree',
          activeSec: _d1.activeSec,
          idleSec: _d1.idleSec,
          deltaWords: 0,
          // #475 AC1 — carried-forward durable marker (closed-with-dirty-tree audit, no active session)
          wordMarker: s.lastWordMarker ?? 0,
          description: shortAuditDescription(dirty),
        });
      } else {
        console.error(`Invalid --answer "${answerArg}". Expected yes|no|cancel.`);
        process.exit(1);
      }
    }
  }

  const force = rest.includes('--force');
  if (!SKIP_NETWORK) {
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const data = JSON.parse(stdout);
      let body = data.body ?? '';
      closeBody = body;

      // #931 — refuse before any gate-bypass marker write / DoD derivation if
      // the issue isn't in `review` (close's home state — it's review's exit
      // action). Thrown here so it's caught by the fail-closed `catch` below
      // (still bypassable via `--force`, same as every other guard exception
      // in this block).
      assertVerbHomeState({
        verb: 'close',
        currentState: readLastKnownState(body).state,
        issueNumber: closeIssueNum,
      });

      // #279 — review→done close-gates migrated into the guard registry.
      // The marker regex and runCloseGates bundle that used to live inline
      // here now run as `reviewExitReviewApprovedGuard` and
      // `reviewExitCloseGatesGuard` on `states/review.mjs`. We invoke them
      // via `runGuards('review', 'done', ctx)` below — once, after
      // derived-DoD stamping so chain-integrity sees the freshly-ticked
      // keys. The session/project `gateReviewToDone` toggle still lives in
      // close.mjs because it controls audit emission, not guard logic.
      const _resolvedReviewGate = configuredReviewToDoneGate;
      reviewGateBypassed = !_resolvedReviewGate; // #655 — hoist for the row gate
      if (!_resolvedReviewGate) {
        // #516 — the review-gate bypass is recorded as a body audit marker
        // (`aitm-gate-bypassed`), not a ⏱ Timing Log row. The bypass consumes no
        // distinct wall-clock; its time is already counted inside Review. The
        // marker is written during the close transaction so the audit trail
        // survives in the issue body.
        const { appendAuditMarker } = await import('../lib/markers.mjs');
        const _ts2 = nowIso();
        await mutateBody({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          mutate: (base) =>
            appendAuditMarker(base, {
              kind: 'gate-bypassed',
              ts: _ts2,
              detail: 'gateReviewToDone=false (session/project override) — bypassing human review',
            }),
        });
      }

      // #303 / #315 — Derived Functional DoD keys (`acs`, `checkboxes`) are
      // computed and stamped here, immediately before the close gate, via the
      // shared `deriveAndStampFunctionalDod` helper (also called from
      // verbs/review.mjs so review and close have identical derived-key
      // behavior). `checkboxes` is derived after `acs` inside the helper so the
      // newly-ticked `acs` box is counted. Atomic single push via mutateIssueBody.
      try {
        let derivedHeadSha = 'unknown';
        try {
          const { stdout: shaOut } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {});
          derivedHeadSha = String(shaOut || '').trim() || 'unknown';
        } catch {
          // best-effort — sha=unknown is acceptable in the evidence marker
        }
        const mutated = await deriveAndStampFunctionalDod({
          issueNumber: closeIssueNum,
          repo: cfg.repo,
          sha: derivedHeadSha,
          ts: nowIso(),
          deps: { pexec },
        });
        // Re-fetch body so the rest of the close gate sees the post-derivation
        // state. Skipped on no-op.
        if (mutated?.status === 'ok') {
          const { stdout: refetched } = await pexec(
            'gh',
            ['issue', 'view', closeIssueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
            { timeout: GH_API_TIMEOUT_MS }
          );
          body = String(refetched || body);
          closeBody = body;
        }
      } catch (err) {
        // Derivation is best-effort. If it fails, the existing
        // uncheckedPreCloseCheckboxes / lifecycle gate will surface the issue
        // through the normal blocker path. Log and continue.
        console.warn(`[task-tracker] Functional DoD derivation skipped: ${err.message}`);
      }

      const unchecked = uncheckedPreCloseCheckboxes(body);
      const reasons = [];
      if (unchecked.length > 0) {
        reasons.push(
          `${unchecked.length} unchecked checkbox${unchecked.length === 1 ? '' : 'es'} in issue body`
        );
      }

      // #179 — Hard Review→Done lifecycle gate. When required, blocks close unless
      // each lifecycle key is ticked, audited (Full-Auto), or per-key opt-out marker
      // present. When toggled off, downgrade to a WARN timing-log row.
      const lifecycleRequired = cfg.lifecycleCheckboxesRequired !== false;
      const lifecycleGate = assertLifecycleSatisfied({ body, required: lifecycleRequired });
      if (lifecycleGate.block) {
        reasons.push(lifecycleGate.reason);
      } else if (!lifecycleRequired && lifecycleGate.missing.length > 0) {
        try {
          const { buildRow: gbrL } = await import('../gh-timing-comment.mjs');
          const { deriveStateMoveDelta: _dsmL } = await import('../lib/timing-rows.mjs');
          const _tsL = nowIso();
          const _dL = _dsmL(body, _tsL);
          const missLabels = lifecycleGate.missing.map((m) => m.key).join(', ');
          await safePostTiming(
            closeTarget,
            gbrL({
              ts: _tsL,
              event: 'lifecycle-warn',
              activeSec: _dL.activeSec,
              idleSec: _dL.idleSec,
              deltaWords: 0,
              // #475 AC1 — carried-forward durable marker (lifecycle WARN bypass, no active session work)
              wordMarker: s.lastWordMarker ?? 0,
              description: `WARN: lifecycle-incomplete (lifecycleCheckboxesRequired=false): ${missLabels}`,
            })
          );
        } catch {
          // best-effort
        }
      }
      if (!force) {
        // #279 — single guard-registry call covers review→done exit:
        // blocked-by, review-approved marker, close-gates bundle,
        // child-cannot-lead-epic. The session/project gateReviewToDone
        // toggle filters the review-approved refusal post-hoc so the
        // existing bypass-audit row stays the only side-effect of disabling
        // human review.
        // #908 — desync-safe trunk-ref for the close-attribution gate. When close
        // runs inside a linked worktree, `lineageDoneGate` must attribute against
        // `origin/trunk` (a remote-tracking ref that is never checked out) so the
        // shared local `trunk` ref is never touched. Injected via the existing
        // `deps.closeGates.resolveTrunkRef` override hook. cfg.trunkRef still wins.
        const inWorktree = await detectLinkedWorktree({ pexec, cwd: projectDir });
        const guardResult = await runGuards('review', 'done', {
          issueNumber: Number(closeIssueNum),
          repo: cfg.repo,
          fromState: 'review',
          toState: 'done',
          body,
          cfg,
          projectDir,
          deps: { closeGates: { resolveTrunkRef: makeCloseTrunkRefResolver({ inWorktree }) } },
        });

        const refusals = (guardResult.refusals || []).filter(
          (r) => !(r.id === 'review-exit-review-approved' && !_resolvedReviewGate)
        );

        const approvedRefusal = refusals.find((r) => r.id === 'review-exit-review-approved');
        if (approvedRefusal) {
          const answerIdx = rest.indexOf('--answer');
          const answerArg = answerIdx >= 0 ? String(rest[answerIdx + 1] || '').toLowerCase() : '';
          if (answerArg === 'yes' || answerArg === 'no') {
            console.error(
              `⛔ \`--answer ${answerArg}\` cannot satisfy a human-gate prompt (review-approval).`
            );
            console.error(
              `Run \`/task approve ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`
            );
            process.exit(8);
          }
          console.error(`⛔ Refusing to close ${closeTarget} — no human review approval recorded.`);
          console.log(`PROMPT_REQUIRED: review-approval ${closeTarget}`);
          console.error(
            `Run \`/task approve ${closeTarget}\` (human) or set \`gateReviewToDone false\` in config.`
          );
          process.exit(7);
        }

        const closeGatesRefusal = refusals.find((r) => r.id === 'review-exit-close-gates');
        if (closeGatesRefusal) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          (closeGatesRefusal.blockers && closeGatesRefusal.blockers.length
            ? closeGatesRefusal.blockers
            : [closeGatesRefusal.reason]
          ).forEach((b) => console.error(`   • ${b}`));
          console.error('');
          process.exit(3);
        }

        const otherRefusals = refusals.filter(
          (r) => r.id !== 'review-exit-review-approved' && r.id !== 'review-exit-close-gates'
        );
        if (otherRefusals.length > 0) {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          otherRefusals.forEach((r) => console.error(`   • ${r.reason}`));
          console.error('');
          process.exit(3);
        }

        const closeGatesWarn = (guardResult.warns || []).find(
          (w) => w.id === 'review-exit-close-gates'
        );
        if (closeGatesWarn?.warn?.dirtyCheckSkipped) {
          console.warn(
            `[task-tracker] issue-scoped dirty check skipped (${closeGatesWarn.warn.dirtyCheckSkipped}).`
          );
        }
      }
      if (reasons.length > 0) {
        if (force) {
          console.error(`[task-tracker] ⚠ --force — bypassing close gate for ${closeTarget}`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          try {
            const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const note = `⚠ **Close gate bypassed** via \`--force\` at ${ts}. Unverified: ${reasons.join(', ')}.`;
            await pexec('gh', ['issue', 'comment', closeIssueNum, '-R', cfg.repo, '--body', note], {
              timeout: GH_API_TIMEOUT_MS,
            });
          } catch {
            /* best-effort: GitHub/telemetry side effect; core flow proceeds */
          }
        } else {
          console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
          reasons.forEach((r) => console.error(`   • ${r}`));
          unchecked.forEach((u) => console.error(`   ${u}`));
          console.error('');
          console.error('See .ai-task-manager/templates/pickup-directive.md Hard Rules.');
          console.error(
            'Verify each item, check its box (`/task ensureChecked "<label>"`), then retry.'
          );
          process.exit(3);
        }
      }
    } catch (err) {
      // #510 — fail CLOSED. The entire review→done close-gate evaluation ran
      // inside this try; a transient body-fetch blip, JSON.parse error, or a
      // guard exception must NOT silently skip the gates and fall through to the
      // terminal `gh issue close` below. Refuse the close (exit non-zero) before
      // any mutation, leaving local state intact so a re-run recovers. `--force`
      // remains the deliberate, audited bypass.
      const decision = decideGateEvalFailure({ error: err, force });
      if (decision.failClosed) {
        console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}:`);
        console.error(`   • ${decision.message}`);
        process.exit(decision.exitCode);
      }
      console.warn(
        `[task-tracker] ⚠ --force — close-gate evaluation failed but bypassing: ${err.message}`
      );
    }
  }

  if (!SKIP_NETWORK && closeIssueNum) {
    const subNums = await fetchSubIssues(closeIssueNum);
    if (subNums.length > 0) {
      const childStates = await Promise.all(
        subNums.map(async (n) => ({ num: n, state: await getIssueBoardState(n) }))
      );
      const notReady = childStates.filter((c) => c.state !== 'review' && c.state !== 'done');
      if (notReady.length > 0 && !force) {
        console.error(
          `[task-tracker] ⛔ Cannot close epic #${closeIssueNum} — ${notReady.length} child issue(s) not in Review:`
        );
        notReady.forEach((c) => console.error(`   #${c.num}: ${c.state ?? 'unknown'}`));
        console.error('All sub-issues must reach Review before the epic can close.');
        process.exit(3);
      }
      const reviewChildren = childStates.filter((c) => c.state === 'review');
      if (reviewChildren.length > 0) {
        console.error(
          `[task-tracker] ⛔ Cannot close epic #${closeIssueNum} — ${reviewChildren.length} child issue(s) require their own work lease:`
        );
        reviewChildren.forEach((child) => console.error(`   #${child.num}: review`));
        console.error(
          'Close each child in its own governed session before retrying the parent close.'
        );
        process.exit(3);
        return;
      }
    }
  }
  if (!SKIP_NETWORK && closeIssueNum) {
    try {
      const { applyReviewDelta } = await import('../lib/apply-review-delta.mjs');
      await applyReviewDelta({ cfg, issueNumber: closeIssueNum, body: closeBody });
    } catch (err) {
      process.stderr.write(`⚠ review-delta hook failed: ${err.message}\n`);
    }
  }
  if (dirtyAuditRow) {
    await safePostTiming(closeTarget, dirtyAuditRow);
  }
  // #801 — emit the review→done close pair through the shared helper (also
  // invoked by the converge/no-op fast-path). `review:approved` is gated on the
  // live approval marker in the fetched body, OR an explicitly-bypassed review
  // gate (`aitm-gate-bypassed` already logged); `issue:wrap` is unconditional.
  await emitReviewToDoneClosePair({
    closeTarget,
    closeIssueNum,
    cfg,
    body: closeBody,
    reviewGateBypassed,
    lastWordMarker: s.lastWordMarker,
    ctx,
    SKIP_NETWORK,
    nowIso,
    safePostTiming,
  });
  if (runLogIssueTime) await runLogIssueTime(closeTarget);
  // Post-close board/body agreement check (#180 defect 1 guard). After
  // runLogIssueTime, the `<!-- aitm-fields -->` body marker should have
  // non-null engagedTime. If it's still null, board fields almost certainly
  // were not written either — refuse to clear active so the user can recover.
  if (!SKIP_NETWORK && closeIssueNum) {
    await assertFieldsPersisted({ cfg, pexec, issueNum: closeIssueNum });
  }
  const flushResult = await flushAndForgetQueueFor(closeTarget);
  if (flushResult.delivered || flushResult.discarded) {
    console.log(
      `[task-tracker] queue: delivered ${flushResult.delivered}, discarded ${flushResult.discarded} for ${closeTarget}.`
    );
  }
  // #1035 — classify delivery before any terminal board or GitHub close. The
  // write is fail-closed: an upgraded installation must run init-repair rather
  // than silently create unclassified delivered work.
  if (!SKIP_NETWORK && closeIssueNum) {
    if (
      !(await writeDeliveredOrRefuse({
        issueNumber: closeIssueNum,
        targetRef: closeTarget,
      }))
    ) {
      return;
    }
  }
  // #505 — atomic forced close. A `--force` close deliberately bypasses the
  // close gate (above), but the *terminal board move* used to run only AFTER
  // `gh issue close` (see ~line 580) and delegated to move-state.mjs, whose
  // one-step matrix refuses any non-`review` → `done` transition. From a
  // non-review column that left the issue CLOSED on GitHub but the board
  // stranded at the source column — a split-brain needing a manual UI drag +
  // `reconcile accept-live`. Fix: on the force path, pre-walk the board to
  // Done *before* closing the issue, using the move-state `--force` flag so the
  // matrix + guards are bypassed for this terminal move only. If the forced
  // move cannot land the board at Done, refuse here and leave the issue OPEN —
  // so the outcome is always board=Done-then-closed, or untouched, never
  // closed-but-not-Done. (The post-close move below then degrades to a benign
  // `done → done` no-op on this path; the non-force path is unchanged.)
  if (force && !SKIP_NETWORK && closeIssueNum) {
    const forcedMove = await runMoveStateDone(s.active, {
      silent: true,
      extraArgs: ['--force'],
      reviewAuthority: configuredReviewAuthority,
    });
    // Same swallow-vs-surface rule as the post-close move (#435): re-read the
    // board and only refuse when the move genuinely failed AND the board is not
    // Done. A benign `done → done` (board already converged out-of-band) passes.
    const forcedBoardState =
      forcedMove && !forcedMove.ok && !forcedMove.benign
        ? await resolveBoardStateForClose({ getIssueBoardState, active: s.active })
        : 'done';
    if (decideBoardMoveFailure({ moveResult: forcedMove, boardState: forcedBoardState }).surface) {
      const detail =
        (forcedMove.stderr || '').trim() ||
        `move-state.mjs exited ${forcedMove.status ?? 'non-zero'}`;
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: forced board move to "done" failed (${detail}). ` +
          `Issue left OPEN to avoid a closed-but-not-Done split-brain — fix the board move and re-run \`/task close ${closeTarget} --force\`.`
      );
      process.exitCode = 1;
      return;
    }
  }

  // #908 — Full-Auto PR merge step. Before the terminal Done/close sequence, on a
  // Full-Auto PR-based close (an open PR exists for this branch), enable
  // GitHub-native auto-merge so the drive does not stall at the human "Merge"
  // click. `fullAutoMerge` is absent by default → `fail-closed`: the batch HALTS
  // with an actionable message rather than a mid-drive classifier denial, and the
  // issue is left OPEN. No open PR (branch-based / interactive close) → inert.
  // Gated on `isFullAuto()` — an interactive close leaves the merge to the human,
  // and the distinct guard keeps this block from shadowing the #654 pre-walk guard
  // below (whose source-shape contract anchors on its exact `if (!force && …)`).
  if (isFullAuto() && !force && !SKIP_NETWORK && closeIssueNum) {
    let closeBranch = '';
    try {
      const { stdout: br } = await pexec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {});
      closeBranch = String(br || '').trim();
    } catch {
      // no branch resolvable — treated as no-PR (inert) below
    }
    const fam = await enableFullAutoMergeForClose({
      cfg,
      branch: closeBranch,
      isFullAuto: isFullAuto(),
      pexec,
    });
    if (fam.status === 'fail-closed') {
      console.error(`[task-tracker] ⛔ Refusing to close ${closeTarget}: ${fam.message}`);
      console.error(
        `   Issue left OPEN — configure \`fullAutoMerge\` and re-run \`/task close ${closeTarget}\`.`
      );
      process.exitCode = 1;
      return;
    }
    if (fam.status === 'exec-failed') {
      console.error(
        `[task-tracker] ✗ Failed to enable auto-merge for ${closeTarget}: ${fam.message}\n` +
          `Local state left intact — re-run \`/task close ${closeTarget}\` once resolved.`
      );
      process.exitCode = 1;
      return;
    }
    if (fam.status === 'enabled') {
      console.log(
        `[task-tracker] ✓ Enabled GitHub auto-merge on PR #${fam.prNumber} for ${closeTarget} ` +
          `(\`gh ${fam.argv.join(' ')}\`); GitHub merges once required checks pass.`
      );
    }
  }

  // #654 — fail-closed close ordering on the NON-force path. The force path
  // (#505, above) already pre-walks the board to Done BEFORE `gh issue close`
  // so a refused terminal move can never strand the issue CLOSED-but-not-Done.
  // The non-force path used to mutate in the opposite order: `gh issue close`
  // first (below), THEN the guarded `runMoveStateDone` (#385, further down).
  // When that terminal move-state review→done was refused — board drifted off
  // `review`, or move-state's own `review-approval-missing` guard fired because
  // the `aitm-review-approved` marker never persisted (the #652 incident) — the
  // issue was already CLOSED on GitHub while the board stayed stranded at the
  // source column. The pre-close `runGuards('review','done', …)` block above
  // narrows but does not eliminate this: it filters the review-approved refusal
  // when the session review gate is off, and move-state re-evaluates its own
  // guards independently, so the two passes can legitimately disagree after the
  // close has already fired. Fix: mirror the #505 pre-walk here — land the board
  // at Done first; if it genuinely fails (and the board is not already Done),
  // refuse, leave the issue OPEN, and do NOT clear local state so a re-run
  // recovers. The post-close move (#385) then degrades to a benign `done → done`
  // no-op, exactly as on the force path.
  if (!force && !SKIP_NETWORK && closeIssueNum) {
    const preMove = await runMoveStateDone(s.active, {
      silent: true,
      reviewAuthority: configuredReviewAuthority,
    });
    const preBoardState =
      preMove && !preMove.ok && !preMove.benign
        ? await resolveBoardStateForClose({ getIssueBoardState, active: s.active })
        : 'done';
    if (decideBoardMoveFailure({ moveResult: preMove, boardState: preBoardState }).surface) {
      const detail =
        (preMove.stderr || '').trim() || `move-state.mjs exited ${preMove.status ?? 'non-zero'}`;
      console.error(
        `[task-tracker] ⛔ Refusing to close ${closeTarget}: board move to "done" failed (${detail}). ` +
          `Issue left OPEN to avoid a closed-but-not-Done split-brain — fix the board move ` +
          `(e.g. record review approval with \`/task approve ${closeTarget}\`) and re-run \`/task close ${closeTarget}\`.`
      );
      process.exitCode = 1;
      return;
    }
  }

  // #425 — explicitly close the primary issue rather than relying on the
  // GitHub Projects auto-close workflow firing off the board move below. The
  // workflow is best-effort; when it misses, board=Done + issue-OPEN drift
  // results (see close-convergence.mjs). Closing here makes issue-close a
  // first-class, separately-recoverable step: on failure we surface it and
  // exit non-zero WITHOUT clearing local state, so a re-run finishes the job
  // (and the short-circuit above will converge the lagging side). `gh issue
  // close` is idempotent — closing an already-closed issue is a no-op.
  if (!SKIP_NETWORK && closeIssueNum) {
    try {
      await pexec('gh', ['issue', 'close', closeIssueNum, '-R', cfg.repo], {
        timeout: GH_API_TIMEOUT_MS,
      });
    } catch (err) {
      console.error(
        `[task-tracker] ✗ Failed to close ${closeTarget} on GitHub: ${err.message}\n` +
          `Local state left intact — re-run \`/task close ${closeTarget}\` once GitHub is reachable.`
      );
      process.exitCode = 1;
      return;
    }
    await stripCloseLabels({ pexec, cfg, issueNum: closeIssueNum });
  }
  clearActive(statePath);
  try {
    deregisterTask(projectDir, s.active);
  } catch {
    /* best-effort: cleanup; failure is non-fatal */
  }
  // #385 — branch on the structured result. A genuine board-move failure must
  // NOT be reported as a clean "Closed": the issue was just closed on GitHub
  // (the explicit `gh issue close` above), but if the board never reached
  // `done` the user needs to see the real reason and a non-zero exit. The
  // benign `done → done` no-op (auto-close already moved the board) is treated
  // as success and produces no warning.
  const moveResult = await runMoveStateDone(s.active, {
    silent: true,
    reviewAuthority: configuredReviewAuthority,
  });
  const lifecycleTickResult = await reconcileLifecycleBoxes({
    cfg,
    issueNum: closeIssueNum,
    pexec,
  });
  if (moveResult && !moveResult.ok && !moveResult.benign) {
    // #435 — the move reported a non-benign failure, but a race can leave the
    // board already at Done (the auto-close workflow or a prior converge moved
    // it out-of-band between the decision above and this move). Re-read the
    // board: swallow when it is verifiably Done (the close succeeded), surface
    // only when it is NOT Done (a genuine board-move failure).
    const postBoardState = await getIssueBoardState(s.active);
    if (decideBoardMoveFailure({ moveResult, boardState: postBoardState }).surface) {
      const detail =
        (moveResult.stderr || '').trim() ||
        `move-state.mjs exited ${moveResult.status ?? 'non-zero'}`;
      console.error(
        `[task-tracker] ✗ #${s.active.replace(/^#/, '')} closed on GitHub but the board move to "done" failed: ${detail}`
      );
      process.exitCode = 1;
      return;
    }
  }
  // #672 — a lifecycle-tick failure that exhausts its retries previously
  // only surfaced on stderr, easy to miss among the surrounding console.log
  // lines. Fold it
  // into the terminal success line so it's visible in the same output the
  // operator is already reading, without turning close itself into a failure.
  if (lifecycleTickResult && !lifecycleTickResult.ok) {
    console.log(
      `Closed ${s.active}. ⚠ Lifecycle checkboxes could not be auto-ticked — see stderr.`
    );
  } else {
    console.log(`Closed ${s.active}.`);
  }
}

// Caller-side assertion that runLogIssueTime actually persisted fields to
// both the board AND the `<!-- aitm-fields -->` body marker. Guards against
// the silent-swallow class of bug that produced #180 / #165. No env override
// exists.
//
// #300 — delegates to `parseIssueFieldDb`, which uses a line-anchored,
// last-match regex (`NEW_BLOCK_RE`). The previous inline regex (first-match,
// no line anchor) caught literal `<!-- aitm-fields: {...} -->` placeholders
// inside body prose and failed `JSON.parse` on the `{...}` capture. See #298
// for the production case that surfaced this.
async function assertFieldsPersisted({ cfg, pexec, issueNum }) {
  let body = '';
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    body = String(stdout || '');
  } catch (err) {
    throw new Error(
      `assertFieldsPersisted: could not re-read body for #${issueNum}: ${err.message}. ` +
        `Retry when GitHub is reachable.`
    );
  }
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) {
    if (parsed.reason === 'missing') {
      throw new Error(
        `assertFieldsPersisted: <!-- aitm-fields --> marker missing on #${issueNum} after runLogIssueTime. ` +
          `Board fields almost certainly were not written.`
      );
    }
    // 'invalid-json' | 'invalid-fence' — preserve the legacy "malformed" wording.
    throw new Error(
      `assertFieldsPersisted: malformed aitm-fields JSON on #${issueNum}: ${parsed.reason}`
    );
  }
  const values = parsed.values || {};
  if (values.engagedTime == null) {
    throw new Error(
      `assertFieldsPersisted: aitm-fields.engagedTime is still null on #${issueNum} after runLogIssueTime — ` +
        `field write silently failed.`
    );
  }
}

// #672 — content-integrity guard errors (marker loss, checkbox-proof, etc.)
// are deliberate refusals: re-running the same mutate against the same body
// will fail the same way, so retrying wastes attempts and delays the real
// stderr signal. Only network-class failures (timeouts, dropped connections,
// transient GraphQL 5xx) are worth retrying — those come from `fetchBody`/
// `pushBody` inside `versionedWriteBody`, which has no retry of its own for
// this failure class (see #672 deep-dive), and are not instances of the
// named guard-error classes `issue-body-mutate.mjs` exports.
const LIFECYCLE_TICK_GUARD_ERRORS = new Set([
  'MarkerLossError',
  'CheckboxProofMissingError',
  'MalformedDeclarationCmdError',
  'FabricatedProofError',
  'IncompleteProofError',
  'BodyWriteRefusalError',
]);

const LIFECYCLE_TICK_MAX_ATTEMPTS = 3;
const LIFECYCLE_TICK_RETRY_DELAY_MS = 500;

// Tick the Lifecycle DoD items the close verb is responsible for. Best-effort:
// missing section or already-ticked items are no-ops; a bounded number of
// network-class failures are retried (#672 — the underlying GraphQL calls
// have no retry of their own and this environment has observed transient TLS
// timeouts), but the close path is never blocked — on final failure the
// caller is told via the returned `{ ok: false, message }` so it can surface
// a warning in the close summary instead of only writing to stderr.
export async function tickLifecycleOnClose({ cfg, issueNum, pexec, deps = {} }) {
  const mutateBody =
    deps.mutateIssueBody || (await import('../lib/issue-body-mutate.mjs')).mutateIssueBody;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr = null;
  for (let attempt = 1; attempt <= LIFECYCLE_TICK_MAX_ATTEMPTS; attempt++) {
    try {
      await mutateBody({
        issueNumber: issueNum,
        repo: cfg.repo,
        mutate: (base) => {
          let next = tickLifecycleItem(base, 'story-closed');
          next = tickLifecycleItem(next, 'timing-flushed');
          return next;
        },
        // These two lifecycle checkboxes (`story-closed`, `timing-flushed`) are
        // ticked by the close verb itself — the close action is the verifier, not
        // an agent pre-tick. The #362 checkbox-proof gate would otherwise refuse
        // them for lacking an adjacent proof marker. Mirror the #363 precedent in
        // approve.mjs and bypass the gate scoped to this single call site only;
        // every other mutateIssueBody call in this file keeps the gate enforced.
        allowUnverifiedTicks: true,
        deps: { pexec },
      });
      return { ok: true };
    } catch (err) {
      lastErr = err;
      const isGuardError = LIFECYCLE_TICK_GUARD_ERRORS.has(err.name);
      if (isGuardError || attempt === LIFECYCLE_TICK_MAX_ATTEMPTS) break;
      await sleep(LIFECYCLE_TICK_RETRY_DELAY_MS * attempt);
    }
  }
  const message = `lifecycle-tick best-effort failed: ${lastErr.message}`;
  process.stderr.write(`⚠ ${message}\n`);
  return { ok: false, message };
}
