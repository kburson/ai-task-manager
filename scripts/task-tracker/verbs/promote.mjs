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
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
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
import {
  planRefinementEstimate,
  applyRefinementEstimate,
  planPriorityGate,
} from '../lib/apply-refinement-estimate.mjs';
import { planPlannedEstimateGate } from '../lib/refine-estimate-comment.mjs';
import { planEpicDevelopChildrenGate } from '../lib/epic-children-gate.mjs';
import { gateRefineToPlan } from '../lib/refine-to-plan-gate.mjs';
import { checkParentAdmission } from '../lib/body-gates.mjs';
import { postOverrideAuditComment } from '../lib/override-audit.mjs';
import { readParentStatus as defaultReadParentStatus } from '../../gh/lib/parent-status.mjs';
import { gateCodeComplete, gateCommitTrailContainsHead } from '../lib/code-complete-gate.mjs';
import { stampStartTime } from '../lib/stamp-start-time.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';
import { writeIssueBodyWithRetry } from '../lib/state-recording.mjs';
import { stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { hasDodVerifiedMarker } from '../lib/markers.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

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

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(tmpdir(), `aitm-promote-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
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

async function defaultFetchParentIssue({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  try {
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) { parent { number } }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber) }
    );
    return data?.repository?.issue?.parent?.number ?? null;
  } catch {
    return null;
  }
}

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
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
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
    body = writeLastKnownState(body, live);
    await writeIssueBody({ issueNumber, repo: cfg.repo, body });
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

  // Backlog → Refine pre-flight (#133): require only Priority on the board.
  // Sizing / Estimate / rationale move to the Refine → Plan gate below.
  let refinementPlan = null;
  if (target === 'refine') {
    const gateResult = await planPriorityGate({
      cfg,
      issueNumber,
      deps: deps.refinementEstimate || deps.groomEstimate,
    });
    if (!gateResult.ok) {
      return {
        status: 'refine-gate-refused',
        blockers: gateResult.blockers,
        message: `Refusing to promote #${issueNumber} to Refine: Priority is not set on the project board.`,
      };
    }
  }

  // Refine → Plan pre-flight (#133): Size + Estimate set, rationale marker
  // authored, `## Acceptance Criteria` section non-empty. Post-success hook
  // posts the `### 🛠 Refine estimate` comment.
  if (target === 'plan') {
    const planResult = await planRefinementEstimate({
      cfg,
      issueNumber,
      body,
      deps: deps.refinementEstimate || deps.groomEstimate,
    });
    if (!planResult.ok) {
      return {
        status: 'refine-gate-refused',
        blockers: planResult.blockers,
        message: `Refusing to promote #${issueNumber} to Plan: missing Refine exit signals.`,
      };
    }
    refinementPlan = planResult.plan;

    // #147 — Refine → Plan exit gate: Sequence + Labels + Start time on board,
    // and (if epic) every child has cleared Backlog.
    const exitGate = deps.refineToPlanGate || gateRefineToPlan;
    const exitResult = await exitGate({
      cfg,
      issueNumber,
      deps: deps.refineToPlanGateDeps,
    });
    if (!exitResult.ok) {
      return {
        status: 'refine-exit-refused',
        blockers: exitResult.blockers,
        message: `Refusing to promote #${issueNumber} to Plan: Refine exit gate failed.`,
      };
    }
  }

  // Plan → Develop pre-flight (#134): the `### 🛠 Refine estimate` comment
  // must carry a `### Planned Estimate` appendix recording any drift from the
  // initial Refine bucket. Authored during Plan via `appendPlannedEstimate`.
  if (target === 'develop') {
    const gateResult = await planPlannedEstimateGate({
      cfg,
      issueNumber,
      deps: deps.plannedEstimate,
    });
    if (!gateResult.ok) {
      return {
        status: 'planned-estimate-refused',
        blockers: gateResult.blockers,
        message: `Refusing to promote #${issueNumber} to Develop: missing planned-estimate appendix on refine-estimate comment.`,
      };
    }
    const epicGateResult = await planEpicDevelopChildrenGate({
      cfg,
      issueNumber,
      deps: deps.epicChildren,
    });
    if (!epicGateResult.ok) {
      return {
        status: 'epic-children-refused',
        blockers: epicGateResult.blockers,
        message: `Refusing to promote epic #${issueNumber} to Develop: one or more sub-issues still in Backlog.`,
      };
    }
  }

  // Develop → Test pre-flight (#136): CODE_COMPLETE gate — every functional AC
  // ticked + verified, `aitm-commits` non-empty, no dirty files in the union of
  // SHAs' touch-set. Lifecycle DoD items tick at Review/Close, not here.
  if (target === 'test') {
    const codeCompleteGate = deps.codeCompleteGate || gateCodeComplete;
    const ccResult = await codeCompleteGate({ cfg, issueNumber, body });
    if (!ccResult.ok) {
      return {
        status: 'code-complete-refused',
        blockers: ccResult.blockers,
        message: `Refusing to promote #${issueNumber} to Test: CODE_COMPLETE gate failed.`,
      };
    }

    // #155 — additionally require the commit-trail comment to contain HEAD.
    // CODE_COMPLETE's existing commit-trail check accepts any non-empty trail;
    // this gate is stricter: HEAD itself must appear, so a stale trail (from
    // a commit-trace run before the latest commit landed) is refused.
    const headTrailGate = deps.commitTrailHeadGate || gateCommitTrailContainsHead;
    const projectDir = deps.projectDir || process.env.TASK_TRACKER_PROJECT_DIR || process.cwd();
    const headResult = await headTrailGate({ cfg, issueNumber, projectDir });
    if (!headResult.ok) {
      return {
        status: 'commit-trail-stale',
        blockers: [headResult.blocker],
        message: `Refusing to promote #${issueNumber} to Test: commit-trail does not contain HEAD.`,
      };
    }
  }

  // #210 (Fix C) — Test → Review pre-flight: require `aitm-dod-verified`.
  // The sandbox proof is what makes Test→Review legitimate. verbReview's own
  // gate enforces this when invoked directly, but `promote` from `test` goes
  // through a direct moveState (no alias verb), bypassing verbReview. Without
  // this gate, a soft sandbox failure that left the board at `test` without
  // dod-verified would sail through here, and close-time would be the first
  // catch — too late.
  if (recorded === 'test' && target === 'review') {
    if (!hasDodVerifiedMarker(body)) {
      return {
        status: 'dod-verified-missing',
        blockers: [
          'test-to-review-dod-missing: `aitm-dod-verified` marker absent — re-run `/task test #' +
            String(issueNumber).replace(/^#/, '') +
            '` to produce sandbox evidence before promoting to Review.',
        ],
        message: `Refusing to promote #${issueNumber} to Review: sandbox proof (aitm-dod-verified) is missing.`,
      };
    }
  }

  // #162 — child-cannot-lead-epic gate. Runs on every forward transition.
  // Solo issues (no parent) bypass. When the parent epic's live state is
  // behind the child's target state, refuse unless TASK_TRACKER_FORCE_PROMOTE=1
  // is set, in which case the override audit comment fires post-move.
  const fetchParentIssue = deps.fetchParentIssue || defaultFetchParentIssue;
  const readParentStatus = deps.readParentStatus || defaultReadParentStatus;
  let parentAdmissionOverride = null;
  {
    let parentEpicNumber = null;
    try {
      parentEpicNumber = await fetchParentIssue({ issueNumber, repo: cfg.repo });
    } catch {
      parentEpicNumber = null;
    }
    if (parentEpicNumber != null) {
      let gateOutcome;
      try {
        gateOutcome = await checkParentAdmission({
          parentEpicNumber,
          repo: cfg.repo,
          projectId: cfg.projectId,
          readParentStatus,
          targetState: target,
        });
      } catch (err) {
        return {
          status: 'parent-admission-error',
          message: `promote: parent-admission gate failed: ${err.message}`,
        };
      }
      if (Array.isArray(gateOutcome)) {
        if (gateOutcome.length > 0) {
          return {
            status: 'parent-admission-refused',
            blockers: gateOutcome.map((b) => b.message),
            message: `Refusing to promote #${issueNumber} to ${target}: child-cannot-lead-epic.`,
          };
        }
      } else if (gateOutcome?.override) {
        parentAdmissionOverride = gateOutcome.override;
      }
    }
  }

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
      // #210 (Fix B) — Before classifying as a soft warning, if the alias
      // verb was `/task test` (develop→test), require `aitm-dod-verified` in
      // the post-move body. Without it, the sandbox never produced a
      // green result and the board has no business sitting at `test` —
      // demote back to `develop` and report transition-failed so the caller
      // surfaces a hard refusal instead of a "promoted-with-warning".
      if (transitionResult.kind === 'alias' && transitionResult.verb === 'test') {
        let bodyForDodCheck = null;
        try {
          const fetched = await fetchIssueBody({ issueNumber, repo: cfg.repo });
          bodyForDodCheck = fetched.body;
        } catch {
          bodyForDodCheck = null;
        }
        if (bodyForDodCheck != null && !hasDodVerifiedMarker(bodyForDodCheck)) {
          // Best-effort rollback: demote board back to recorded state.
          try {
            await runMoveState({ issueNumber, target: recorded, cfg });
          } catch {
            // best-effort; if rollback fails, drift-reconcile will catch it
          }
          return {
            status: 'transition-failed',
            from: recorded,
            to: target,
            via: `/task ${transitionResult.verb}`,
            delegate: transitionResult.verb,
            delegateExitCode: transitionResult.exitCode,
            message: `promote: delegate /task ${transitionResult.verb} exited ${transitionResult.exitCode} and produced no \`aitm-dod-verified\` marker; board rolled back to "${recorded}".`,
          };
        }
      }
      // #175 — board reached target. Verify markers, repair if needed,
      // surface delegate exit as soft warning.
      let markerRepair = { status: 'noop' };
      try {
        const { body: bodyAfter } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
        const { state: stateAfter } = readLastKnownState(bodyAfter);
        const hasEntry = new RegExp(`<!--\\s*aitm-entered-${target}:`).test(bodyAfter);
        if (stateAfter !== target || !hasEntry) {
          const nowTs = now();
          let repaired = bodyAfter;
          if (stateAfter !== target) repaired = writeLastKnownState(repaired, target);
          if (!hasEntry) repaired = stampEntryMarker(repaired, target, nowTs);
          markerRepair = await writeIssueBodyWithRetry({
            issueNumber,
            repo: cfg.repo,
            body: repaired,
            bodyBefore: bodyAfter,
            target,
            writeIssueBody: ({ body: b }) =>
              writeIssueBody({ issueNumber, repo: cfg.repo, body: b }),
            postComment: deps.postComment,
          });
        }
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

  // #162 — post override audit comment on both child and parent when the
  // parent-admission gate was bypassed via TASK_TRACKER_FORCE_PROMOTE=1.
  // Best-effort — failure does not roll back the (already-committed) move.
  let parentAdmissionAudit = null;
  if (parentAdmissionOverride) {
    try {
      const post = deps.postOverrideAuditComment || postOverrideAuditComment;
      parentAdmissionAudit = await post({
        cfg,
        childNumber: Number(issueNumber),
        parentNumber: parentAdmissionOverride.parentNumber,
        childTarget: parentAdmissionOverride.targetState,
        parentState: parentAdmissionOverride.parentState,
        reason: parentAdmissionOverride.reason,
      });
    } catch (err) {
      parentAdmissionAudit = { posted: false, error: err.message };
    }
  }

  return {
    status: 'promoted',
    from: recorded,
    to: target,
    via: transitionResult.kind === 'alias' ? `alias:${transitionResult.verb}` : 'direct',
    bootstrapped,
    refinementPost,
    parentAdmissionOverride,
    parentAdmissionAudit,
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
    case 'dod-verified-missing': {
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
