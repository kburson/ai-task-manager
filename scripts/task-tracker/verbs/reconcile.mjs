// `reconcile` verb — drift recovery (#69).
//
// When the live GitHub Projects board state diverges from the recorded
// `lastKnownState` metadata in the issue body, promote/demote refuse and point
// here. Reconcile has two modes:
//
//   accept-live          — record current live state as the new lastKnownState.
//                          No board move. Logs `drift-reconcile` audit row.
//   revert-to-recorded   — push board state back to the recorded value via
//                          `scripts/gh/move-state.mjs` (AITM_INTERNAL=1).
//                          Logs `drift-revert` audit row.
//   revert-to-sentinel   — restore board + recorded state to the final
//                          saga-verified move-complete sentinel without
//                          creating lifecycle history or replacing the sentinel.
//   backfill             — repair historical contiguity holes: stamp any missing
//                          prior-stage `aitm-entered-*` marker on the chain up to
//                          the current stage (#544). No board move; recovers the
//                          silent-stamp-failure case board↔body agreement hides.
//
// No state-machine validation: this is a recovery path. The matrix may forbid
// the resulting transition (e.g. manual board fix to a non-adjacent state) and
// the user has explicitly opted into the gap.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

import { readLastKnownState, writeLastKnownState } from '../gh-timing-comment.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { invalidateEvidence } from '../lib/evidence-invalidation.mjs';
import { appendAuditMarker } from '../lib/markers.mjs';
import {
  findRecordingFailureFromComments,
  writeIssueBodyWithRetry,
} from '../lib/state-recording.mjs';
import { splitRepo, gql, gh, projectItemForIssue } from '../../gh/lib/github-projects.mjs';
import { getActiveTask, setSessionKanbanState } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import {
  stampEntryMarker,
  computeBackfillHoles,
  backfillEntryMarker,
  OPTIONAL_CONTIGUITY_STAGES,
  parseEntryMarkersFirstVisit,
  safeBackfillTs,
} from '../lib/stage-entry-markers.mjs';
import { forwardTarget, normalizeStateId, stateIds } from '../lib/lifecycle-policy/index.mjs';
import { getProjectDir } from '../paths.mjs';
import { readMoveCompleteState } from '../lib/move-state/sentinel.mjs';
import { STATE_TO_CONFIG_KEY } from '../lib/move-state/policy.mjs';
import { runStatusWrite } from '../lib/move-state/github-mutation.mjs';
// keep: recovery snapshot semantics intentional — reconcile force-rewrites the
// body verbatim (no closure), so pushIssueBody is the correct primitive here.
import { pushIssueBody } from '../lib/issue-body-push.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';
import { runMoveStateHost } from '../../gh/move-state.mjs';
import { resolveProjectDir } from '../lib/project-dir.mjs';

const pexec = promisify(execFile);

const MODES = new Set(['accept-live', 'revert-to-recorded', 'revert-to-sentinel', 'backfill']);
const DEMOTION_RECOVERY_SOURCES = new Set(['test', 'review']);

// ---------------------------------------------------------------------------
// Default I/O — DI seams.
// ---------------------------------------------------------------------------

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body createdAt }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`reconcile: issue #${issueNumber} not found in ${repo}`);
  return { body: issue.body || '', createdAt: issue.createdAt };
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(
    projectScratchDir('test'),
    `aitm-reconcile-${process.pid}-${Date.now()}.md`
  );
  // quiet: true (#435) — this is the known-internal, deliberately-retained
  // pushIssueBody call site (see the `// keep:` note on the import). Suppress
  // the maintainer-facing DEPRECATED warning so routine `reconcile accept-live`
  // repairs the operator is told to run do not leak it.
  await pushIssueBody({ issueNumber, repo, body, scratchPath: tmp, quiet: true, deps: { pexec } });
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
  return normalizeStateId(node?.fieldValueByName?.name);
}

// #764 — push the board back to the recorded state in-process (was: spawn
// `node scripts/gh/move-state.mjs <n> <target>`). Mirrors demote/supersede's
// migrated helper: runMoveStateHost returns the same numeric exit code the child
// exit gave us, so revert-to-recorded's exitCode branch is unchanged. No bypass
// flag — reconcile drives a plain matrix move. host is injectable for tests.
export function defaultRunMoveState({ issueNumber, target }, { host = runMoveStateHost } = {}) {
  return host({
    argv: [process.execPath, 'move-state.mjs', String(issueNumber), target],
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'reconcile' },
  });
}

// #1016 — sentinel recovery writes ONLY the authoritative Status field. It
// deliberately reuses the saga's confirmed write/read-back seam but does not
// call stampEntryMarkers, timing writers, or writeMoveCompleteMarker: the
// sentinel target was already entered and is the provenance being restored.
export async function defaultRunSentinelStatusWrite(
  { issueNumber, target, cfg },
  { statusWriter = runStatusWrite, ghFn = gh, projectItemForIssueFn = projectItemForIssue } = {}
) {
  const optionId = cfg?.[STATE_TO_CONFIG_KEY[target]];
  if (!optionId) return 1;
  const result = await statusWriter({
    issueArg: String(issueNumber),
    stateArg: target,
    optionId,
    cfg,
    SKIP_NETWORK: false,
    gh: ghFn,
    projectItemForIssue: projectItemForIssueFn,
    itemIdOverride: null,
  });
  return result.exit ?? 0;
}

// #218: the local cache no longer carries a `state` field — the issue body
// marker (rewritten above by `writeIssueBodyWithRetry`) is the source of
// truth. The helper now also refreshes the per-session `kanbanState` derived
// cache that the activity-guard hook reads synchronously, so the hook isn't
// deadlocked between two stale sources after `reconcile accept-live`. The
// `deps.persistTrackerState` injection point remains stable for tests.
function defaultPersistTrackerState({ issueNumber, state } = {}) {
  if (!issueNumber || !state) return;
  try {
    const sid = currentSessionId();
    if (!sid) return;
    const projDir = resolveProjectDir({ issue: issueNumber });
    const active = getActiveTask(sid, projDir);
    const wantIssue = String(issueNumber).startsWith('#') ? String(issueNumber) : `#${issueNumber}`;
    if (active && active.issue === wantIssue) {
      setSessionKanbanState(sid, state, projDir);
    }
  } catch {
    /* best-effort cache refresh — must never block reconcile */
  }
}

// ---------------------------------------------------------------------------
// Pure core.
// ---------------------------------------------------------------------------

export async function runReconcile({
  issueNumber,
  mode,
  cfg,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!issueNumber) throw new Error('reconcile: issueNumber is required');
  if (!cfg) throw new Error('reconcile: cfg is required');
  if (!mode) {
    return {
      status: 'error',
      message:
        'reconcile: mode is required — use `accept-live`, `revert-to-recorded`, or `revert-to-sentinel`',
    };
  }
  if (!MODES.has(mode)) {
    return {
      status: 'error',
      message: `reconcile: unknown mode "${mode}" — use accept-live, revert-to-recorded, revert-to-sentinel, or backfill`,
    };
  }

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const runSentinelStatusWrite = deps.runSentinelStatusWrite || defaultRunSentinelStatusWrite;
  const persistTrackerState = deps.persistTrackerState || defaultPersistTrackerState;
  const listComments = deps.listComments || null;
  // #516 — drift events are demoted to body audit markers via mutateIssueBody.
  // Seam it so tests can intercept the marker write (the real helper performs a
  // live gh round-trip).
  const mutateBody = deps.mutateIssueBody || mutateIssueBody;

  const { body, createdAt } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const { state: recorded } = readLastKnownState(body);
  const live = (await getLiveState({ issueNumber, cfg })) || null;

  if (!live && !recorded) {
    return { status: 'error', message: `reconcile: no live or recorded state for #${issueNumber}` };
  }

  // #544 — backfill mode repairs HISTORICAL contiguity holes: prior-stage
  // `aitm-entered-*` markers that were never recorded (e.g. a forward move whose
  // stamp failed non-atomically after the board move committed). Unlike
  // accept-live/revert, the board and recorded state usually AGREE here — the
  // damage is the missing middle of the marker chain, not board↔body drift —
  // so this runs BEFORE the no-drift-refused early return below.
  if (mode === 'backfill') {
    const currentStage = live || recorded;
    if (!currentStage) {
      return { status: 'error', message: `reconcile backfill: no state for #${issueNumber}` };
    }
    // Mirror the forward-move contiguity check (evaluateContiguity): the
    // gateless `assigned` waiting room is optional and never blocks a promotion,
    // so backfill must not manufacture a marker the normal flow legitimately
    // omits. Fill only the holes that would actually wedge a forward move.
    const holes = computeBackfillHoles(body, currentStage).holes.filter(
      (s) => !OPTIONAL_CONTIGUITY_STAGES.has(s)
    );
    if (holes.length === 0) {
      return {
        status: 'no-holes',
        live,
        recorded,
        message: `no contiguity holes for #${issueNumber} at "${currentStage}"`,
      };
    }
    // #675 AC4 — share heal-entry-markers.mjs's interval-safe timestamp
    // algorithm instead of blanket-stamping every hole at the same `now()`
    // value, which could tie multiple backfilled stages to one timestamp.
    // Re-derive markers from the progressively-updated body each iteration so
    // each subsequent hole's floor/ceiling accounts for markers already
    // stamped this run (mirrors heal-entry-markers.mjs's healOne loop).
    let nextBody = body;
    for (const stage of holes) {
      const markers = parseEntryMarkersFirstVisit(nextBody);
      const ts = safeBackfillTs({ stage, markers, createdAt });
      nextBody = backfillEntryMarker(nextBody, stage, ts, `reconcile-backfill at ${ts}`);
    }
    await writeIssueBodyWithRetry({
      issueNumber,
      repo: cfg.repo,
      body: nextBody,
      bodyBefore: body,
      target: currentStage,
      writeIssueBody: ({ body: b }) => writeIssueBody({ issueNumber, repo: cfg.repo, body: b }),
    });
    persistTrackerState({ issueNumber, state: currentStage });
    return { status: 'backfilled', stage: currentStage, filled: holes };
  }

  // #1016 — sentinel-only drift is intentionally checked before the historical
  // board===recorded early return. In the reproduced out-of-band shape those
  // two values agree; the final saga sentinel is the disagreeing proof source.
  if (mode === 'revert-to-sentinel') {
    if (!live) {
      return {
        status: 'error',
        message: `reconcile revert-to-sentinel: cannot resolve live state for #${issueNumber}`,
      };
    }
    const sentinel = readMoveCompleteState(body);
    if (!sentinel) {
      return {
        status: 'error',
        message: `reconcile revert-to-sentinel: no move-complete sentinel for #${issueNumber}`,
      };
    }
    if (!stateIds().includes(sentinel)) {
      return {
        status: 'error',
        message: `reconcile revert-to-sentinel: unrecognized sentinel state "${sentinel}" for #${issueNumber}`,
      };
    }
    if (live === sentinel && recorded === sentinel) {
      return {
        status: 'no-drift-refused',
        live,
        recorded,
        message: `no sentinel drift detected for #${issueNumber}: board already matches "${sentinel}"`,
      };
    }

    if (live !== sentinel) {
      const exitCode = await runSentinelStatusWrite({
        issueNumber,
        target: sentinel,
        cfg,
      });
      if (exitCode !== 0) {
        return {
          status: 'transition-failed',
          exitCode,
          walked: [],
          failedAt: sentinel,
          message: `reconcile revert-to-sentinel: confirmed Status write to "${sentinel}" exited ${exitCode}`,
        };
      }
    }

    const nowTs = now();
    const recording = await writeIssueBodyWithRetry({
      issueNumber,
      repo: cfg.repo,
      target: sentinel,
      mutate: (base) => {
        const freshSentinel = readMoveCompleteState(base);
        if (freshSentinel !== sentinel) {
          throw new Error(
            `reconcile revert-to-sentinel: expected sentinel "${sentinel}" on fresh body, found "${freshSentinel || 'none'}"`
          );
        }
        return writeLastKnownState(base, sentinel);
      },
      postComment: deps.postComment,
      warn: deps.warn,
      deps: { mutateIssueBody: mutateBody },
    });
    if (recording.status === 'failed') {
      return {
        status: 'recording-failed',
        exitCode: 8,
        from: live,
        recorded,
        to: sentinel,
        message:
          `reconcile revert-to-sentinel: board is "${sentinel}" but recorded marker remains ` +
          `"${recorded ?? '∅'}": ${recording.error}`,
      };
    }
    persistTrackerState({ issueNumber, state: sentinel });
    try {
      await mutateBody({
        issueNumber,
        repo: cfg.repo,
        mutate: (base) =>
          appendAuditMarker(base, {
            kind: 'reverted',
            ts: nowTs,
            detail:
              `revert-to-sentinel: board "${live}", recorded "${recorded ?? '∅'}" ` +
              `→ sentinel "${sentinel}"`,
          }),
      });
    } catch {
      /* best-effort: failure must not abort the confirmed primary repair */
    }
    return {
      status: 'reconciled',
      mode,
      from: live,
      recorded,
      to: sentinel,
    };
  }

  if (recorded && live && recorded === live) {
    // #273 — even when board and body agree, the per-session derived cache
    // (`kanbanState` in active-task.json) can be absent: bind ran while the
    // network was flaky, the seed silently failed (pre-#273), or the user
    // is on a brand-new session that never seeded. Refusing here forces the
    // user to fabricate drift before they can recover, which was the exact
    // wedge #273 reports. Seed the cache and return a non-error status.
    try {
      const sid = currentSessionId();
      const projDir = getProjectDir();
      const active = sid ? getActiveTask(sid, projDir) : null;
      const cacheAbsent =
        active && active.issue === `#${issueNumber}` && active.kanbanState == null;
      if (cacheAbsent) {
        setSessionKanbanState(sid, recorded, projDir);
        return {
          status: 'cache-seeded',
          live,
          recorded,
          message: `cache seeded from board for #${issueNumber} (state="${recorded}")`,
        };
      }
    } catch (err) {
      // If the cache-seed attempt itself blows up, fall through to the
      // historical no-drift-refused response — the user can still inspect
      // the underlying error via stderr.
      process.stderr.write(`[reconcile] cache-seed attempt failed: ${err.message}\n`);
    }
    return {
      status: 'no-drift-refused',
      live,
      recorded,
      message: `no drift detected for #${issueNumber} (both = "${live}")`,
    };
  }

  if (mode === 'accept-live') {
    if (!live) {
      return {
        status: 'error',
        message: `reconcile accept-live: no live state for #${issueNumber}`,
      };
    }
    const nowTs = now();
    // #1037 — the supported recovery for a demotion interrupted after its
    // board move must finish the evidence invalidation that normal demote
    // performs. Keep this deliberately demotion-shaped: accept-live remains
    // non-destructive for forward and unrelated external drift.
    const invalidation =
      live === 'develop' && DEMOTION_RECOVERY_SOURCES.has(recorded)
        ? invalidateEvidence(body)
        : { body, invalidated: [] };
    const stamped = writeLastKnownState(invalidation.body, live);
    // Visit-aware schema (#181): preserve forward markers as history.
    // stampEntryMarker increments the visit suffix; the chain-integrity gate
    // validates the resulting sequence against LEGAL_TRANSITIONS.
    const stripped = invalidation.invalidated;
    const withEntry = stampEntryMarker(stamped, live, nowTs);
    await writeIssueBodyWithRetry({
      issueNumber,
      repo: cfg.repo,
      body: withEntry,
      bodyBefore: body,
      target: live,
      writeIssueBody: ({ body: b }) => writeIssueBody({ issueNumber, repo: cfg.repo, body: b }),
    });
    persistTrackerState({ issueNumber, state: live });
    try {
      const strippedNote = stripped.length > 0 ? `; stripped: ${stripped.join(', ')}` : '';
      let reason = 'external-mutation';
      if (listComments) {
        try {
          const comments = await listComments({ cfg, issueNumber });
          const hit = findRecordingFailureFromComments(comments);
          if (hit) {
            reason = `marker-write-failed at ${hit.createdAt}`;
          }
        } catch {
          // best-effort
        }
      }
      // #516 — drift reconcile is recorded as a body audit marker
      // (`aitm-reconciled`), not a ⏱ Timing Log row. The reconcile happens
      // inside the live state and consumes no distinct wall-clock, so a
      // dedicated timing row was noise.
      await mutateBody({
        issueNumber,
        repo: cfg.repo,
        mutate: (base) =>
          appendAuditMarker(base, {
            kind: 'reconciled',
            ts: nowTs,
            detail: `accept-live: recorded "${recorded ?? '∅'}" → live "${live}" (${reason})${strippedNote}`,
          }),
      });
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
    return { status: 'reconciled', mode, from: recorded, to: live, stripped };
  }

  // revert-to-recorded
  //
  // #740 — walk the board FORWARD one legal state at a time until it catches
  // up to the recorded marker. The prior implementation made a single
  // `runMoveState({ target: recorded })` jump, which only worked when the gap
  // was exactly one state: `move-state` validates every transition against the
  // adjacency-only executable lifecycle policy, so a
  // multi-state jump is an illegal transition and the lone call fails without
  // ever closing the gap. Composing the repair out of matrix-legal adjacent
  // hops keeps every step audited (each hop is a normal promote) instead of
  // teaching reconcile to bypass the matrix.
  if (!recorded) {
    return {
      status: 'error',
      message: `reconcile revert-to-recorded: no recorded state for #${issueNumber}`,
    };
  }
  if (!live) {
    return {
      status: 'error',
      message: `reconcile revert-to-recorded: cannot resolve live state for #${issueNumber}`,
    };
  }
  const liveIdx = stateIds().indexOf(live);
  const recIdx = stateIds().indexOf(recorded);
  if (liveIdx === -1 || recIdx === -1) {
    return {
      status: 'error',
      message: `reconcile revert-to-recorded: unrecognized state (live "${live}", recorded "${recorded}") for #${issueNumber}`,
    };
  }
  // #740 — revert is forward-only. When the recorded marker is BEHIND the live
  // board there is no legal backward walk to perform (BACKWARD covers only a
  // few edges, not a general reverse chain), so the honest answer is to refuse
  // and name `accept-live` — the operator's real intent in that case is to
  // accept the live board as truth and re-stamp the marker forward.
  if (recIdx < liveIdx) {
    return {
      status: 'wrong-direction',
      from: live,
      to: recorded,
      message:
        `reconcile revert-to-recorded: recorded state "${recorded}" is BEHIND live board "${live}" for #${issueNumber}. ` +
        `revert-to-recorded only walks the board FORWARD; it cannot move it backward. ` +
        `Run \`/task reconcile accept-live #${issueNumber}\` to accept the live board as truth and re-stamp the marker.`,
    };
  }
  // Already in agreement — recorded === live. Nothing to move; stamp the audit
  // marker and report reconciled (zero hops).
  const walked = [];
  let cursor = live;
  while (cursor !== recorded) {
    const next = forwardTarget(cursor);
    if (!next) {
      return {
        status: 'error',
        message: `reconcile revert-to-recorded: no forward edge from "${cursor}" toward "${recorded}" for #${issueNumber}`,
      };
    }
    const exitCode = await runMoveState({ issueNumber, target: next, cfg });
    if (exitCode !== 0) {
      return {
        status: 'transition-failed',
        exitCode,
        walked,
        failedAt: next,
        message: `reconcile: move-state.mjs ${next} exited ${exitCode} (walked ${walked.length ? walked.join('→') : '∅'} before failing)`,
      };
    }
    walked.push(next);
    cursor = next;
  }
  try {
    const nowTs = now();
    // #516 — drift revert is recorded as a body audit marker (`aitm-reverted`),
    // not a ⏱ Timing Log row (same rationale as accept-live above).
    const path = walked.length
      ? `${live} → ${walked.join(' → ')}`
      : `${live} (already at recorded)`;
    await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) =>
        appendAuditMarker(base, {
          kind: 'reverted',
          ts: nowTs,
          detail: `revert: walked forward ${path} to recorded "${recorded}"`,
        }),
    });
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  return { status: 'reconciled', mode, from: live, to: recorded, walked };
}

// ---------------------------------------------------------------------------
// CLI wrapper.
// ---------------------------------------------------------------------------

function parseArgs(rest) {
  let issueNumber = null;
  let mode = null;
  for (const a of rest) {
    const m = String(a).match(/^#?(\d+)$/);
    if (m) {
      issueNumber = Number(m[1]);
      continue;
    }
    if (MODES.has(a)) {
      mode = a;
      continue;
    }
  }
  return { issueNumber, mode };
}

export async function verbReconcile(rest, cfg, deps = {}) {
  const { issueNumber, mode } = parseArgs(rest);
  if (!issueNumber || !mode) {
    process.stderr.write(
      'Usage: /task reconcile <accept-live|revert-to-recorded|revert-to-sentinel|backfill> #N\n'
    );
    process.exit(1);
  }

  let result;
  try {
    result = await withIssueLock(
      { issue: issueNumber, verb: 'reconcile', projDir: getProjectDir() },
      // `deps` defaults to `{}` on the real CLI path, so live behaviour is
      // unchanged; tests forward mocked I/O seams to drive every CLI arm
      // offline without a `gh` subprocess inside the process.exit trap window.
      () => runReconcile({ issueNumber, mode, cfg, deps })
    );
  } catch (err) {
    if (err instanceof IssueLockError) {
      process.stderr.write(`⛔ ${err.message}\n`);
      process.exit(7);
    }
    process.stderr.write(`reconcile: ${err.message}\n`);
    process.exit(1);
  }

  switch (result.status) {
    case 'reconciled': {
      process.stdout.write(
        `✓ #${issueNumber} reconciled (${result.mode}): ${result.from ?? '∅'} → ${result.to}\n`
      );
      return;
    }
    case 'backfilled': {
      process.stdout.write(
        `✓ #${issueNumber} backfilled (${result.stage}): filled ${result.filled.join(', ')}\n`
      );
      return;
    }
    case 'no-holes': {
      process.stdout.write(`✓ #${issueNumber}: ${result.message}\n`);
      return;
    }
    case 'no-drift-refused': {
      process.stderr.write(`\n⛔ Refusing to reconcile #${issueNumber}:\n   ${result.message}\n\n`);
      process.exit(4);
    }
    case 'transition-failed': {
      process.stderr.write(`reconcile: ${result.message}\n`);
      process.exit(result.exitCode || 1);
    }
    case 'recording-failed': {
      process.stderr.write(`reconcile: ${result.message}\n`);
      process.exit(result.exitCode || 8);
    }
    case 'wrong-direction': {
      process.stderr.write(`\n⛔ ${result.message}\n\n`);
      process.exit(5);
    }
    case 'error': {
      process.stderr.write(`reconcile: ${result.message}\n`);
      process.exit(1);
    }
    default: {
      process.stderr.write(`reconcile: unknown result status: ${result.status}\n`);
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
  await verbReconcile(process.argv.slice(2), cfg);
}
