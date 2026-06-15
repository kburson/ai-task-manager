// `promote` verb — directional forward state-change (#81 rename of `/task move`).
//
// One verb advances the issue by exactly one state along the FORWARD chain:
//   backlog → refine → plan → develop → test → review → done.
//
// Promote is the only sanctioned forward chokepoint. Existing stage verbs
// (refine / plan-approve / approve / review / close) remain as aliases — promote
// delegates to them so their gates and side effects run unchanged. The new
// behaviour layered on top is:
//
//   1. Drift detection (live board state vs. recorded lastKnownState).
//   2. Stamp `<!-- aitm-last-known-state -->` metadata to the new target.
//   3. Append a `move:<target>` audit row to the ⏱ Timing Log.
//
// Pure core: `runPromote({ issueNumber, cfg, deps })`. All side-effecting
// callers are injected so tests stay offline.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { FORWARD, STATES, normalizeStateSlug } from '../state-machine.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';
import { getProjectDir } from '../paths.mjs';
import {
  readLastKnownState,
  writeLastKnownState,
  buildRow,
  postTimingEvent,
  readTimingCommentBody,
} from '../gh-timing-comment.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { applyRefinementEstimate } from '../lib/apply-refinement-estimate.mjs';
import { stampStartTime } from '../lib/stamp-start-time.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';
import { writeIssueBodyWithRetry } from '../lib/state-recording.mjs';
import { stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

// #336 — refusal-id → verb-status translation. promote.mjs delegates pre-
// transition rule enforcement to `runGuards(from, to, ctx)`; refusals from
// the registry are translated to the verb's structured `{ status, blockers,
// message }` vocabulary that `verbs/check`, `auto`, and the slow tests pin.
// Unknown refusal ids default to `guard-refused`.
const REFUSAL_ID_TO_STATUS = {
  'refine-entry-fields-priority': 'refine-gate-refused',
  'plan-entry-fields-body': 'refine-gate-refused',
  'plan-entry-fields-board': 'refine-exit-refused',
  'refine-exit-wip-budget': 'wip-budget-refused',
  'plan-exit-planned-estimate': 'planned-estimate-refused',
  'plan-exit-deep-dive': 'deep-dive-refused',
  // #386 — plan→develop refuses a body with no `## Verification Commands`
  // section (>= 1 parseable entry); the gate-first `test` verb would otherwise
  // dead-end at "nothing to verify".
  'plan-exit-vc-presence': 'vc-presence-refused',
  'plan-exit-epic-children-refine-or-beyond': 'epic-children-refused',
  // `plan-exit-plan-approved` intentionally omitted: historical verb didn't
  // enforce this marker; the central `move-state.mjs` subprocess does. Adding
  // it here would surface refusals at the verb that legacy tests don't expect.
  'develop-exit-code-complete': 'code-complete-refused',
  'develop-exit-commit-trail-head': 'commit-trail-stale',
  // #267 — test→review gates migrated from inline checks in this file
  // (former dod-verified + #257 completeness blocks) and from verbReview
  // (the duplicate copies). Both now live in `STATES.test.exitGuards`.
  'test-exit-dod-verified': 'dod-verified-missing',
  'test-exit-pre-close-completeness': 'completeness-refused',
  'blocked-by-not-done': 'blocked-refused',
  // #356 — child-cannot-lead-epic migrated into the exitGuards registry.
  // Preserves the legacy verb-level `parent-admission-refused` status.
  'child-cannot-lead-epic-exit': 'parent-admission-refused',
  // #357 — refine→plan stage-completion marker check migrated from the
  // inline pre-flight at promote.mjs L270-285 into the exit-guard registry.
  // Preserves the legacy verb-level `refine-exit-refused` status.
  'refine-exit-complete-marker': 'refine-exit-refused',
};

function refusalsToVerbResult(refusals, { issueNumber, target }) {
  if (!refusals || refusals.length === 0) return null;
  // Pick the primary refusal as the FIRST refusal whose id has a known
  // status mapping. Falls back to the literal first refusal.
  const primary = refusals.find((r) => REFUSAL_ID_TO_STATUS[r.id]) || refusals[0];
  const status = REFUSAL_ID_TO_STATUS[primary.id] || 'guard-refused';
  const blockers = [];
  for (const r of refusals) {
    if (Array.isArray(r.blockers) && r.blockers.length > 0) {
      blockers.push(...r.blockers);
    } else if (r.reason) {
      blockers.push(r.reason);
    }
  }
  return {
    status,
    blockers,
    message: `Refusing to promote #${issueNumber} to ${target}: ${primary.reason}`,
  };
}

// Map source state → stage alias verb. Promote delegates to the alias so its
// gate stack runs unchanged. States with no alias (`backlog`, `refine`, `plan`,
// `test`) fall through to a direct internal move-state call.
//
// `refine` and `plan` previously delegated to `analyze` and `approve`
// (plan→develop walker), both retired in #98 — they now use the direct-move
// fall-through, same as `backlog` and `test`. The plan→develop gate that
// required the `aitm-plan-approved` marker is enforced by move-state itself.
const ALIAS_VERB = {
  develop: 'test',
  review: 'close',
};

// ---------------------------------------------------------------------------
// Default I/O — extracted so tests inject stubs.
// ---------------------------------------------------------------------------

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
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`promote: issue #${issueNumber} not found in ${repo}`);
  return { body: issue.body || '' };
}

// #295 — body writes go through `mutateIssueBody({ mutate })`; the closure
// runs on the FRESH base each push attempt.
async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

async function defaultGetLiveState({ issueNumber, cfg }) {
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
  const nodes = data?.repository?.issue?.projectItems?.nodes ?? [];
  const node = nodes.find((n) => n.project?.id === cfg.projectId) ?? nodes[0];
  return normalizeStateSlug(node?.fieldValueByName?.name);
}

function defaultSpawnVerb({ verb, issueNumber }) {
  const script = path.resolve(__dir, '../task-tracker.mjs');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, verb, String(issueNumber)], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env },
      timeout: GH_API_TIMEOUT_MS * 4,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function defaultRunMoveState({ issueNumber, target }) {
  const script = path.resolve(__dir, '../../gh/move-state.mjs');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, String(issueNumber), target], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'promote' },
      timeout: GH_API_TIMEOUT_MS * 2,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function defaultPostTimingRow({ issueNumber, repo, row }) {
  await postTimingEvent({ issueNumber: String(issueNumber), repo, row, timeoutMs: 5000 });
}

// `defaultFetchParentIssue` is imported from `../lib/fetch-parent-issue.mjs`
// (top of file). Extracted so guard adapters share the same default deps.

// ---------------------------------------------------------------------------
// Pure core.
// ---------------------------------------------------------------------------

export async function runPromote({
  issueNumber,
  cfg,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!issueNumber) throw new Error('promote: issueNumber is required');
  if (!cfg) throw new Error('promote: cfg is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const spawnVerb = deps.spawnVerb || defaultSpawnVerb;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const postTimingRow = deps.postTimingRow || defaultPostTimingRow;

  const { body: initialBody } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const { state: rawRecorded } = readLastKnownState(initialBody);
  const live = (await getLiveState({ issueNumber, cfg })) || null;

  // First-touch bootstrap: a pre-existing issue with no lastKnownState metadata.
  // Sync recorded to live and continue — drift detection has nothing to compare
  // against on the very first promote.
  let recorded = rawRecorded;
  let body = initialBody;
  let bootstrapped = false;
  if (!recorded) {
    if (!live) {
      return {
        status: 'error',
        message: `promote: no recorded state and no live state for #${issueNumber} — board item missing`,
      };
    }
    // #295 — closure stamps the bootstrap marker on the FRESH base.
    await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) => writeLastKnownState(base, live),
    });
    body = writeLastKnownState(body, live);
    recorded = live;
    bootstrapped = true;
  } else if (live && live !== recorded) {
    return {
      status: 'drift-refused',
      live,
      recorded,
      message:
        `drift detected: board says "${live}", task-tracker says "${recorded}". ` +
        `Run \`/task reconcile <accept-live|revert-to-recorded>\`.`,
    };
  }

  if (recorded === 'done') {
    return {
      status: 'terminal-refused',
      message: `already in done (#${issueNumber}); promote is forward-only.`,
    };
  }
  if (!STATES.includes(recorded)) {
    return {
      status: 'error',
      message: `promote: unknown recorded state "${recorded}" for #${issueNumber}`,
    };
  }
  const target = FORWARD[recorded];
  if (!target) {
    return { status: 'error', message: `promote: no forward transition from "${recorded}"` };
  }

  // #357 — refine→plan stage-completion marker check migrated into the
  // exit-guard registry (`refineExitCompleteMarkerGuard`). The runGuards call
  // below evaluates it; refusals surface as `refine-exit-refused` via
  // REFUSAL_ID_TO_STATUS.

  // #336 — delegate forward-transition gate enforcement to the guard registry.
  // Every previously-inline gate for backlog→refine, refine→plan, plan→develop,
  // and develop→test now lives in `STATES[from].exitGuards`. Side-channel:
  // `planEntryFieldsBody` stashes the resolved refinement plan on `guardCtx`
  // so the refine→plan post-success hook can run `applyRefinementEstimate`.
  //
  // Refusals from guards NOT in `REFUSAL_ID_TO_STATUS` are intentionally
  // ignored at verb level — they fall through to the subprocess `move-state.mjs`
  // call which runs the SAME runGuards and surfaces them as `transition-failed`.
  // This preserves the historical "verb didn't check X" boundary for guards
  // like `blocked-by-not-done` (test fixtures don't stub a real blocker lookup)
  // and `plan-exit-plan-approved` (fixtures don't stub the marker).
  const guardCtx = {
    issueNumber,
    repo: cfg.repo,
    fromState: recorded,
    toState: target,
    body,
    cfg,
    deps,
    projectDir: deps.projectDir || process.env.TASK_TRACKER_PROJECT_DIR || process.cwd(),
  };
  const guardResult = await runGuards(recorded, target, guardCtx);
  const mappedRefusals = (guardResult.refusals || []).filter((r) => REFUSAL_ID_TO_STATUS[r.id]);
  const verbRefusal = refusalsToVerbResult(mappedRefusals, { issueNumber, target });
  if (verbRefusal) return verbRefusal;
  const refinementPlan = guardCtx.refinementPlan || null;

  // #267 — Test → Review pre-flight gates (dod-verified marker + #257
  // completeness scan) migrated into `STATES.test.exitGuards` and reached via
  // `runGuards('test', 'review', ctx)` above. The verb-status surface
  // (`dod-verified-missing` / `completeness-refused`) is preserved by the
  // `REFUSAL_ID_TO_STATUS` mapping for `test-exit-dod-verified` and
  // `test-exit-pre-close-completeness`. The inline checks that used to live
  // here are deleted; the duplicate copies in `verbs/review.mjs` are removed
  // by the same change (single source of truth, parity across both paths).

  // #356 — child-cannot-lead-epic gate migrated into the state-keyed
  // exit-guard registry (`childCannotLeadEpicExitGuard` on all 6 forward
  // states). The runGuards call above already evaluated it; refusals are
  // surfaced as `parent-admission-refused` via REFUSAL_ID_TO_STATUS.

  const aliasVerb = ALIAS_VERB[recorded] || null;
  const transitionResult = aliasVerb
    ? {
        kind: 'alias',
        verb: aliasVerb,
        exitCode: await spawnVerb({ verb: aliasVerb, issueNumber, cfg }),
      }
    : { kind: 'direct', exitCode: await runMoveState({ issueNumber, target, cfg }) };

  if (transitionResult.exitCode !== 0) {
    // Re-read live board to classify the failure.
    //   liveAfter === target  → delegate reached target then side-task failed
    //                            (#175): treat as soft warning, verify/repair
    //                            markers, return promoted-with-warning.
    //   liveAfter !== target  → board never reached target (mid-move or
    //                            unchanged): keep transition-failed semantics.
    let liveAfter = null;
    try {
      liveAfter = (await getLiveState({ issueNumber, cfg })) || null;
    } catch {
      liveAfter = null;
    }

    if (liveAfter === target) {
      // #271 — the #210 (Fix B) defensive dod-verified post-move rollback was
      // removed here. With #270 landed, `/task test` is gate-first: the
      // develop-exit sandbox-proof guard (registry) refuses the move before
      // the board write, so a board-reached-target / dod-marker-missing combo
      // is structurally impossible on the happy path. The single source of
      // truth is `develop-exit-sandbox-proof-guard` on `STATES.develop.exit`.
      // #175 — board reached target. Verify markers, repair if needed,
      // surface delegate exit as soft warning.
      let markerRepair = { status: 'noop' };
      try {
        // #295 — repair inside the closure so the FRESH base is inspected on
        // every push attempt. Identity-return when the markers are already
        // correct produces a `no-op` from versionedWriteBody.
        markerRepair = await writeIssueBodyWithRetry({
          issueNumber,
          repo: cfg.repo,
          target,
          mutate: (base) => {
            const { state: stateAfter } = readLastKnownState(base);
            const hasEntry = new RegExp(`<!--\\s*aitm-entered-${target}(?::|\\s+ts=")`).test(base);
            if (stateAfter === target && hasEntry) return base;
            const nowTs = now();
            let repaired = base;
            if (stateAfter !== target) repaired = writeLastKnownState(repaired, target);
            if (!hasEntry) repaired = stampEntryMarker(repaired, target, nowTs);
            return repaired;
          },
          deps: { mutateIssueBody: mutateBody },
          postComment: deps.postComment,
        });
      } catch {
        // best-effort — marker is unreadable; warning still surfaces below.
      }

      // #128 — paired `<prev>:complete` + `<next>:enter` rows are emitted
      // at the move-state.mjs chokepoint on every successful Status write.
      // The previous `move:<target>` audit row was redundant with that pair
      // and is intentionally removed.

      return {
        status: 'promoted-with-warning',
        from: recorded,
        to: target,
        via:
          transitionResult.kind === 'alias'
            ? `/task ${transitionResult.verb}`
            : 'direct move-state',
        delegate: transitionResult.kind === 'alias' ? transitionResult.verb : null,
        delegateExitCode: transitionResult.exitCode,
        markerRepair,
        message: `promote: ${
          transitionResult.kind === 'alias'
            ? `delegate /task ${transitionResult.verb}`
            : `move-state.mjs ${target}`
        } exited ${transitionResult.exitCode}; board reached "${target}" — soft warning, markers verified.`,
      };
    }

    const drifted = liveAfter && liveAfter !== recorded;
    if (drifted) {
      // Mid-move drift: board moved past `recorded` but not to `target`.
      // move-state.mjs centrally stamps markers on each successful Status
      // mutation (#170), so the marker is already in sync with `liveAfter`.
      // Log the drift-reconcile audit row for visibility.
      try {
        const nowTs = now();
        const timingBody = await readTimingCommentBody({ issueNumber, repo: cfg.repo });
        const { activeSec, idleSec } = deriveStateMoveDelta(timingBody, nowTs);
        const row = buildRow({
          ts: nowTs,
          event: 'drift-reconcile',
          activeSec,
          idleSec,
          deltaWords: 0,
          // wordMarker:0 audit row — drift-reconcile event, no active session
          wordMarker: 0,
          description: `${recorded} → ${liveAfter} (${
            transitionResult.kind === 'alias'
              ? `alias /task ${transitionResult.verb}`
              : 'move-state'
          } exited ${transitionResult.exitCode})`,
        });
        await postTimingRow({ issueNumber, repo: cfg.repo, row });
      } catch {
        // best-effort
      }
    }
    return {
      status: 'transition-failed',
      transitionResult,
      reconciledTo: drifted ? liveAfter : null,
      message:
        `promote: ${
          transitionResult.kind === 'alias'
            ? `delegate /task ${transitionResult.verb}`
            : `move-state.mjs ${target}`
        } exited ${transitionResult.exitCode}; ` +
        (drifted
          ? `board drifted to "${liveAfter}"; marker reconciled.`
          : `recorded state left at "${recorded}".`),
    };
  }

  // Transition succeeded. Entry-marker AND lastKnownState stamping are both
  // centralized in move-state.mjs's success path (#170 — single mutator).
  // #147 — Backlog → Refine success hook: stamp the "Start time" field on the
  // project board so the refine→plan exit gate has a value to verify. Idempotent
  // (skips when already set). Best-effort — board state is already committed.
  if (target === 'refine') {
    try {
      const stamp = deps.stampStartTime || stampStartTime;
      await stamp({ cfg, issueNumber, now });
    } catch {
      // best-effort
    }
  }

  // Refine-stage post-success hook: post the audit comment (idempotent) and
  // strip the rationale marker from the body. Best-effort — failures here do
  // not roll back the board move.
  let refinementPost = null;
  if (target === 'plan' && refinementPlan) {
    try {
      refinementPost = await applyRefinementEstimate({
        cfg,
        issueNumber,
        plan: refinementPlan,
        deps: deps.refinementEstimate || deps.groomEstimate,
      });
    } catch (err) {
      refinementPost = { status: 'post-failed', error: err.message };
    }
  }

  // #128 — paired `<prev>:complete` + `<next>:enter` rows are emitted at
  // the move-state.mjs chokepoint on every successful Status write. The
  // previous `move:<target>` audit row was redundant with that pair and
  // is intentionally removed.

  return {
    status: 'promoted',
    from: recorded,
    to: target,
    via: transitionResult.kind === 'alias' ? `alias:${transitionResult.verb}` : 'direct',
    bootstrapped,
    refinementPost,
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper.
// ---------------------------------------------------------------------------

function parseArgs(rest) {
  for (const a of rest) {
    const m = String(a).match(/^#?(\d+)$/);
    if (m) return { issueNumber: Number(m[1]) };
  }
  return { issueNumber: null };
}

export async function verbPromote(rest, cfg) {
  const { issueNumber } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: promote #N\n');
    process.exit(1);
  }

  let result;
  try {
    result = await withIssueLock(
      { issue: issueNumber, verb: 'promote', projDir: getProjectDir() },
      () => runPromote({ issueNumber, cfg })
    );
  } catch (err) {
    if (err instanceof IssueLockError) {
      process.stderr.write(`⛔ ${err.message}\n`);
      process.exit(7);
    }
    process.stderr.write(`promote: ${err.message}\n`);
    process.exit(1);
  }

  switch (result.status) {
    case 'promoted': {
      process.stdout.write(
        `✓ #${issueNumber} promoted: ${result.from} → ${result.to}` +
          (result.bootstrapped ? ' (bootstrap: lastKnownState was empty)' : '') +
          ` (${result.via})\n`
      );
      if (result.refinementPost?.status === 'posted') {
        process.stdout.write(`  ↳ posted "### 🛠 Refine estimate" comment\n`);
      } else if (result.refinementPost?.status === 'duplicate') {
        process.stdout.write(`  ↳ refine-estimate comment already present (idempotent skip)\n`);
      } else if (result.refinementPost?.status === 'post-failed') {
        process.stderr.write(
          `  ⚠ refine-estimate comment post failed: ${result.refinementPost.error}\n`
        );
      }
      return;
    }
    case 'promoted-with-warning': {
      process.stdout.write(
        `✓ #${issueNumber} promoted: ${result.from} → ${result.to} (${result.via})\n`
      );
      process.stderr.write(
        `  ⚠ delegate ${result.delegate ? `/task ${result.delegate}` : '(direct)'} exited ${result.delegateExitCode} — board reached target; treating as soft warning.\n`
      );
      if (result.markerRepair?.status === 'ok') {
        process.stderr.write(`  ↳ marker repaired (attempts: ${result.markerRepair.attempts})\n`);
      } else if (result.markerRepair?.status === 'failed') {
        process.stderr.write(
          `  ↳ marker-repair FAILED; audit comment posted: ${result.markerRepair.auditPosted}\n`
        );
      }
      return;
    }
    case 'refine-gate-refused':
    case 'refine-exit-refused':
    case 'planned-estimate-refused':
    case 'epic-children-refused':
    case 'parent-admission-refused':
    case 'code-complete-refused':
    case 'dod-verified-missing':
    case 'vc-presence-refused':
    case 'completeness-refused': {
      process.stderr.write(`\n⛔ ${result.message}\n`);
      for (const b of result.blockers) process.stderr.write(`   BLOCKED: ${b}\n`);
      process.stderr.write('\n');
      process.exit(4);
    }
    case 'drift-refused': {
      process.stderr.write(
        `\n⛔ Refusing to promote #${issueNumber}:\n   BLOCKED: ${result.message}\n\n`
      );
      process.exit(4);
    }
    case 'terminal-refused': {
      process.stderr.write(`\n⛔ ${result.message}\n\n`);
      process.exit(4);
    }
    case 'transition-failed': {
      process.stderr.write(`promote: ${result.message}\n`);
      process.exit(result.transitionResult?.exitCode || 1);
    }
    case 'parent-admission-error':
    case 'error': {
      process.stderr.write(`promote: ${result.message}\n`);
      process.exit(1);
    }
    default: {
      process.stderr.write(`promote: unknown result status: ${result.status}\n`);
      process.exit(1);
    }
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
  await verbPromote(process.argv.slice(2), cfg);
}
