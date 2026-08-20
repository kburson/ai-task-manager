// INTERNAL — library module for the state-movement boundary (#559).
//
// Guard-execution concern extracted from `scripts/gh/move-state.mjs`: the
// pre-mutation gate/warning pipeline that runs after the matrix gate and
// before the per-issue lock + board write. It folds three pre-#559 inline
// blocks, in order:
//   1. the non-blocking dirty-workspace warning on a move to `review`,
//   2. the universal exit-guard + entry-guard pipeline (#286/#359/#355/#511),
//   3. the non-blocking sized-issue→backlog warning.
//
// `runGuardExecution(ctx)` returns `{ exit }` where `exit` is a number when the
// guard pipeline refuses the move (the host calls `process.exit(exit)` to
// preserve the exact pre-#559 exit codes: 6 contiguity, 4 generic refusal, or
// the body-fetch-fail code). When the pipeline passes (or is skipped) it
// returns `{ exit: null }`. All stderr banners are emitted here verbatim so the
// slow-suite refusal-regex assertions keep matching.
//
// Runtime values, `cfg`, and the I/O primitives / cross-tree helpers arrive via
// the shared `ctx`; stateless task-tracker helpers + node builtins import
// directly. The guard-bootstrap side-effect import is repeated here so the
// registry is populated even if this module is exercised in isolation.

import { runGuards } from '../guard-registry.mjs';
import '../guard-bootstrap.mjs';
import { decideBodyFetchFailure } from '../body-fetch-gate.mjs';
import { parseIssueFieldDb } from '../../issue-field-db.mjs';
import { durableWordMarkers } from '../../state.mjs';
import { getProjectDir } from '../../paths.mjs';
import { detectLinkedWorktree, makeCloseTrunkRefResolver } from '../full-auto-merge-execute.mjs';
import { refreshPreRefineContiguity } from './contiguity-refresh.mjs';

// #968 — worktree-aware `deps.closeGates` for the review→done exit-slot.
// Parity with `verbs/close.mjs`'s #908 fix: `review-exit-close-gates` calls
// `lineageDoneGate`, which must attribute against `origin/trunk` (not the
// shared local `trunk` ref) when this pipeline runs inside a linked
// worktree. Reuses `close.mjs`'s own detection + resolver — no new resolver
// logic. `cfg.trunkRef` still wins if explicitly set (handled inside
// `resolveCloseTrunkRef`). Returns `undefined` for any move other than
// `→ done`, matching `runGuards`'s existing no-override default.
export async function buildCloseGatesDeps({ stateArg, pexec, projectDir } = {}) {
  if (stateArg !== 'done') return undefined;
  const inWorktree = await detectLinkedWorktree({ pexec, cwd: projectDir });
  return { closeGates: { resolveTrunkRef: makeCloseTrunkRefResolver({ inWorktree }) } };
}

// Shelve deliberately withdraws refined work instead of advancing it. Only
// the authenticated R4P → Backlog demotion may omit the source state's
// forward-admission exit guards; target entry guards remain authoritative.
// Every missing or different signal preserves the complete pipeline.
export function deriveGuardPhasePolicy({
  verbContext,
  shelveBackwardGuardAuthorized,
  demoteFlag,
  fromState,
  toState,
} = {}) {
  const isShelveR4pDemotion =
    verbContext === 'shelve' &&
    shelveBackwardGuardAuthorized === true &&
    demoteFlag === true &&
    fromState === 'ready-for-plan' &&
    toState === 'backlog';

  return {
    includeExitGuards: !isShelveR4pDemotion,
    includeEntryGuards: true,
  };
}

export async function runGuardExecution(ctx) {
  const {
    issueArg,
    stateArg,
    resolvedFromState,
    verbContext,
    shelveBackwardGuardAuthorized,
    demoteFlag,
    plan,
    forceFlag,
    supersedeFlag,
    SKIP_NETWORK,
    cfg,
    gh,
    pexec,
    resolveLiveStateName,
    checkDirty,
    formatSummary,
    resolveWorkspaceForIssue,
    backlogMoveWarning,
    lifecycleEvidence,
  } = ctx;

  // Gate 1: dirty-workspace warning on move to review. Non-blocking — move still proceeds.
  if (stateArg === 'review' && process.env.TT_SKIP_DIRTY_CHECK !== '1') {
    try {
      const projectDir = getProjectDir();
      const cwd = resolveWorkspaceForIssue({ issueRef: `#${issueArg}`, projectDir });
      const result = await checkDirty({ cwd });
      if (result.dirty) {
        process.stderr.write(
          `⚠ Workspace is dirty (${result.total} path(s)) on move to Review for #${issueArg}:\n`
        );
        process.stderr.write(formatSummary(result) + '\n');
        process.stderr.write(
          'Consider running the cleanup flow (docs/guides/workflow.md → Cleanup Procedure) before close.\n'
        );
      }
    } catch {
      /* warning is best-effort */
    }
  }

  // Universal exit-guard pipeline (#286) + entry-guard pipeline.
  // Exit guards (e.g. blocked-by-not-done) require a known `fromState`;
  // runGuards skips the exit-slot iteration when `GUARDS[fromState]` is
  // absent, so passing an unresolved fromState is safe (entry guards on
  // `toState` still fire). #359 — the body-gates entry guards on
  // test/review/done MUST run even when `resolvedFromState` is empty, to
  // preserve the pre-refactor behavior of the inline `GATED_STATES` block
  // (which had no fromState precondition). Therefore the outer condition
  // gates only on SKIP_NETWORK.
  // #401 — `--supersede` also skips this pipeline: a superseded story is being
  // abandoned, not delivered, so the close gates (deep-dive, review-approved,
  // blocked-by-not-done, lifecycle) must not apply. The done-path side-effects
  // below still run, so unparkDependents/audit/markers are preserved.
  if (!SKIP_NETWORK && plan.runGuardPipeline) {
    let guardBody = '';
    let bodyFetchFailed = false;
    try {
      guardBody = (
        await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
      ).trim();
    } catch {
      // #511 — a FAILED fetch must not be conflated with a genuinely-empty body.
      // For non-gated targets an absent body is tolerated (no marker means the
      // guard passes); for the body-gated targets (test/review/done) it would
      // silently skip the structural gates, so we fail CLOSED below.
      bodyFetchFailed = true;
    }

    // #511 — fail CLOSED on a body-gated move whose body could not be fetched.
    // Refuse before runGuards and well before the `project item-edit` mutation,
    // leaving the board unchanged so a re-run recovers. `--force`/`--supersede`
    // already short-circuit this whole block above; the helper also honors force.
    {
      const decision = decideBodyFetchFailure({
        toState: stateArg,
        fetchFailed: bodyFetchFailed,
        force: forceFlag || supersedeFlag,
      });
      if (decision.failClosed) {
        process.stderr.write(`\n⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
        process.stderr.write(`   • ${decision.message}\n\n`);
        return { exit: decision.exitCode };
      }
    }

    async function fetchBlockerState(blockerNumber) {
      return await resolveLiveStateName(String(blockerNumber));
    }

    // ctx.cfg + ctx.deps feed the entry-field guard adapters
    // (refine-entry-fields-priority, plan-entry-fields-body, plan-entry-fields-board)
    // registered in guard-bootstrap. The adapters wrap planPriorityGate /
    // planRefinementEstimate / gateRefineToPlan, which all accept `deps = {}`
    // and fall back to real `gh` implementations when callers omit them — so
    // `deps` is left undefined here and the gates self-default. `cfg` MUST be
    // present (the adapters short-circuit on `!ctx.cfg`). The body adapter
    // side-channels its resolved `refinementPlan` onto ctx; that field is
    // consumed today only by promote.mjs's inline pre-flight (which still runs
    // ahead of move-state spawn), so the in-registry assignment is harmless.
    const projectDir = getProjectDir();
    const deps = await buildCloseGatesDeps({ stateArg, pexec, projectDir });

    const guardCtx = {
      issueNumber: Number(issueArg),
      repo: cfg.repo,
      fromState: resolvedFromState,
      toState: stateArg,
      body: guardBody,
      fetchBlockerState,
      cfg,
      deps,
      projectDir,
      lifecycleEvidence,
    };
    const guardPhasePolicy = deriveGuardPhasePolicy({
      verbContext,
      shelveBackwardGuardAuthorized,
      demoteFlag,
      fromState: resolvedFromState,
      toState: stateArg,
    });
    let guardResult = await runGuards(resolvedFromState, stateArg, guardCtx, guardPhasePolicy);

    // #1017 — a just-created issue can briefly return a stale body snapshot
    // without its verified Backlog marker. Only when contiguity objects on one
    // of the two first-Refine arcs, read the body once more and re-evaluate that
    // guard before any move mutation. Every unrelated refusal remains intact;
    // refresh failure or genuine absence stays fail-closed.
    const refreshedContiguity = await refreshPreRefineContiguity({
      fromState: resolvedFromState,
      toState: stateArg,
      issueNumber: Number(issueArg),
      guardResult,
      fetchFreshBody: async () =>
        (
          await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
        ).trim(),
    });
    guardResult = refreshedContiguity.guardResult;

    if (!guardResult.ok) {
      // Contiguity refusal (story #355): preserve the legacy inline banner
      // byte-for-byte — different recovery prose and exit code from the
      // generic guard refusal. The guard itself lives at
      // `scripts/task-tracker/lib/contiguity-entry-guard.mjs`.
      const contigRefusal = guardResult.refusals.find((r) => r.id === 'contiguity-entry');
      if (contigRefusal) {
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
        process.stderr.write(`   BLOCKED: ${contigRefusal.reason}\n`);
        process.stderr.write(
          '\nA forward move may not enter a new stage while an earlier stage in the chain is unrecorded.\n'
        );
        process.stderr.write('Recovery:\n');
        process.stderr.write(
          `   • Run \`/task reconcile backfill ${issueArg}\` to fill the missing entry marker(s) if the stage(s) genuinely ran, then retry.\n`
        );
        process.stderr.write(
          `   • Only if the board and recorded body state have actually drifted (not merely a missing historical marker), run \`/task reconcile accept-live ${issueArg}\` instead.\n\n`
        );
        return { exit: 6 };
      }
      // #359 — body-gates-entry-{test,review,done} refusals replay the
      // inline composite's fire-and-forget `gate-refused` timing row before
      // exit(4). Keyed on guard id prefix so future entry guards in this
      // family compose automatically.
      const bodyGateRefusals = guardResult.refusals.filter((r) =>
        r.id.startsWith('body-gates-entry-')
      );
      if (bodyGateRefusals.length > 0) {
        try {
          const { buildRow, postTimingEvent } = await import('../../gh-timing-comment.mjs');
          const { deriveStateMoveDelta } = await import('../timing-rows.mjs');
          const _tsM1 = new Date().toISOString();
          // gate-refused: timing-comment body not loaded on the refusal path —
          // honest 0/0 (no prior reference point available).
          const _dM1 = deriveStateMoveDelta('', _tsM1);
          const ruleNames = bodyGateRefusals.flatMap((r) =>
            (r.blockers ?? [r.reason]).map((b) => String(b).split(':')[0].trim())
          );
          const markers = durableWordMarkers(getProjectDir());
          const row = buildRow({
            ts: _tsM1,
            event: 'gate-refused',
            activeSec: _dM1.activeSec,
            idleSec: _dM1.idleSec,
            deltaWords: 0,
            // #475 AC1 — carried-forward durable marker (gate-refused audit row)
            wordMarker: markers.marker,
            fullWordMarker: markers.fullMarker,
            description: `→ ${stateArg}: ${ruleNames.join(', ')}`,
          });
          await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
        } catch {
          /* fire-and-forget */
        }
      }
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
      for (const r of guardResult.refusals) {
        // #359 — preserve pre-refactor "BLOCKED: <reason>" format byte-for-byte
        // for body-gates-entry refusals so the slow-suite regex
        // /BLOCKED: deep-dive-complete/ keeps matching. Other guards retain the
        // `#N is in <fromState>;` contextual prefix that #277 introduced.
        if (r.id?.startsWith('body-gates-entry-')) {
          process.stderr.write(`   BLOCKED: ${r.reason}\n`);
        } else {
          process.stderr.write(
            `   BLOCKED: #${issueArg} is in ${resolvedFromState}; ${r.reason}\n`
          );
        }
      }
      process.stderr.write('\n');
      process.stderr.write(
        'Use `/task unblock` (or close the blockers) before retrying this move.\n\n'
      );
      return { exit: 4 };
    }

    if (guardCtx.planExitOwnershipClaim) {
      ctx.planExitOwnershipClaim = guardCtx.planExitOwnershipClaim;
    }

    // #359 — preserve the inline composite's lifecycle warn-only side
    // effect: bodyGatesEntryGuardDone attaches a `warn: { kind:'lifecycle',
    // labels: [...] }` payload when lifecycleCheckboxesRequired=false. The
    // runGuards aggregator propagates it via `guardResult.warns`; emit the
    // legacy `lifecycle-warn` timing row from that payload here (generic
    // handler keyed on warn.kind — no helper import needed).
    const lifecycleWarn = (guardResult.warns ?? []).find((w) => w.warn?.kind === 'lifecycle');
    if (lifecycleWarn) {
      try {
        const { buildRow: _br, postTimingEvent: _pe } = await import('../../gh-timing-comment.mjs');
        const { deriveStateMoveDelta: _dsm } = await import('../timing-rows.mjs');
        const _ts = new Date().toISOString();
        // lifecycle-warn: timing-comment body not loaded here — honest 0/0
        // (no prior reference point available; warn is fire-and-forget).
        const _d = _dsm('', _ts);
        const missLabels = (lifecycleWarn.warn.labels ?? []).join(', ');
        const markers = durableWordMarkers(getProjectDir());
        await _pe({
          issueNumber: issueArg,
          repo: cfg.repo,
          timeoutMs: 3000,
          row: _br({
            ts: _ts,
            event: 'lifecycle-warn',
            activeSec: _d.activeSec,
            idleSec: _d.idleSec,
            deltaWords: 0,
            // #475 AC1 — carried-forward durable marker (lifecycle-warn audit row)
            wordMarker: markers.marker,
            fullWordMarker: markers.fullMarker,
            description: `WARN: lifecycle-incomplete (lifecycleCheckboxesRequired=false): ${missLabels}`,
          }),
        });
      } catch {
        /* fire-and-forget */
      }
    }
  }

  // Backlog warning: moving a sized + estimated issue to Backlog is suspicious.
  // Backlog is for unvetted ideas; sized work belongs in the Ready column. Non-blocking.
  if (stateArg === 'backlog' && !SKIP_NETWORK) {
    try {
      const body = (
        await gh(['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body', '--jq', '.body'])
      ).trim();
      if (body) {
        const parsed = parseIssueFieldDb(body);
        const warn = backlogMoveWarning({
          targetState: 'backlog',
          fieldValues: parsed.ok ? parsed.values : null,
        });
        if (warn) process.stderr.write(`${warn}\n`);
      }
    } catch {
      /* fire-and-forget */
    }
  }

  return { exit: null };
}
