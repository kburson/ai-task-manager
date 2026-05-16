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
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  readLastKnownState,
  writeLastKnownState,
  buildRow,
  postTimingEvent,
} from '../gh-timing-comment.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { loadState, saveState } from '../state.mjs';
import { normalizeStateSlug } from '../state-machine.mjs';
import { getProjectDir, existingRuntimePath, SHARED_DIR } from '../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

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
  const tmp = path.join(tmpdir(), `aitm-reconcile-${process.pid}-${Date.now()}.md`);
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

function defaultPersistTrackerState({ issueNumber, state }) {
  try {
    const projectDir = getProjectDir();
    const sp = existingRuntimePath(projectDir, `${SHARED_DIR}/task-tracker-state.json`);
    const s = loadState(sp);
    if (s.active === `#${issueNumber}`) {
      s.state = state;
      saveState(s, sp);
    }
  } catch {
    /* best-effort */
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

  const { body } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const { state: recorded } = readLastKnownState(body);
  const live = (await getLiveState({ issueNumber, cfg })) || null;

  if (!live && !recorded) {
    return { status: 'error', message: `reconcile: no live or recorded state for #${issueNumber}` };
  }
  if (recorded && live && recorded === live) {
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
    const stamped = writeLastKnownState(body, live);
    await writeIssueBody({ issueNumber, repo: cfg.repo, body: stamped });
    persistTrackerState({ issueNumber, state: live });
    try {
      const row = buildRow({
        ts: now(),
        event: 'drift-reconcile',
        activeMin: 0,
        idleMin: 0,
        deltaWords: 0,
        wordMarker: 0,
        description: `accept-live: recorded "${recorded ?? '∅'}" → live "${live}"`,
      });
      await postTimingRow({ issueNumber, repo: cfg.repo, row });
    } catch {}
    return { status: 'reconciled', mode, from: recorded, to: live };
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
    const row = buildRow({
      ts: now(),
      event: 'drift-revert',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
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
    result = await runReconcile({ issueNumber, mode, cfg });
  } catch (err) {
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
