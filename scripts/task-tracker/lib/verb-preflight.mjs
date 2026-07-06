// Shared verb preflight (#208, refactored in #218) — bind-match + live-state
// reconciliation.
//
// `runPreflight` is a pure core: it takes the loaded task-tracker state and
// an optional target issue, and reports one of three outcomes:
//
//   1. bind-mismatch  — exit 7 — target ≠ state.active and both are set.
//      Caller must abort and tell the user to rebind (`/task #N`).
//   2. drift          — exit 9 (kind: `human-move`) — board state ≠ the
//      issue body's `aitm-last-known-state` marker. The marker is updated
//      atomically by every move-state.mjs run, so any divergence means
//      either the board was hand-edited via the GitHub UI or a marker
//      write failed. Caller prompts: "reconcile?"
//   3. ok             — bind matches (or none), board == marker (or no
//      live data / no marker yet).
//
// #218: the previous "local cache (`state.state`) vs live" comparison was
// replaced with "issue body marker vs live." The body and board are now the
// only two sources, so reconcile (marker vs board) and preflight (marker vs
// board) cannot disagree.
//
// The `ai-oversight` kind / exit code is retained as a no-op branch for
// backwards-compat with downstream callers, but `runPreflight` never emits
// it under the new model — all drift surfaces as `human-move`.
//
// All network I/O is injected. When `TT_SKIP_NETWORK=1` the live fetch is
// skipped and the preflight only enforces bind-match.

import { fetchLiveKanbanState } from '../../gh/lib/live-state.mjs';
import { normalizeStateSlug } from '../state-machine.mjs';
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { saveState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import {
  checkAssigneeMatch,
  formatAssigneeRefusal,
  formatAssigneePromptLine,
  EXIT_ASSIGNEE_MISMATCH,
} from './assignee-guard.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

export const EXIT_BIND_MISMATCH = 7;
export const EXIT_AI_OVERSIGHT = 8;
export const EXIT_HUMAN_MOVE = 9;
export { EXIT_ASSIGNEE_MISMATCH };

function normalizeIssueNumber(target) {
  if (target == null) return null;
  const m = String(target).match(/^#?(\d+)$/);
  return m ? m[1] : null;
}

async function defaultFetchLastKnownState({ issueNumber, repo, gqlFn = gql }) {
  const { owner, repoName } = splitRepo(repo);
  try {
    const data = await gqlFn(
      `query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) { body }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber) }
    );
    const body = data?.repository?.issue?.body ?? '';
    return readLastKnownState(body).state;
  } catch {
    return null;
  }
}

// Best-effort actor lookup via the issue timeline. Projects v2 does NOT
// emit `MovedColumnsInProjectEvent` (only classic projects do), so this
// returns null in most modern repos. Used purely as a tie-breaker when the
// marker heuristic is ambiguous — the classifier never depends on it.
async function defaultFetchLastStatusActor({ issueNumber, repo, exec = pexec }) {
  try {
    const { owner, repoName } = splitRepo(repo);
    const { stdout } = await exec(
      'gh',
      ['api', `/repos/${owner}/${repoName}/issues/${issueNumber}/timeline`, '--paginate'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const events = JSON.parse(stdout);
    if (!Array.isArray(events)) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev?.event === 'moved_columns_in_project' && ev.actor) {
        return { login: ev.actor.login, type: ev.actor.type };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Pure core. Caller provides loaded state + deps; we return a verdict.
export async function runPreflight({ stateBefore, target, cfg, deps = {} } = {}) {
  if (!stateBefore) throw new Error('runPreflight: stateBefore is required');

  const targetIssue = normalizeIssueNumber(target);
  const activeIssue = normalizeIssueNumber(stateBefore.active);

  if (targetIssue && activeIssue && targetIssue !== activeIssue) {
    return {
      ok: false,
      code: EXIT_BIND_MISMATCH,
      kind: 'bind-mismatch',
      active: stateBefore.active,
      target,
    };
  }

  const issueForReconcile = targetIssue || activeIssue;
  if (!issueForReconcile) return { ok: true, stateAfter: stateBefore, changed: false };

  if (process.env.TT_SKIP_NETWORK === '1') {
    return { ok: true, stateAfter: stateBefore, changed: false, skippedNetwork: true };
  }
  if (!cfg) return { ok: true, stateAfter: stateBefore, changed: false };

  // #219: assignee guard runs before drift check. Preference-gated; default on.
  const gateAssignee = cfg.preferences?.gateAssigneeMatch ?? true;
  if (gateAssignee) {
    let assigneeVerdict;
    try {
      assigneeVerdict = await checkAssigneeMatch({
        issueNumber: issueForReconcile,
        cfg,
        deps: {
          fetchAssignees: deps.fetchAssignees,
          fetchCurrentUser: deps.fetchCurrentUser,
          cache: deps.assigneeCache,
        },
      });
    } catch {
      assigneeVerdict = { ok: true };
    }
    if (!assigneeVerdict.ok) {
      return {
        ok: false,
        code: EXIT_ASSIGNEE_MISMATCH,
        kind: 'assignee-mismatch',
        assigneeKind: assigneeVerdict.kind,
        currentUser: assigneeVerdict.currentUser,
        assignees: assigneeVerdict.assignees,
        issueNumber: issueForReconcile,
      };
    }
  }

  // #633 — thread injectable gql/exec into the two default fetchers so their
  // network round-trips are unit-drivable. Production passes neither, so the
  // real `gql`/`pexec` bind — byte-identical to prior behavior.
  const gqlFn = deps.gql || gql;
  const execFn = deps.exec || pexec;
  const fetchLive = deps.fetchLive || fetchLiveKanbanState;
  const fetchMarker =
    deps.fetchLastKnownState || ((a) => defaultFetchLastKnownState({ ...a, gqlFn }));
  const fetchActor =
    deps.fetchLastStatusActor || ((a) => defaultFetchLastStatusActor({ ...a, exec: execFn }));

  let live = '';
  try {
    live = await fetchLive({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber: issueForReconcile,
    });
  } catch {
    live = '';
  }
  // #436 — normalize through the single slug helper (collapses interior
  // whitespace) so a multi-word board name compares equal to the kebab marker.
  live = normalizeStateSlug(live) || '';
  if (!live) return { ok: true, stateAfter: stateBefore, changed: false };

  // #218: the issue body marker is the single local source of truth. Fetch
  // it unconditionally and compare to live; the loaded `stateBefore.state`
  // (if any legacy cache still carries it) is ignored.
  let marker = null;
  try {
    marker = await fetchMarker({ issueNumber: issueForReconcile, repo: cfg.repo });
  } catch {
    marker = null;
  }
  marker = marker ? normalizeStateSlug(marker) : null;

  // Marker absent (freshly created, never moved) or matches live: no drift.
  if (!marker || marker === live) {
    return { ok: true, stateAfter: stateBefore, changed: false };
  }

  let actor = null;
  try {
    actor = await fetchActor({ issueNumber: issueForReconcile, repo: cfg.repo });
  } catch {
    actor = null;
  }

  return {
    ok: false,
    code: EXIT_HUMAN_MOVE,
    kind: 'human-move',
    live,
    local: marker,
    marker,
    actor,
    issueNumber: issueForReconcile,
  };
}

// Verb-facing wrapper. Reads stateBefore, runs preflight, writes back state
// on ok, prints PROMPT_REQUIRED + explanation and `process.exit(code)` on
// refusal. Returns the reconciled state object (or process exits first).
export async function preflightVerb({
  stateBefore,
  statePath,
  target,
  cfg,
  verb = 'verb',
  deps = {},
} = {}) {
  const verdict = await runPreflight({ stateBefore, target, cfg, deps });
  if (verdict.ok) {
    if (verdict.changed) saveState(verdict.stateAfter, statePath);
    return verdict.stateAfter;
  }

  switch (verdict.kind) {
    case 'bind-mismatch': {
      process.stdout.write(`PROMPT_REQUIRED: bind-mismatch ${verdict.active}:${verdict.target}\n`);
      process.stderr.write(
        `⛔ Refusing /task ${verb}: target ${verdict.target} differs from active binding ${verdict.active}. Run \`/task ${verdict.target}\` to rebind, then retry.\n`
      );
      process.exit(EXIT_BIND_MISMATCH);
      return;
    }
    case 'ai-oversight': {
      const issue = `#${verdict.issueNumber}`;
      process.stdout.write(
        `PROMPT_REQUIRED: ai-oversight ${issue} ${verdict.local}:${verdict.live}\n`
      );
      process.stderr.write(
        `⛔ Refusing /task ${verb}: board for ${issue} is "${verdict.live}", local cache says "${verdict.local}". The last-known-state marker matches the board, so a scripted move ran outside this session. Run \`/task reconcile accept-live ${issue}\` to adopt the board state, or investigate the drift before retrying.\n`
      );
      process.exit(EXIT_AI_OVERSIGHT);
      return;
    }
    case 'assignee-mismatch': {
      const verdict2 = {
        kind: verdict.assigneeKind,
        currentUser: verdict.currentUser,
        assignees: verdict.assignees,
      };
      process.stdout.write(
        formatAssigneePromptLine({ issueNumber: verdict.issueNumber, verdict: verdict2 }) + '\n'
      );
      process.stderr.write(
        formatAssigneeRefusal({ verb, issueNumber: verdict.issueNumber, verdict: verdict2 }) + '\n'
      );
      process.exit(EXIT_ASSIGNEE_MISMATCH);
      return;
    }
    case 'human-move': {
      const issue = `#${verdict.issueNumber}`;
      const markerNote = verdict.marker ? `marker says "${verdict.marker}"` : `marker is unset`;
      const actorNote = verdict.actor?.login ? ` (last status actor: @${verdict.actor.login})` : '';
      process.stdout.write(
        `PROMPT_REQUIRED: human-move ${issue} ${verdict.local}:${verdict.live}\n`
      );
      process.stderr.write(
        `⛔ Refusing /task ${verb}: board for ${issue} is "${verdict.live}", local cache says "${verdict.local}", ${markerNote}${actorNote}. The board diverges from the marker — likely causes: a hand-edit through the GitHub UI, or a dropped/failed board-field write during an earlier move that left the board behind the marker. Run \`/task reconcile accept-live ${issue}\` if the board is correct, or fix the board then retry.\n`
      );
      process.exit(EXIT_HUMAN_MOVE);
      return;
    }
    default: {
      process.stderr.write(`preflightVerb: unknown verdict ${verdict.kind}\n`);
      process.exit(1);
    }
  }
}
