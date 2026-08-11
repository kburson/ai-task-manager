#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY. Direct invocation is refused at runtime.
// The board Status field has exactly one audited mutator; callers go through
// `aitm promote` / `aitm demote` / `aitm reconcile`. Deliberately NOT exposed
// through `aitm` script routing. See bin/aitm-registry.mjs (INTERNAL map).
//
// #755 — the entire host body is the exported async `runMoveStateHost`, which
// RETURNS a numeric exit code and NEVER calls process.exit. Verbs
// (promote/demote/reconcile/supersede) and the orchestrator (runtime→close,
// dispatch-prep) call it in-process and read the returned code (the same number
// the pre-#755 subprocess exit code gave them, so their downstream branching is
// unchanged).
//
// #764 — every production caller is now in-process, so this module is
// IMPORT-ONLY: it has no entrypoint shim and never calls process.exit. The few
// tests that still need a real move-state OS process (cross-process lock
// fidelity, no-TTY gate) spawn the test-only harness
// scripts/task-tracker/tests/helpers/move-state-cli.mjs, which imports this
// exported seam and maps the returned code onto process.exit.
//
// Move a GitHub issue through board states: Backlog → Assigned → Refine → Plan → Develop → Test → Review → Done
// Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>]
// States: backlog | assigned | refine | plan | develop | test | review | done

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { gh, projectItemForIssue } from './lib/github-projects.mjs';
import { backlogMoveWarning } from './lib/project-tether.mjs';
import { checkDirty, formatSummary, resolveWorkspaceForIssue } from './lib/dirty-workspace.mjs';
import { normalizeStateId } from '../task-tracker/lib/lifecycle-policy/index.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import {
  withIssueLock,
  IssueLockError,
  ISSUE_LOCK_HELD_ENV,
} from '../task-tracker/issue-mutator-lock.mjs';
// #559 — input/policy + transition-plan concerns extracted into focused,
// independently-testable modules. The host owns process.exit / stderr / I/O;
// these helpers are pure and decide WHAT applies.
import {
  STATE_TO_CONFIG_KEY,
  refusalVerbHint,
  parseMoveStateArgs,
  decideVerbGate,
  legacyStateAliasWarning,
} from '../task-tracker/lib/move-state/policy.mjs';
import { computeTransitionPlan } from '../task-tracker/lib/move-state/transition-plan.mjs';
// #559 — the four side-effect concerns (guard execution, GitHub mutation,
// audit/timing emissions, cache/unpark) extracted from this host into focused
// modules. The host assembles a single `ctx` and calls them in the exact
// pre-#559 interleaved order; each is a faithful relocation of an inline block.
import { runGuardExecution } from '../task-tracker/lib/move-state/guard-execution.mjs';
// #755 — the status write + post-commit tail are now sequenced by the extracted
// saga core moveState(ctx) (task-tracker/lib/move-state/move-state-core.mjs). The
// host no longer imports runStatusWrite / runPostCommitTail directly; it
// assembles ctx, runs the guard (below), then delegates the mutation block to
// moveState. #711 fail-closed and #714 tail-isolation live inside those steps and
// are preserved verbatim by the core.
import { moveState } from '../task-tracker/lib/move-state/move-state-core.mjs';
import { formatMoveReadout, formatMoveError } from '../task-tracker/lib/move-state/readout.mjs';
import { resolveTailProfile } from '../task-tracker/lib/move-state/tail-profiles.mjs';
import { resolveReviewAuthority } from '../task-tracker/lib/human-reviewer-audit.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

// #755 — the whole host body lives here and RETURNS a numeric exit code (0 =
// success). Inputs default to the live process so the CLI shim and the spawn
// tests behave exactly as before; verbs override `argv`/`env` to drive an
// in-process move. Worktree-safety: project context resolves from the passed
// `env` + process.cwd() (via getProjectDir), never from the package install dir,
// so a call inside a worktree operates on that worktree's board/lock/state.
export async function runMoveStateHost({
  argv = process.argv,
  env = process.env,
  isTty = process.stdin.isTTY,
  tailProfile = 'task-owner',
  reviewAuthority = null,
  lifecycleEvidence = null,
} = {}) {
  const { name: resolvedTailProfile } = resolveTailProfile(tailProfile);
  reviewAuthority = resolveReviewAuthority(reviewAuthority);
  const SKIP_NETWORK = env.TT_SKIP_NETWORK === '1';

  // Verb-pipeline gate. move-state.mjs is the chokepoint script for state changes;
  // agents must reach it through `/task` verbs, not by shelling out directly. Each
  // verb sets `AITM_VERB_CONTEXT=<verb>` before invoking (legacy `AITM_INTERNAL=1`
  // is treated as equivalent for back-compat). A human at a TTY may run it
  // directly. Out-of-band emergency moves pass `--out-of-band <reason>` to bypass
  // the env-check while writing a visible audit trail. The per-install config flag
  // `directMoveStateAllowed: true` permits non-verb invocation with a per-call
  // warning.
  const AITM_VERB_CONTEXT = String(env.AITM_VERB_CONTEXT || '').trim();
  const AITM_INTERNAL = env.AITM_INTERNAL === '1';
  const HAS_VERB_ENV = AITM_VERB_CONTEXT.length > 0 || AITM_INTERNAL;
  const IS_TTY = Boolean(isTty);

  function usage() {
    process.stderr.write(
      'Usage: node scripts/gh/move-state.mjs <issue#> <state> [--item-id <project-item-id>] [--from <state>] [--supersede] [--force]\n' +
        'States: backlog | assigned | refine | plan | develop | test | review | done\n' +
        '--supersede: bypass the matrix + guard pipeline (reserved for the `supersede` verb — "abandoned")\n' +
        '--force: bypass the matrix + guard pipeline for a delivered operator override (reserved for `close --force`)\n'
    );
  }

  // #559 — argv parsing extracted into the pure policy module. The host keeps
  // ownership of the exact exit codes + stderr bytes by mapping `parsed.error`
  // onto its usage()/unknown-state/out-of-band exits.
  //   --supersede (#401): bypass matrix + guard pipeline so a dead story jumps to
  //     Done from any non-done source; every done-path side-effect still fires.
  //   --force (#505): same bypass, semantically "delivered operator override"
  //     for `close --force`'s terminal board move (e.g. plan → done).
  const parsed = parseMoveStateArgs(argv);
  if (parsed.error === 'out-of-band') {
    process.stderr.write('move-state.mjs: --out-of-band requires a non-empty <reason>\n');
    return 2;
  }
  if (parsed.error === 'usage') {
    usage();
    return 1;
  }
  if (parsed.error === 'unknown-state') {
    process.stderr.write(
      `Unknown state: ${parsed.stateArg}\nStates: backlog | assigned | refine | plan | develop | test | review | done\n`
    );
    return 1;
  }

  const {
    issueArg,
    stateArg,
    itemIdOverride,
    fromOverride,
    demoteFlag,
    demoteReason,
    supersedeFlag,
    forceFlag,
    outOfBandReason,
    legacyStateAliases,
  } = parsed;

  for (const location of legacyStateAliases) {
    process.stderr.write(`${legacyStateAliasWarning(location)}\n`);
  }

  const configKey = STATE_TO_CONFIG_KEY[stateArg];

  const cfg = loadConfig();

  // Verb-pipeline gate decision (precedence): env → --out-of-band → cfg → TTY →
  // refuse. The pure `decideVerbGate` owns the branch logic; the host owns the
  // stderr text + exit 3.
  const directAllowed = cfg.directMoveStateAllowed === true;
  const gate = decideVerbGate({
    hasVerbEnv: HAS_VERB_ENV,
    outOfBandReason,
    directAllowed,
    isTty: IS_TTY,
  });
  if (gate.decision === 'refuse') {
    const verbHint = refusalVerbHint(stateArg);
    process.stderr.write(
      `move-state.mjs is internal; agents must reach it through the verb pipeline.\n` +
        `Use ${verbHint} for ${stateArg}, or pass --out-of-band <reason> to record an emergency move.\n` +
        `For one-off manual recovery from a non-TTY shell, set AITM_VERB_CONTEXT=<verb> (or AITM_INTERNAL=1) to confirm.\n`
    );
    return 3;
  }
  if (gate.decision === 'allow-with-warning') {
    process.stderr.write(
      `⚠ directMoveStateAllowed=true — permitting non-verb move-state invocation for #${issueArg} → ${stateArg}.\n` +
        `   Prefer routing through the /task verb pipeline.\n`
    );
  }

  if (!SKIP_NETWORK && (!cfg.projectId || !cfg.kanbanFieldId)) {
    process.stderr.write('Error: Kanban board not configured. Run: npx ai-task-manager init\n');
    return 1;
  }

  const optionId = cfg[configKey];
  if (!SKIP_NETWORK && !optionId) {
    process.stderr.write(
      `Error: option ID for state '${stateArg}' not configured. Run: npx ai-task-manager init\n`
    );
    return 1;
  }

  // State-machine matrix gate. Refuse illegal transitions (sequence-skip class from
  // epic #61). From-state resolution: --from flag first (chokepoint can pass the
  // recorded lastKnownState and skip the GraphQL roundtrip), then live Status field
  // via GraphQL. If neither source is available (e.g. TT_SKIP_NETWORK with no
  // --from), the matrix check is skipped — same fall-through behaviour as the
  // plan->develop approval gate.
  async function resolveLiveStateName(issueNumber) {
    if (SKIP_NETWORK) return '';
    try {
      const { gql, splitRepo } = await import('./lib/github-projects.mjs');
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `
        query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              projectItems(first: 10) {
                nodes {
                  project { id }
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { name }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNumber) }
      );
      const nodes = data?.repository?.issue?.projectItems?.nodes || [];
      const node = nodes.find((n) => n?.project?.id === cfg.projectId);
      return normalizeStateId(node?.fieldValueByName?.name) || '';
    } catch {
      return '';
    }
  }

  // #711 — read the item's live Status single-select `optionId` back for the
  // configured project. Injected into `ctx` so `runStatusWrite` can confirm a
  // board-field write actually landed (option id, exact match — not the display
  // name). Returns '' when absent/unreadable; never throws. Mirrors the query
  // shape of `resolveLiveStateName` above.
  async function readBackStatusOptionId({ issueNumber } = {}) {
    if (SKIP_NETWORK) return '';
    try {
      const { gql, splitRepo } = await import('./lib/github-projects.mjs');
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `
        query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              projectItems(first: 10) {
                nodes {
                  project { id }
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNumber) }
      );
      const nodes = data?.repository?.issue?.projectItems?.nodes || [];
      const node = nodes.find((n) => n?.project?.id === cfg.projectId);
      return String(node?.fieldValueByName?.optionId || '');
    } catch {
      return '';
    }
  }

  let resolvedFromState = '';
  if (fromOverride) {
    resolvedFromState = String(fromOverride).toLowerCase();
  } else if (!SKIP_NETWORK) {
    resolvedFromState = await resolveLiveStateName(issueArg);
  }

  // #559 — the from/to decision is now a value. `computeTransitionPlan` folds
  // the matrix gate, the guard-pipeline applicability, and the done-path
  // side-effect flags into one plan object that the host iterates below.
  const plan = computeTransitionPlan({
    fromState: resolvedFromState,
    toState: stateArg,
    flags: { supersede: supersedeFlag, force: forceFlag, demote: demoteFlag },
  });

  if (plan.matrix.applies && !plan.matrix.ok) {
    process.stderr.write(`\n⛔ Refusing to move #${issueArg} to ${stateArg}:\n`);
    process.stderr.write(`   BLOCKED: ${plan.matrix.reason}\n`);
    process.stderr.write(
      '\nThe 8-state kanban only permits one-step forward moves plus test->develop\n'
    );
    process.stderr.write(
      'and review->develop rework. See scripts/task-tracker/lib/lifecycle-policy/.\n\n'
    );
    return 5;
  }

  // #882 — satisfied no-op: the issue is already in the requested state. Return
  // BEFORE the ctx below so nothing downstream runs — no guard pipeline, no body
  // mutation, no entry marker, no timing row, no board write. Re-entering a state
  // would double-stamp `aitm-entered-<stage>` and open a duplicate stage-timing
  // row, corrupting the stage table. The machine token is what
  // `runMoveStateInProcess` matches to set `noop` on its structured result.
  if (plan.noop) {
    process.stdout.write(`↻ #${issueArg} is already in ${stateArg} — no state change\n`);
    process.stdout.write(`aitm-move-noop state=${stateArg}\n`);
    return 0;
  }

  // #559 — the shared context the extracted move-state concern modules consume.
  // Runtime values + cfg + the I/O primitives (`gh`/`pexec`) and the cross-tree
  // helpers (`projectItemForIssue`, dirty-workspace, backlog-warning) plus the
  // host-local `resolveLiveStateName` closure are injected here; the modules
  // import their stateless task-tracker helpers + node builtins directly. The
  // modules NEVER call process.exit — they return an `exit` descriptor and the
  // host owns termination, mirroring the policy/transition-plan split.
  const ctx = {
    issueArg,
    stateArg,
    resolvedFromState,
    demoteFlag,
    demoteReason,
    outOfBandReason,
    optionId,
    itemIdOverride,
    itemId: itemIdOverride,
    plan,
    forceFlag,
    supersedeFlag,
    SKIP_NETWORK,
    cfg,
    __dir,
    gh,
    pexec,
    projectItemForIssue,
    resolveLiveStateName,
    readBackStatusOptionId,
    checkDirty,
    formatSummary,
    resolveWorkspaceForIssue,
    backlogMoveWarning,
    tailProfile: resolvedTailProfile,
    reviewAuthority,
    lifecycleEvidence,
  };

  // #559 — guard-execution concern: the dirty-workspace warn, the universal
  // exit/entry guard pipeline (#286/#359/#355/#511), and the sized→backlog warn
  // (formerly three inline blocks here). runGuardExecution emits every banner +
  // fire-and-forget timing row verbatim and returns `{ exit }` — a number when
  // the pipeline refuses (6 contiguity / 4 generic / body-fetch-fail code), null
  // otherwise. The host owns termination so the exact codes survive.
  //
  // #358 — the inline plan→develop deep-dive gate that once lived here is a
  // strict duplicate of `planExitDeepDiveGuard` (#277), fired inside the
  // pipeline. #355 — the forward contiguity guard is likewise a registry
  // entry-guard whose refusal id the pipeline special-cases for exit 6.
  const guardOutcome = await runGuardExecution(ctx);
  if (guardOutcome.exit !== null) return guardOutcome.exit;

  // --- mutation block (per-issue advisory lock — EPIC #207 / #214) ---
  // Wrap every write that touches the issue (board status field, body markers,
  // timing-log comment, audit comments, local state file) so two parallel
  // sessions on the same issue serialize cleanly. The verb pipeline
  // (promote/approve/reconcile) may have already acquired this lock and signal
  // via `AITM_ISSUE_LOCK_HELD=1`; in that case skip re-acquisition.
  const runMutation = async () => {
    // #559 — the mutation block is now a thin sequencer over the extracted
    // concern modules. The call order is byte-identical to the pre-#559 inline
    // block so observable side-effect ordering (the #535/#516 timeline-row
    // guarantees) is preserved: status write → entry markers → onEnter dispatch
    // → kanban cache refresh → phase-pair rows → full-auto review audit →
    // unpark dependents → out-of-band audit → tracker-state sync → event-field
    // sync → end task tracking. Each module is best-effort (failures surface on
    // stderr, never roll back the committed board move) EXCEPT runStatusWrite,
    // which returns a non-null `exit` the host must honor (issue absent from the
    // project → exit 1).
    // #755 — delegate status → tail to the extracted saga core moveState(ctx).
    // The exit/entry guard already ran and was honored above (guardOutcome,
    // OUTSIDE the lock), so the core's guard seam is stubbed to a no-op here; the
    // core then runs runStatusWrite → runPostCommitTail in the byte-identical
    // pre-#755 order. moveState never calls process.exit — it returns
    // { exit, itemId, tail } and the mutation propagates result.exit outward so
    // the host returns it.
    //
    // #711 fail-closed (an unconfirmed Status write returns a non-null exit and
    // never proceeds) and #714 tail-isolation (a throw in any best-effort tail
    // step is caught, logged, and never flips the exit code) live inside
    // runStatusWrite / runPostCommitTail and are preserved verbatim by the core.
    ctx._runGuardExecution = async () => ({ exit: null });
    const result = await moveState(ctx);
    // #757 — the per-element move readout (Design §9 success / §12 failure).
    // Rendered purely from the enriched result the saga already verified-as-
    // stored; suppressed under SKIP_NETWORK where nothing was written, so we
    // never print a "(verified)" claim about a board that was never touched.
    if (!SKIP_NETWORK) {
      const readoutArgs = {
        result,
        issue: issueArg,
        from: ctx.resolvedFromState,
        to: stateArg,
      };
      if (result.exit === null) {
        process.stdout.write(`${formatMoveReadout(readoutArgs)}\n`);
      } else {
        process.stderr.write(`${formatMoveError(readoutArgs)}\n`);
      }
    }
    if (result.exit !== null) return result.exit;
    ctx.itemId = result.itemId;
    return 0;
  };

  if (env[ISSUE_LOCK_HELD_ENV] === '1') {
    return await runMutation();
  }
  try {
    return await withIssueLock(
      {
        issue: issueArg,
        verb: AITM_VERB_CONTEXT || 'move-state',
        projDir: getProjectDir(env),
      },
      runMutation
    );
  } catch (err) {
    if (err instanceof IssueLockError) {
      process.stderr.write(`⛔ ${err.message}\n`);
      return 7;
    }
    throw err;
  }
}
