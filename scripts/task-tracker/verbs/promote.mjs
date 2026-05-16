// `promote` verb — directional forward state-change (#81 rename of `/task move`).
//
// One verb advances the issue by exactly one state along the FORWARD chain:
//   backlog → groom → analyze → development → validate → review → done.
//
// Promote is the only sanctioned forward chokepoint. Existing stage verbs
// (analyze / approve / review / close) remain as aliases — promote delegates to
// them so their gates and side effects run unchanged. The new behaviour layered
// on top is:
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
import {
  readLastKnownState,
  writeLastKnownState,
  buildRow,
  postTimingEvent,
} from '../gh-timing-comment.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import {
  planRefinementEstimate,
  applyRefinementEstimate,
} from '../lib/apply-refinement-estimate.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

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
  develop: 'review',
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
      env: { ...process.env, AITM_INTERNAL: '1' },
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

  // Refine-stage pre-flight: when promoting Backlog → Refine, the agent must
  // have set Size / Estimate / Priority on the board AND embedded a
  // `<!-- aitm-refinement-rationale: {...} -->` marker in the issue body
  // (legacy `aitm-groom-rationale` still accepted). Refuse the move if either
  // is missing, so the post-success hook can safely assume both signals are
  // present (AC4 of #95).
  let refinementPlan = null;
  if (target === 'refine') {
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
        message: `Refusing to promote #${issueNumber} to Refine: missing refine-estimate signals.`,
      };
    }
    refinementPlan = planResult.plan;
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
    // Option B drift reconcile (#132): alias verbs do multiple board moves
    // (e.g. /task review moves `test` → verify → `develop`/`review`). When
    // they exit non-zero mid-flight, the board may sit at an intermediate
    // state while the marker still reads the recorded state. Re-read the
    // live board and stamp the marker to whatever the board now says so
    // the next verb does not reason from a stale marker.
    let liveAfter = null;
    try {
      liveAfter = (await getLiveState({ issueNumber, cfg })) || null;
    } catch {
      liveAfter = null;
    }
    const drifted = liveAfter && liveAfter !== recorded;
    if (drifted) {
      try {
        const { body: bodyDrift } = await fetchIssueBody({ issueNumber, repo: cfg.repo });
        const stamped = writeLastKnownState(bodyDrift, liveAfter);
        if (stamped !== bodyDrift) {
          await writeIssueBody({ issueNumber, repo: cfg.repo, body: stamped });
        }
      } catch {
        // best-effort — board is already in liveAfter
      }
      try {
        const row = buildRow({
          ts: now(),
          event: 'drift-reconcile',
          activeMin: 0,
          idleMin: 0,
          deltaWords: 0,
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

  // Transition succeeded — stamp new lastKnownState and write the audit row.
  // Re-fetch the body in case the alias verb mutated it (markers, ticks).
  let bodyAfter;
  try {
    ({ body: bodyAfter } = await fetchIssueBody({ issueNumber, repo: cfg.repo }));
  } catch {
    bodyAfter = body;
  }
  const stamped = writeLastKnownState(bodyAfter, target);
  if (stamped !== bodyAfter) {
    try {
      await writeIssueBody({ issueNumber, repo: cfg.repo, body: stamped });
    } catch {
      // Best-effort. Transition is already committed on the board.
    }
  }
  // Refine-stage post-success hook: post the audit comment (idempotent) and
  // strip the rationale marker from the body. Best-effort — failures here do
  // not roll back the board move.
  let refinementPost = null;
  if (target === 'refine' && refinementPlan) {
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

  try {
    const row = buildRow({
      ts: now(),
      event: `move:${target}`,
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 0,
      description:
        transitionResult.kind === 'alias' ? `via /task ${transitionResult.verb}` : 'direct move',
    });
    await postTimingRow({ issueNumber, repo: cfg.repo, row });
  } catch {
    // Audit row is best-effort; transition is the source of truth.
  }

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
    result = await runPromote({ issueNumber, cfg });
  } catch (err) {
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
    case 'refine-gate-refused':
    case 'groom-gate-refused': {
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
