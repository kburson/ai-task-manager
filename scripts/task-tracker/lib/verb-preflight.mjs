// Shared verb preflight (#208) — bind-match + live-state reconciliation.
//
// `runPreflight` is a pure core: it takes the loaded task-tracker state and
// an optional target issue, and reports one of four outcomes:
//
//   1. bind-mismatch  — exit 7 — target ≠ state.active and both are set.
//      Caller must abort and tell the user to rebind (`/task #N`).
//   2. ai-oversight   — exit 8 — board state ≠ local state, but the
//      `aitm-last-known-state` marker matches the board. Some scripted move
//      ran without notifying the local cache. Caller prompts:
//      "AI moved the board; accept it?"
//   3. human-move     — exit 9 — board state ≠ local state AND marker ≠
//      board. The marker is updated atomically by every move-state.mjs run,
//      so a marker that's behind the board implies a hand-edit through the
//      GitHub UI. Caller prompts: "Human moved the board; reconcile?"
//   4. ok             — bind matches (or none), board == local (or no live
//      data). state.state is rewritten to the live value so the local cache
//      stays in sync.
//
// All network I/O is injected. When `TT_SKIP_NETWORK=1` the live fetch is
// skipped and the preflight only enforces bind-match.

import { fetchLiveKanbanState } from '../../gh/lib/live-state.mjs';
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { saveState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

export const EXIT_BIND_MISMATCH = 7;
export const EXIT_AI_OVERSIGHT = 8;
export const EXIT_HUMAN_MOVE = 9;

function normalizeIssueNumber(target) {
  if (target == null) return null;
  const m = String(target).match(/^#?(\d+)$/);
  return m ? m[1] : null;
}

async function defaultFetchLastKnownState({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  try {
    const data = await gql(
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
async function defaultFetchLastStatusActor({ issueNumber, repo }) {
  try {
    const { owner, repoName } = splitRepo(repo);
    const { stdout } = await pexec(
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

  const fetchLive = deps.fetchLive || fetchLiveKanbanState;
  const fetchMarker = deps.fetchLastKnownState || defaultFetchLastKnownState;
  const fetchActor = deps.fetchLastStatusActor || defaultFetchLastStatusActor;

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
  live = String(live || '').toLowerCase();
  if (!live) return { ok: true, stateAfter: stateBefore, changed: false };

  const localState = stateBefore.state ? String(stateBefore.state).toLowerCase() : null;

  if (!localState || localState === live) {
    if (stateBefore.state === live) return { ok: true, stateAfter: stateBefore, changed: false };
    return {
      ok: true,
      stateAfter: { ...stateBefore, state: live },
      changed: true,
      live,
    };
  }

  // Mismatch: classify via marker (primary) then actor (best-effort).
  let marker = null;
  try {
    marker = await fetchMarker({ issueNumber: issueForReconcile, repo: cfg.repo });
  } catch {
    marker = null;
  }
  marker = marker ? String(marker).toLowerCase() : null;

  let actor = null;
  try {
    actor = await fetchActor({ issueNumber: issueForReconcile, repo: cfg.repo });
  } catch {
    actor = null;
  }

  if (marker && marker === live) {
    return {
      ok: false,
      code: EXIT_AI_OVERSIGHT,
      kind: 'ai-oversight',
      live,
      local: localState,
      marker,
      actor,
      issueNumber: issueForReconcile,
    };
  }

  return {
    ok: false,
    code: EXIT_HUMAN_MOVE,
    kind: 'human-move',
    live,
    local: localState,
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
    case 'human-move': {
      const issue = `#${verdict.issueNumber}`;
      const markerNote = verdict.marker ? `marker says "${verdict.marker}"` : `marker is unset`;
      const actorNote = verdict.actor?.login ? ` (last status actor: @${verdict.actor.login})` : '';
      process.stdout.write(
        `PROMPT_REQUIRED: human-move ${issue} ${verdict.local}:${verdict.live}\n`
      );
      process.stderr.write(
        `⛔ Refusing /task ${verb}: board for ${issue} is "${verdict.live}", local cache says "${verdict.local}", ${markerNote}${actorNote}. The marker is updated atomically by move-state.mjs, so this drift looks like a hand-edit through the GitHub UI. Run \`/task reconcile accept-live ${issue}\` if the board is correct, or fix the board then retry.\n`
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
