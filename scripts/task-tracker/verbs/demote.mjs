// `demote` verb — directional backward state-change (#81 rename of `/task move`).
//
// The only backward path on the kanban is `test → develop` and
// `review → develop` — both for failed-tests / review-rework loops. From
// every other state demote refuses.
//
// #935 — demote-to-develop is a CODE-REWORK path and nothing else. The single
// legitimate reason to send an issue back to Develop is to commit further code
// changes; re-running a stage's own validation (e.g. re-triggering the Agent
// Review gate) is done in place by re-invoking that stage's verb (`/task review`,
// `/task test`), NOT by demoting. So the verb HARD-REFUSES unless the caller
// declares that code-change intent with an explicit `--rework "<reason>"` flag
// (non-empty reason). This mirrors the #361 body-write hard-refusal: fail-loud,
// hint-carrying, with an explicit grep-able override. The reason is threaded into
// `move-state.mjs --demote-reason` so it surfaces in the `demoted:<state>` timing
// row.
//
// Drift detection mirrors `promote.mjs` exactly: if the live board state
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
import { invalidateEvidence } from '../lib/evidence-invalidation.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import { runMoveStateHost } from '../../gh/move-state.mjs';
import { writeDirectoryContractOperation } from '../lib/github-records/contract-write.mjs';

const pexec = promisify(execFile);

// Exported (not just local) so `move-state-policy.test.mjs` (#848 AC7) can
// assert `refusalVerbHint`'s named verb actually declares the hinted target
// legal, without shelling out.
const DEMOTE_POLICY = actionPolicyFor('demote');
export const DEMOTE_TARGET = DEMOTE_POLICY.target;
export const LEGAL_FROM = new Set(DEMOTE_POLICY.allowedStates);

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

// #755 — call the move-state host in-process (was: spawn
// `node scripts/gh/move-state.mjs … --demote`). runMoveStateHost returns the same
// numeric exit code the child exit code used to give us, so runDemote's exitCode
// branching is unchanged. The synthetic argv preserves the `--demote` flag so the
// host's parse/matrix path is identical to the old CLI invocation. host is
// injectable for tests.
export function defaultRunMoveState(
  { issueNumber, target, rework },
  { host = runMoveStateHost } = {}
) {
  const argv = [process.execPath, 'move-state.mjs', String(issueNumber), target, '--demote'];
  // #935 — surface the declared code-change reason in the `demoted:<state>` timing
  // row via the existing `--demote-reason` policy path.
  const reason = String(rework || '').trim();
  if (reason) argv.push('--demote-reason', reason);
  return host({
    argv,
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'demote' },
  });
}

// ---------------------------------------------------------------------------
// Pure core.
// ---------------------------------------------------------------------------

export async function runDemote({ issueNumber, cfg, rework, deps = {} } = {}) {
  if (!issueNumber) throw new Error('demote: issueNumber is required');
  if (!cfg) throw new Error('demote: cfg is required');
  const assertBound = deps.assertBound ?? assertBoundToIssue;
  assertBound(issueNumber);

  // #935 — hard-refuse a demote that does not declare a code-change need, BEFORE
  // any network fetch or board move. An empty/whitespace-only reason is treated
  // as absent. The message names re-invoking the current stage verb as the
  // in-place way to re-run that stage's validation.
  const reworkReason = String(rework || '').trim();
  if (!reworkReason) {
    return {
      status: 'rework-required',
      message:
        'demote-to-develop is a CODE-REWORK path — pass `--rework "<reason>"` to declare the code change you intend to commit.\n' +
        "   To re-run a stage's validation WITHOUT changing code, re-invoke that stage's verb in place\n" +
        '   (e.g. `/task review` re-runs the Agent Review gate; `/task test` re-runs the suite) — do NOT demote.',
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
        message: `demote: no recorded state and no live state for #${issueNumber} — board item missing`,
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

  const demotePolicy = actionPolicyFor('demote', recorded);
  if (demotePolicy.kind === 'unknown-state') {
    return {
      status: 'error',
      message: `demote: unknown recorded state "${recorded}" for #${issueNumber}`,
    };
  }
  if (!demotePolicy.ok) {
    return {
      status: 'invalid-source-refused',
      from: recorded,
      message: 'demote only valid from test or review',
    };
  }

  // Matrix sanity check — both legal sources include DEMOTE_TARGET among their
  // backward targets. #999 widened `review`'s BACKWARD entry to a multi-target
  // array (`develop` and `test`), so this checks membership, not equality.
  if (!backwardTargets(recorded).includes(DEMOTE_TARGET)) {
    return {
      status: 'error',
      message: `demote: matrix says ${recorded}→${backwardTargets(recorded).join('|')}; expected ${DEMOTE_TARGET}`,
    };
  }
  const mx = validateExecutableTransition(recorded, DEMOTE_TARGET);
  if (!mx.ok) {
    return { status: 'error', message: `demote: ${mx.reason}` };
  }

  const exitCode = await runMoveState({
    issueNumber,
    target: DEMOTE_TARGET,
    rework: reworkReason,
    cfg,
  });
  if (exitCode !== 0) {
    return {
      status: 'transition-failed',
      exitCode,
      message: `demote: move-state.mjs ${DEMOTE_TARGET} exited ${exitCode}; recorded state left at "${recorded}".`,
    };
  }

  const directoryWrite = await writeDirectoryContractOperation({
    repository: cfg.repo,
    issue: Number(issueNumber),
    issueBody: initialBody,
    action: 'invalidate',
    pexec,
    deps: deps.contractWrite,
  });
  if (directoryWrite.status === 'directory-written') {
    return {
      status: 'demoted',
      from: recorded,
      to: DEMOTE_TARGET,
      bootstrapped,
      invalidated: ['test', 'review', 'approval'],
      authoritySource: 'github-records/v1',
    };
  }

  // #295 — post-move stamp via mutateIssueBody closure; the helper re-fetches
  // the FRESH base inside the closure, so a concurrent writer between move
  // and stamp is preserved.
  //
  // #932 — the evidence-invalidation strip rides in the SAME closure as the
  // state-recording write, so a crash between "board moved" and "evidence
  // stripped" can't leave the two out of sync (both land in one push, or
  // neither does). `invalidated` is captured via closure since the retry
  // helper only returns write-status, not the mutate closure's side data; the
  // closure may run more than once on a version-conflict retry, but
  // `invalidateEvidence` is idempotent so the last-observed list is correct.
  let invalidated = [];
  await writeIssueBodyWithRetry({
    issueNumber,
    repo: cfg.repo,
    target: DEMOTE_TARGET,
    mutate: (base) => {
      const withState = writeLastKnownState(base, DEMOTE_TARGET);
      const stripped = invalidateEvidence(withState);
      invalidated = stripped.invalidated;
      return stripped.body;
    },
    deps: { mutateIssueBody: mutateBody },
  });
  // #128 — paired `demoted` + `<target>:enter` rows are emitted at the
  // move-state.mjs chokepoint when invoked with `--demote`. The previous
  // `move:<target>` audit row was redundant with that pair and is
  // intentionally removed.

  return { status: 'demoted', from: recorded, to: DEMOTE_TARGET, bootstrapped, invalidated };
}

// ---------------------------------------------------------------------------
// CLI wrapper.
// ---------------------------------------------------------------------------

export function parseArgs(rest) {
  let issueNumber = null;
  let rework = null;
  const args = Array.isArray(rest) ? rest.map(String) : [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    // #935 — `--rework <reason>` and `--rework=<reason>` both accepted.
    if (a === '--rework') {
      rework = args[i + 1] !== undefined ? args[i + 1] : '';
      i += 1;
      continue;
    }
    if (a.startsWith('--rework=')) {
      rework = a.slice('--rework='.length);
      continue;
    }
    const m = a.match(/^#?(\d+)$/);
    if (m && issueNumber === null) issueNumber = Number(m[1]);
  }
  return { issueNumber, rework };
}

export async function verbDemote(rest, cfg, deps = {}) {
  const { issueNumber, rework } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: demote #N --rework "<reason>"\n');
    process.exit(1);
  }

  let result;
  try {
    result = await runDemote({ issueNumber, cfg, rework, deps });
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
      if (result.invalidated && result.invalidated.length) {
        process.stdout.write(
          `  evidence invalidated (${result.invalidated.length} item(s) — will re-verify on next promote):\n`
        );
        for (const label of result.invalidated) {
          process.stdout.write(`   - ${label}\n`);
        }
      }
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
    case 'rework-required': {
      process.stderr.write(
        `\n⛔ Refusing to demote #${issueNumber}:\n   BLOCKED: ${result.message}\n\n`
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
