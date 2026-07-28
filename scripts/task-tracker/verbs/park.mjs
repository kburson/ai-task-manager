// `park` verb — the Refine|Plan → Backlog transition (#848).
//
// `demote` is a CODE-REWORK path (`test|review → develop`) and refuses from
// every other state (#935). There was no sanctioned way to send a refined-
// then-falsified issue (premise wrong, cannot reproduce, deprioritized) back
// to Backlog — `demote` cannot target `backlog` (DEMOTE_TARGET is hardcoded
// to `develop`), and `move-state.mjs` refuses direct invocation. `park` fills
// that gap: legal only from `refine` or `plan`, targets `backlog`, requires a
// non-empty reason (mirroring `demote --rework`'s fail-loud contract), and
// does NOT clear Priority/Size/Estimate — a re-picked issue does not
// re-litigate its sizing.
//
// Delegates to `move-state.mjs` via `runMoveStateHost` exactly as `demote`
// does, reusing the `--demote`/`--demote-reason` flag pair so the audit-timing
// layer emits an honest backward-move row (`demoted:backlog`) instead of the
// forward-completion vocabulary (`refine:completed` / `backlog:created`) a
// plain move would produce. This also makes the already-built, previously
// dead `backlogMoveWarning` (guard-execution.mjs) fire naturally — no new
// caller-specific plumbing required there.
//
// Drift detection mirrors `demote.mjs` exactly: if the live board state
// disagrees with the recorded lastKnownState, refuse and point at
// `/task reconcile`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  actionPolicyFor,
  backwardTargets,
  normalizeStateId,
  validateExecutableTransition,
} from '../lib/lifecycle-policy/index.mjs';
import { readLastKnownState, writeLastKnownState } from '../gh-timing-comment.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { writeIssueBodyWithRetry } from '../lib/state-recording.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import { runMoveStateHost } from '../../gh/move-state.mjs';

const pexec = promisify(execFile);

// Exported (not just local) so `move-state-policy.test.mjs` (#848 AC7) can
// assert `refusalVerbHint`'s named verb actually declares the hinted target
// legal, without shelling out.
const PARK_POLICY = actionPolicyFor('park');
export const PARK_TARGET = PARK_POLICY.target;
export const LEGAL_FROM = new Set(PARK_POLICY.allowedStates);

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
  if (!issue) throw new Error(`park: issue #${issueNumber} not found in ${repo}`);
  return { body: issue.body || '' };
}

// #295: writes go through `mutateIssueBody({ mutate })` — the closure is
// invoked with the FRESH base every push attempt, so a concurrent writer
// between the verb's pre-fetch and our push is preserved.
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
  return normalizeStateId(node?.fieldValueByName?.name);
}

// Reuses the `--demote`/`--demote-reason` flag pair (see file header for why):
// same board-move mechanics, honest backward-move audit row, no new flag.
export function defaultRunMoveState(
  { issueNumber, target, reason },
  { host = runMoveStateHost } = {}
) {
  const argv = [process.execPath, 'move-state.mjs', String(issueNumber), target, '--demote'];
  const trimmedReason = String(reason || '').trim();
  if (trimmedReason) argv.push('--demote-reason', trimmedReason);
  return host({
    argv,
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'park' },
  });
}

// ---------------------------------------------------------------------------
// Pure core.
// ---------------------------------------------------------------------------

export async function runPark({ issueNumber, cfg, reason, deps = {} } = {}) {
  if (!issueNumber) throw new Error('park: issueNumber is required');
  if (!cfg) throw new Error('park: cfg is required');
  const assertBound = deps.assertBound ?? assertBoundToIssue;
  assertBound(issueNumber);

  // Hard-refuse a park with no declared reason, BEFORE any network fetch or
  // board move — mirrors `demote --rework`'s fail-loud contract (#935).
  const parkReason = String(reason || '').trim();
  if (!parkReason) {
    return {
      status: 'reason-required',
      message: 'park: pass `--reason "<text>"` to record why this issue is returning to Backlog.',
    };
  }

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const runMoveState = deps.runMoveState || defaultRunMoveState;

  const { body: initialBody } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const { state: rawRecorded } = readLastKnownState(initialBody);
  const live = (await getLiveState({ issueNumber, cfg })) || null;

  let recorded = rawRecorded;
  let bootstrapped = false;
  if (!recorded) {
    if (!live) {
      return {
        status: 'error',
        message: `park: no recorded state and no live state for #${issueNumber} — board item missing`,
      };
    }
    await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) => writeLastKnownState(base, live),
    });
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

  const parkPolicy = actionPolicyFor('park', recorded);
  if (parkPolicy.kind === 'unknown-state') {
    return {
      status: 'error',
      message: `park: unknown recorded state "${recorded}" for #${issueNumber}`,
    };
  }
  if (!parkPolicy.ok) {
    return {
      status: 'invalid-source-refused',
      from: recorded,
      message: 'park only valid from refine or plan',
    };
  }

  // Matrix sanity check — both legal sources include PARK_TARGET among their
  // backward targets (canonical lifecycle policy, #848).
  if (!backwardTargets(recorded).includes(PARK_TARGET)) {
    return {
      status: 'error',
      message: `park: matrix says ${recorded}→${backwardTargets(recorded).join('|')}; expected ${PARK_TARGET}`,
    };
  }
  const mx = validateExecutableTransition(recorded, PARK_TARGET);
  if (!mx.ok) {
    return { status: 'error', message: `park: ${mx.reason}` };
  }

  const exitCode = await runMoveState({
    issueNumber,
    target: PARK_TARGET,
    reason: parkReason,
    cfg,
  });
  if (exitCode !== 0) {
    return {
      status: 'transition-failed',
      exitCode,
      message: `park: move-state.mjs ${PARK_TARGET} exited ${exitCode}; recorded state left at "${recorded}".`,
    };
  }

  // #295 — post-move stamp via mutateIssueBody closure; the helper re-fetches
  // the FRESH base inside the closure, so a concurrent writer between move
  // and stamp is preserved. Unlike `demote`, park deliberately does NOT run
  // `invalidateEvidence` — Priority/Size/Estimate (and any stamped evidence)
  // survive the round trip so a re-pick doesn't re-litigate sizing (AC4).
  await writeIssueBodyWithRetry({
    issueNumber,
    repo: cfg.repo,
    target: PARK_TARGET,
    mutate: (base) => writeLastKnownState(base, PARK_TARGET),
    deps: { mutateIssueBody: mutateBody },
  });

  return { status: 'parked', from: recorded, to: PARK_TARGET, bootstrapped };
}

// ---------------------------------------------------------------------------
// CLI wrapper.
// ---------------------------------------------------------------------------

export function parseArgs(rest) {
  let issueNumber = null;
  let reason = null;
  const args = Array.isArray(rest) ? rest.map(String) : [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--reason') {
      reason = args[i + 1] !== undefined ? args[i + 1] : '';
      i += 1;
      continue;
    }
    if (a.startsWith('--reason=')) {
      reason = a.slice('--reason='.length);
      continue;
    }
    const m = a.match(/^#?(\d+)$/);
    if (m && issueNumber === null) issueNumber = Number(m[1]);
  }
  return { issueNumber, reason };
}

export async function verbPark(rest, cfg, deps = {}) {
  const { issueNumber, reason } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: park #N --reason "<text>"\n');
    process.exit(1);
  }

  let result;
  try {
    result = await runPark({ issueNumber, cfg, reason, deps });
  } catch (err) {
    process.stderr.write(`park: ${err.message}\n`);
    process.exit(1);
  }

  switch (result.status) {
    case 'parked': {
      process.stdout.write(
        `✓ #${issueNumber} parked: ${result.from} → ${result.to}` +
          (result.bootstrapped ? ' (bootstrap: lastKnownState was empty)' : '') +
          '\n'
      );
      return;
    }
    case 'drift-refused': {
      process.stderr.write(
        `\n⛔ Refusing to park #${issueNumber}:\n   BLOCKED: ${result.message}\n\n`
      );
      process.exit(4);
    }
    case 'invalid-source-refused': {
      process.stderr.write(
        `\n⛔ Refusing to park #${issueNumber} from ${result.from}:\n   BLOCKED: ${result.message}\n\n`
      );
      process.exit(4);
    }
    case 'reason-required': {
      process.stderr.write(
        `\n⛔ Refusing to park #${issueNumber}:\n   BLOCKED: ${result.message}\n\n`
      );
      process.exit(4);
    }
    case 'transition-failed': {
      process.stderr.write(`park: ${result.message}\n`);
      process.exit(result.exitCode || 1);
    }
    case 'error': {
      process.stderr.write(`park: ${result.message}\n`);
      process.exit(1);
    }
    default: {
      process.stderr.write(`park: unknown result status: ${result.status}\n`);
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
  await verbPark(process.argv.slice(2), cfg);
}
