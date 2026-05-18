// `demote` verb — directional backward state-change (#81 rename of `/task move`).
//
// The only backward path on the kanban is `validate → development` and
// `review → development` — both for failed-tests / review-rework loops. From
// every other state demote refuses. There is no gate (rework is intentional)
// and no alias delegation — demote calls `scripts/gh/move-state.mjs` directly
// with `AITM_INTERNAL=1`.
//
// Drift detection mirrors `promote.mjs` exactly: if the live board state
// disagrees with the recorded lastKnownState, refuse and point at
// `/task reconcile`.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { BACKWARD, STATES, validateTransition, normalizeStateSlug } from '../state-machine.mjs';
import {
  readLastKnownState,
  writeLastKnownState,
  buildRow,
  postTimingEvent,
  readTimingCommentBody,
} from '../gh-timing-comment.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';
import { writeIssueBodyWithRetry } from '../lib/state-recording.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

const DEMOTE_TARGET = 'develop';
const LEGAL_FROM = new Set(['test', 'review']);

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
  if (!issue) throw new Error(`demote: issue #${issueNumber} not found in ${repo}`);
  return { body: issue.body || '' };
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(tmpdir(), `aitm-demote-${process.pid}-${Date.now()}.md`);
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
      env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'demote' },
      timeout: GH_API_TIMEOUT_MS * 2,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function defaultPostTimingRow({ issueNumber, repo, row }) {
  await postTimingEvent({ issueNumber: String(issueNumber), repo, row, timeoutMs: 5000 });
}

// ---------------------------------------------------------------------------
// Pure core.
// ---------------------------------------------------------------------------

export async function runDemote({
  issueNumber,
  cfg,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!issueNumber) throw new Error('demote: issueNumber is required');
  if (!cfg) throw new Error('demote: cfg is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const postTimingRow = deps.postTimingRow || defaultPostTimingRow;

  const { body: initialBody } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const { state: rawRecorded } = readLastKnownState(initialBody);
  const live = (await getLiveState({ issueNumber, cfg })) || null;

  let recorded = rawRecorded;
  let body = initialBody;
  let bootstrapped = false;
  if (!recorded) {
    if (!live) {
      return {
        status: 'error',
        message: `demote: no recorded state and no live state for #${issueNumber} — board item missing`,
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

  if (!STATES.includes(recorded)) {
    return {
      status: 'error',
      message: `demote: unknown recorded state "${recorded}" for #${issueNumber}`,
    };
  }
  if (!LEGAL_FROM.has(recorded)) {
    return {
      status: 'invalid-source-refused',
      from: recorded,
      message: 'demote only valid from test or review',
    };
  }

  // Matrix sanity check — both legal sources have BACKWARD[from] === 'develop'.
  if (BACKWARD[recorded] !== DEMOTE_TARGET) {
    return {
      status: 'error',
      message: `demote: matrix says ${recorded}→${BACKWARD[recorded]}; expected ${DEMOTE_TARGET}`,
    };
  }
  const mx = validateTransition(recorded, DEMOTE_TARGET);
  if (!mx.ok) {
    return { status: 'error', message: `demote: ${mx.reason}` };
  }

  const exitCode = await runMoveState({ issueNumber, target: DEMOTE_TARGET, cfg });
  if (exitCode !== 0) {
    return {
      status: 'transition-failed',
      exitCode,
      message: `demote: move-state.mjs ${DEMOTE_TARGET} exited ${exitCode}; recorded state left at "${recorded}".`,
    };
  }

  let bodyAfter;
  try {
    ({ body: bodyAfter } = await fetchIssueBody({ issueNumber, repo: cfg.repo }));
  } catch {
    bodyAfter = body;
  }
  const stamped = writeLastKnownState(bodyAfter, DEMOTE_TARGET);
  await writeIssueBodyWithRetry({
    issueNumber,
    repo: cfg.repo,
    body: stamped,
    bodyBefore: bodyAfter,
    target: DEMOTE_TARGET,
    writeIssueBody,
  });
  try {
    const nowTs = now();
    const timingBody = await readTimingCommentBody({ issueNumber, repo: cfg.repo });
    const { activeSec, idleSec } = deriveStateMoveDelta(timingBody, nowTs);
    const row = buildRow({
      ts: nowTs,
      event: `move:${DEMOTE_TARGET}`,
      activeSec,
      idleSec,
      deltaWords: 0,
      // wordMarker:0 audit row — demote move event, no active session
      wordMarker: 0,
      description: `demote from ${recorded}`,
    });
    await postTimingRow({ issueNumber, repo: cfg.repo, row });
  } catch {}

  return { status: 'demoted', from: recorded, to: DEMOTE_TARGET, bootstrapped };
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

export async function verbDemote(rest, cfg) {
  const { issueNumber } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: demote #N\n');
    process.exit(1);
  }

  let result;
  try {
    result = await runDemote({ issueNumber, cfg });
  } catch (err) {
    process.stderr.write(`demote: ${err.message}\n`);
    process.exit(1);
  }

  switch (result.status) {
    case 'demoted': {
      process.stdout.write(
        `✓ #${issueNumber} demoted: ${result.from} → ${result.to}` +
          (result.bootstrapped ? ' (bootstrap: lastKnownState was empty)' : '') +
          '\n'
      );
      return;
    }
    case 'drift-refused': {
      process.stderr.write(
        `\n⛔ Refusing to demote #${issueNumber}:\n   BLOCKED: ${result.message}\n\n`
      );
      process.exit(4);
    }
    case 'invalid-source-refused': {
      process.stderr.write(
        `\n⛔ Refusing to demote #${issueNumber} from ${result.from}:\n   BLOCKED: ${result.message}\n\n`
      );
      process.exit(4);
    }
    case 'transition-failed': {
      process.stderr.write(`demote: ${result.message}\n`);
      process.exit(result.exitCode || 1);
    }
    case 'error': {
      process.stderr.write(`demote: ${result.message}\n`);
      process.exit(1);
    }
    default: {
      process.stderr.write(`demote: unknown result status: ${result.status}\n`);
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
  await verbDemote(process.argv.slice(2), cfg);
}
