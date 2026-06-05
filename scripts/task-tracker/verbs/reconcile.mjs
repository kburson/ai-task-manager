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
//
// No state-machine validation: this is a recovery path. The matrix may forbid
// the resulting transition (e.g. manual board fix to a non-adjacent state) and
// the user has explicitly opted into the gap.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

import {
  readLastKnownState,
  writeLastKnownState,
  buildRow,
  postTimingEvent,
  readTimingCommentBody,
} from '../gh-timing-comment.mjs';
import {
  findRecordingFailureFromComments,
  writeIssueBodyWithRetry,
} from '../lib/state-recording.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { getActiveTask, setSessionKanbanState } from '../session-state.mjs';
import { currentSessionId } from '../word-counter.mjs';
import { stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { normalizeStateSlug } from '../state-machine.mjs';
import { getProjectDir } from '../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
// keep: recovery snapshot semantics intentional — reconcile force-rewrites the
// body verbatim (no closure), so pushIssueBody is the correct primitive here.
import { pushIssueBody } from '../lib/issue-body-push.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';
import { withIssueLock, IssueLockError } from '../issue-mutator-lock.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

const MODES = new Set(['accept-live', 'revert-to-recorded']);

// ---------------------------------------------------------------------------
// Default I/O — DI seams.
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
  if (!issue) throw new Error(`reconcile: issue #${issueNumber} not found in ${repo}`);
  return { body: issue.body || '' };
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(
    projectScratchDir('test'),
    `aitm-reconcile-${process.pid}-${Date.now()}.md`
  );
  await pushIssueBody({ issueNumber, repo, body, scratchPath: tmp, deps: { pexec } });
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

function defaultRunMoveState({ issueNumber, target }) {
  const script = path.resolve(__dir, '../../gh/move-state.mjs');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, String(issueNumber), target], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'reconcile' },
      timeout: GH_API_TIMEOUT_MS * 2,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function defaultPostTimingRow({ issueNumber, repo, row }) {
  await postTimingEvent({ issueNumber: String(issueNumber), repo, row, timeoutMs: 5000 });
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
    const projDir = process.env.AI_TASK_MANAGER_PROJECT_DIR || process.cwd();
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
      message: 'reconcile: mode is required — use `accept-live` or `revert-to-recorded`',
    };
  }
  if (!MODES.has(mode)) {
    return {
      status: 'error',
      message: `reconcile: unknown mode "${mode}" — use accept-live or revert-to-recorded`,
    };
  }

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const postTimingRow = deps.postTimingRow || defaultPostTimingRow;
  const persistTrackerState = deps.persistTrackerState || defaultPersistTrackerState;
  const listComments = deps.listComments || null;

  const { body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const { state: recorded } = readLastKnownState(body);
  const live = (await getLiveState({ issueNumber, cfg })) || null;

  if (!live && !recorded) {
    return { status: 'error', message: `reconcile: no live or recorded state for #${issueNumber}` };
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
    const stamped = writeLastKnownState(body, live);
    // Visit-aware schema (#181): preserve forward markers as history.
    // stampEntryMarker increments the visit suffix; the chain-integrity gate
    // validates the resulting sequence against LEGAL_TRANSITIONS.
    const stripped = [];
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
      const timingBody = await readTimingCommentBody({ issueNumber, repo: cfg.repo });
      const { activeSec, idleSec } = deriveStateMoveDelta(timingBody, nowTs);
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
      const row = buildRow({
        ts: nowTs,
        event: 'drift-reconcile',
        activeSec,
        idleSec,
        deltaWords: 0,
        // wordMarker:0 audit row — drift-reconcile event, no active session
        wordMarker: 0,
        description: `accept-live: recorded "${recorded ?? '∅'}" → live "${live}" (${reason})${strippedNote}`,
      });
      await postTimingRow({ issueNumber, repo: cfg.repo, row });
    } catch {}
    return { status: 'reconciled', mode, from: recorded, to: live, stripped };
  }

  // revert-to-recorded
  if (!recorded) {
    return {
      status: 'error',
      message: `reconcile revert-to-recorded: no recorded state for #${issueNumber}`,
    };
  }
  const exitCode = await runMoveState({ issueNumber, target: recorded, cfg });
  if (exitCode !== 0) {
    return {
      status: 'transition-failed',
      exitCode,
      message: `reconcile: move-state.mjs ${recorded} exited ${exitCode}`,
    };
  }
  try {
    const nowTs = now();
    const timingBody = await readTimingCommentBody({ issueNumber, repo: cfg.repo });
    const { activeSec, idleSec } = deriveStateMoveDelta(timingBody, nowTs);
    const row = buildRow({
      ts: nowTs,
      event: 'drift-revert',
      activeSec,
      idleSec,
      deltaWords: 0,
      // wordMarker:0 audit row — drift-revert event, no active session
      wordMarker: 0,
      description: `revert: live "${live ?? '∅'}" → recorded "${recorded}"`,
    });
    await postTimingRow({ issueNumber, repo: cfg.repo, row });
  } catch {}
  return { status: 'reconciled', mode, from: live, to: recorded };
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

export async function verbReconcile(rest, cfg) {
  const { issueNumber, mode } = parseArgs(rest);
  if (!issueNumber || !mode) {
    process.stderr.write('Usage: /task reconcile <accept-live|revert-to-recorded> #N\n');
    process.exit(1);
  }

  let result;
  try {
    result = await withIssueLock(
      { issue: issueNumber, verb: 'reconcile', projDir: getProjectDir() },
      () => runReconcile({ issueNumber, mode, cfg })
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
    case 'no-drift-refused': {
      process.stderr.write(`\n⛔ Refusing to reconcile #${issueNumber}:\n   ${result.message}\n\n`);
      process.exit(4);
    }
    case 'transition-failed': {
      process.stderr.write(`reconcile: ${result.message}\n`);
      process.exit(result.exitCode || 1);
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
