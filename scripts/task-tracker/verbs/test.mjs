// `/task test` — sandboxed verification runner (#137).
//
// Replaces the in-place command runner that previously lived in review.mjs.
// On invocation:
//   1. Resolves the target issue (from rest args or active binding).
//   2. Parses `## Verification Commands` from the issue body.
//   3. Stages a fresh git worktree at `tmp/.task-test-<N>-<sha8>/` from HEAD.
//   4. Runs `npm ci --no-audit --no-fund` inside the worktree.
//   5. Executes each VC via execFile (allowlist-validated), capturing exit
//      code and last-50-line tail of stdout+stderr.
//   6. On all-green: stamps `<!-- aitm-dod-verified: <sha>:<iso> -->` in the
//      body, posts a summary comment, moves the board test → review, runs
//      `runLogIssueTime`, removes the worktree.
//   7. On any failure: posts a failure-table comment, rolls the board back
//      to develop, removes the worktree, exits non-zero.
//
// All side-effecting I/O is injectable via deps for unit tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { loadState, saveState } from '../state.mjs';
import { projectTmpDir } from '../paths.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { insertDodVerifiedMarker, insertTestStartedMarker } from '../lib/markers.mjs';
import { autoTickVerified } from '../lib/auto-tick-verified.mjs';
import { STAGES, parseEntryMarkers, stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { detectFunctionalPretick, detectLifecyclePretick } from '../lib/lifecycle-dod.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { seedWorktreeBackfill } from '../seed-worktree.mjs';

const pexec = promisify(execFile);

const SANDBOX_TIMEOUT_MS = 900_000; // 15 min per command — npm test in a fresh worktree runs ~100 files
const NPM_CI_TIMEOUT_MS = 600_000; // 10 min worst-case fresh install
const TAIL_LINES = 50;
// #254 — bounded retry of the sandbox SETUP chain (worktree add / config seed /
// npm ci). These are infrastructure steps that *throw* on transient failure; the
// VC loop is deliberately excluded from retry (see runVerbTest) so a genuine red
// still rolls back on first occurrence.
const SETUP_MAX_ATTEMPTS = 3;

function tail(text, n = TAIL_LINES) {
  const lines = String(text || '').split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function shortSha(sha) {
  return String(sha || '').slice(0, 8) || 'no-head';
}

export function buildPassedMessage(issueNumber, target) {
  const label = target ? target.charAt(0).toUpperCase() + target.slice(1) : 'Test';
  return `✓ #${issueNumber} verified in sandbox — moved to ${label}.`;
}

async function defaultGetHeadSha({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
    cwd: projectDir,
    timeout: 10_000,
  });
  return stdout.trim();
}

async function defaultCreateWorktree({ projectDir, path: wtPath }) {
  await pexec('git', ['worktree', 'add', '--detach', wtPath, 'HEAD'], {
    cwd: projectDir,
    timeout: 60_000,
  });
}

async function defaultRemoveWorktree({ projectDir, path: wtPath }) {
  try {
    await pexec('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: projectDir,
      timeout: 30_000,
    });
  } catch {
    // best-effort
  }
}

async function defaultSeedWorktree({ projectDir, path: wtPath }) {
  // `.ai-task-manager/` is gitignored, so a fresh worktree lacks the runtime
  // config + templates that several tests touch. Copy them from the parent.
  seedWorktreeBackfill({ source: projectDir, target: wtPath });
}

async function defaultNpmCi({ path: wtPath }) {
  await pexec('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: wtPath,
    timeout: NPM_CI_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function defaultExecInSandbox({ argv, path: wtPath }) {
  try {
    const { stdout, stderr } = await pexec(argv[0], argv.slice(1), {
      cwd: wtPath,
      timeout: SANDBOX_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { exit: 0, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (err) {
    return {
      exit: err.code ?? err.exitCode ?? 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
    };
  }
}

async function defaultFetchBody({ cfg, issueNum }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

// #295 — body writes go through `mutateIssueBody({ mutate })`.
async function defaultMutateBody({ cfg, issueNum, mutate }) {
  return mutateIssueBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    mutate,
    deps: { pexec },
  });
}

async function defaultPostComment({ cfg, issueNum, body }) {
  await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function buildResultTable(results, { sha, status, autoTicked = 0 }) {
  const rows = results.map((r) => {
    const mark = r.passed ? '✓' : r.rejected ? '⚠' : '✗';
    return `| ${mark} | \`${r.command}\` | exit ${r.exit ?? 'n/a'} |`;
  });
  const header = `## ${status === 'green' ? '✓ Sandboxed verification passed' : '✗ Sandboxed verification failed'}\n\nHEAD: \`${shortSha(sha)}\``;
  const ticked =
    status === 'green' && autoTicked > 0
      ? `\n\n_Auto-ticked ${autoTicked} command-backed checkbox${autoTicked === 1 ? '' : 'es'} from passing evidence (#255)._`
      : '';
  const table = ['| | Command | Result |', '|---|---|---|', ...rows].join('\n') + ticked;
  const tails = results
    .filter((r) => !r.passed)
    .map(
      (r) =>
        `### \`${r.command}\` — tail\n\n` +
        (r.rejected
          ? `_rejected: ${r.rejected}_\n`
          : '```\n' + tail([r.stdout, r.stderr].filter(Boolean).join('\n')) + '\n```\n')
    )
    .join('\n');
  return `${header}\n\n${table}\n${tails ? '\n' + tails : ''}`;
}

// #254 — run a single setup step, re-throwing any failure tagged with the step
// name, exit code, and a stderr tail so the abort path can record durable
// diagnostics instead of swallowing them.
async function runSetupStep(step, fn) {
  try {
    return await fn();
  } catch (err) {
    const tagged = err instanceof Error ? err : new Error(String(err));
    tagged.step = step;
    tagged.exit = err?.code ?? err?.exitCode ?? err?.status ?? err?.exit ?? null;
    tagged.stderrTail = tail(err?.stderr || err?.message || String(err));
    throw tagged;
  }
}

// #254 — run the setup chain (createWorktree → seedWt → npmCi) with bounded
// retry. On a transient throw, remove any partial worktree (so the next
// `git worktree add` doesn't collide) and retry up to `attempts` times. The
// last failure's tagged diagnostics are reported via `captureDiag`. Throws the
// final tagged error once attempts are exhausted.
async function runSetupWithRetry({
  attempts,
  projectDir,
  wtPath,
  createWorktree,
  seedWt,
  npmCi,
  removeWorktree,
  onCreated,
  captureDiag,
}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runSetupStep('git worktree add', () => createWorktree({ projectDir, path: wtPath }));
      onCreated();
      await runSetupStep('config seed', () => seedWt({ projectDir, path: wtPath }));
      await runSetupStep('npm ci', () => npmCi({ path: wtPath }));
      return { attempts: attempt };
    } catch (err) {
      lastErr = err;
      captureDiag({
        step: err.step ?? 'sandbox setup',
        exit: err.exit ?? null,
        stderrTail: err.stderrTail ?? '',
        attempt,
        attempts,
      });
      // Clear any partial worktree before the next attempt so `git worktree add`
      // doesn't collide on a half-created path.
      if (existsSync(wtPath)) {
        await removeWorktree({ projectDir, path: wtPath });
      }
      if (attempt >= attempts) break;
    }
  }
  throw lastErr;
}

// #254 — build the durable `test-aborted` audit comment from tagged setup
// diagnostics: failing step, exit code, attempt count, and stderr tail.
function buildAbortComment(diag, err) {
  return [
    '> ⚠ test-aborted',
    '',
    'Sandbox verification crashed before producing a green/red result. Board demoted back to `develop`.',
    '',
    `- **Failed step:** \`${diag.step}\``,
    `- **Exit code:** \`${diag.exit ?? 'n/a'}\``,
    `- **Attempts:** ${diag.attempt ?? 1}/${diag.attempts ?? 1}`,
    '',
    '**stderr tail:**',
    '',
    '```',
    diag.stderrTail || err?.message || String(err),
    '```',
    '',
    '<!-- aitm-test-aborted -->',
  ].join('\n');
}

export async function runVerbTest({
  cfg,
  issueNumber,
  projectDir,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!cfg) throw new Error('verbTest: cfg is required');
  if (!issueNumber) throw new Error('verbTest: issueNumber is required');
  if (!projectDir) throw new Error('verbTest: projectDir is required');

  const issueNum = String(issueNumber).replace(/^#/, '');
  const fetchBody = deps.fetchBody || defaultFetchBody;
  const mutateBody = deps.mutateBody || defaultMutateBody;
  const postComment = deps.postComment || defaultPostComment;
  const getHeadSha = deps.getHeadSha || defaultGetHeadSha;
  const createWorktree = deps.createWorktree || defaultCreateWorktree;
  const removeWorktree = deps.removeWorktree || defaultRemoveWorktree;
  const seedWt = deps.seedWorktree || defaultSeedWorktree;
  const npmCi = deps.npmCi || defaultNpmCi;
  const execInSandbox = deps.execInSandbox || defaultExecInSandbox;
  const moveState = deps.moveState;
  const logIssueTime = deps.logIssueTime;

  let body = await fetchBody({ cfg, issueNum });
  const pretick = detectLifecyclePretick(body);
  if (pretick.regressions.length > 0) {
    body = pretick.body;
    // #295 — re-run regression strip on FRESH base.
    await mutateBody({ cfg, issueNum, mutate: (base) => detectLifecyclePretick(base).body });
    const labels = pretick.regressions.map((r) => r.label).join('; ');
    await postComment({
      cfg,
      issueNum,
      body: `⚠️ Lifecycle DoD regression: items pre-ticked before their trigger fired and were auto-un-ticked: ${labels}. Run \`/task approve\` then \`/task close\` so the correct verb ticks them.`,
    });
  }
  // #231 — Functional DoD items carrying an `aitm-verified-by` marker are
  // sandbox-owned: the green tick must come from `autoTickVerified` after a
  // passing exit code, not from a hand-tick. Un-tick any pre-ticked
  // command-backed Functional item so the sandbox-driven re-tick is the only
  // path to green. Judgment items (no marker) are untouched.
  const funcPretick = detectFunctionalPretick(body);
  if (funcPretick.regressions.length > 0) {
    body = funcPretick.body;
    await mutateBody({ cfg, issueNum, mutate: (base) => detectFunctionalPretick(base).body });
    const labels = funcPretick.regressions.map((r) => r.label).join('; ');
    await postComment({
      cfg,
      issueNum,
      body: `⚠️ Functional DoD regression: command-backed items pre-ticked before sandbox evidence and were auto-un-ticked: ${labels}. The sandbox re-ticks them on a passing exit code.`,
    });
  }
  const vcs = parseVerificationCommands(body);
  if (vcs.length === 0) {
    return {
      status: 'no-vc',
      message: `#${issueNum}: no \`## Verification Commands\` entries — nothing to verify.`,
    };
  }

  const sha = await getHeadSha({ projectDir });
  const wtPath = path.join(projectTmpDir(projectDir), `.task-test-${issueNum}-${shortSha(sha)}`);
  if (existsSync(wtPath)) {
    await removeWorktree({ projectDir, path: wtPath });
  }

  if (moveState) {
    await moveState({ issueNumber: issueNum, target: 'test' });
    // #210 — Re-fetch after moveState so subsequent body writes don't clobber
    // the `aitm-last-known-state` marker that the transition just stamped.
    body = await fetchBody({ cfg, issueNum });
  }

  // #210 (Fix A) — Once the board has been moved to `test`, ANY failure before
  // the sandbox produces a green/red result MUST demote the board back to
  // `develop`. Otherwise verbTest can crash mid-sandbox (worktree/npm-ci
  // failure, etc.), leave the board in `test`, and let the next forward
  // promote sail through with no `aitm-dod-verified` evidence.
  const results = [];
  let cleanupNeeded = false;
  let setupDiag = null; // #254 — tagged diagnostics from the last failed setup attempt
  try {
    // #154 — Stamp `aitm-test-started: <sha>:<ts>` BEFORE the sandbox runs so
    // verbReview's preflight can compare outer HEAD at review-time against the
    // SHA we were testing. The marker is refreshed on every re-test so the
    // entry SHA always reflects the current verification window.
    {
      const entryTs = now();
      const stampedEntry = insertTestStartedMarker(body, sha, entryTs);
      if (stampedEntry !== body) {
        body = stampedEntry;
        await mutateBody({
          cfg,
          issueNum,
          mutate: (base) => insertTestStartedMarker(base, sha, entryTs),
        });
      }
    }

    // #254 — bounded retry of the setup chain only. A transient throw (registry
    // blip during `npm ci`, worktree-path contention) is retried up to
    // SETUP_MAX_ATTEMPTS before the board is rolled back. The VC loop below is
    // intentionally OUTSIDE this retry: `execInSandbox` returns exit codes
    // rather than throwing, so a genuine verification red never reaches the
    // retry and still rolls back on first occurrence via the `allGreen` check.
    await runSetupWithRetry({
      attempts: SETUP_MAX_ATTEMPTS,
      projectDir,
      wtPath,
      createWorktree,
      seedWt,
      npmCi,
      removeWorktree,
      onCreated: () => {
        cleanupNeeded = true;
      },
      captureDiag: (d) => {
        setupDiag = d;
      },
    });

    for (const vc of vcs) {
      const validation = validateVerificationCommand(vc.command, { projectDir: wtPath });
      if (!validation.ok) {
        results.push({
          command: vc.command,
          rejected: validation.reason,
          passed: false,
          exit: null,
          stdout: '',
          stderr: '',
        });
        continue;
      }
      const r = await execInSandbox({ argv: validation.argv, path: wtPath });
      results.push({
        command: vc.command,
        passed: r.exit === 0,
        exit: r.exit,
        stdout: r.stdout,
        stderr: r.stderr,
      });
    }
  } catch (err) {
    // #210 (Fix A) — sandbox-setup or sandbox-run threw. Roll the board back
    // to `develop` so the lifecycle chain stays honest, post an audit comment
    // for visibility, then re-throw so the caller surfaces a non-zero exit.
    //
    // #254 — the audit comment now carries durable diagnostics (failing step,
    // exit code, stderr tail, attempt count) drawn from the tagged setup
    // failure, and the post is NOT swallowed: if it fails, surface the failure
    // on stderr instead of silently dropping it (the prior best-effort `catch
    // {}` is exactly why #237's abort left no recoverable diagnostics).
    const diag = setupDiag || {
      step: err?.step || 'sandbox',
      exit: err?.exit ?? err?.code ?? null,
      stderrTail: err?.stderrTail || tail(err?.stderr || err?.message || String(err)),
      attempt: 1,
      attempts: 1,
    };
    try {
      await postComment({
        cfg,
        issueNum,
        body: buildAbortComment(diag, err),
      });
    } catch (postErr) {
      // Diagnostics are the whole point of this path — do not swallow a failed
      // post. Surface it so a GitHub API hiccup during the abort is visible.
      process.stderr.write(
        `test: failed to post abort diagnostics for #${issueNum}: ${postErr?.message ?? String(postErr)}\n`
      );
    }
    if (moveState) {
      try {
        await moveState({ issueNumber: issueNum, target: 'develop' });
      } catch {
        // best-effort rollback; the audit comment above records the abort
      }
    }
    throw err;
  } finally {
    if (cleanupNeeded) {
      await removeWorktree({ projectDir, path: wtPath });
    }
  }

  const allGreen = results.length > 0 && results.every((r) => r.passed);

  if (allGreen) {
    const ts = now();
    // #210 — Re-fetch before stamping DoD-verified so we don't clobber any
    // marker writes (entry markers, lifecycle pretick, last-known-state) that
    // GitHub may have received in the meantime.
    body = await fetchBody({ cfg, issueNum });
    // verbTest advances develop→test only. The Test→Review step is a separate
    // forward verb (`/task review`) — verbTest must not skip it. move-state.mjs
    // already stamped the `test` entry marker via the earlier moveState call;
    // we re-stamp here defensively so the chain stays complete even if a stub
    // moveState (e.g. in unit tests) omits marker stamping.
    let stamped = insertDodVerifiedMarker(body, sha, ts);
    const markers = parseEntryMarkers(stamped);
    const latest = markers
      .slice()
      .sort((a, b) => new Date(a.ts) - new Date(b.ts))
      .pop();
    const testIdx = STAGES.indexOf('test');
    const latestIdx = latest ? STAGES.indexOf(latest.stage) : -1;
    if (latestIdx < testIdx) {
      stamped = stampEntryMarker(stamped, 'test', ts);
    }
    // #255 — auto-tick the boxes we have direct command evidence for: every
    // passing `## Verification Commands` entry and any Functional DoD item
    // whose `aitm-verified-by` command(s) all passed. Judgment items (no
    // command marker) and the Lifecycle section are left untouched. Reached
    // only on the green path, so a red result ticks nothing.
    const autoTick = autoTickVerified(stamped, results);
    stamped = autoTick.body;
    if (stamped !== body) {
      // #295 — re-run the full stamp+autoTick fold on FRESH base.
      await mutateBody({
        cfg,
        issueNum,
        mutate: (base) => {
          let next = insertDodVerifiedMarker(base, sha, ts);
          const ms = parseEntryMarkers(next);
          const latestM = ms
            .slice()
            .sort((a, b) => new Date(a.ts) - new Date(b.ts))
            .pop();
          const tIdx = STAGES.indexOf('test');
          const lIdx = latestM ? STAGES.indexOf(latestM.stage) : -1;
          if (lIdx < tIdx) next = stampEntryMarker(next, 'test', ts);
          return autoTickVerified(next, results).body;
        },
      });
    }
    await postComment({
      cfg,
      issueNum,
      body: buildResultTable(results, {
        sha,
        status: 'green',
        autoTicked: autoTick.tickedVc.length + autoTick.tickedFunctional.length,
      }),
    });
    if (logIssueTime) await logIssueTime(issueNum);
    return { status: 'passed', sha, ts, results, wtPath, target: 'test' };
  }

  await postComment({
    cfg,
    issueNum,
    body: buildResultTable(results, { sha, status: 'red' }),
  });
  if (moveState) await moveState({ issueNumber: issueNum, target: 'develop' });
  return { status: 'failed', sha, results, wtPath };
}

export async function verbTest(ctx) {
  const { cfg, projectDir, rest, SKIP_NETWORK, statePath, runMoveState, runLogIssueTime } = ctx;
  if (SKIP_NETWORK) {
    console.error('/task test: SKIP_NETWORK is set — refusing to run sandbox verification.');
    process.exit(1);
  }
  const s = loadState(statePath);
  const target =
    rest.find((a) => /^#\d+$/.test(a)) || (s.active && s.active !== 'discover' ? s.active : null);
  if (!target) {
    console.error('Usage: /task test #N');
    process.exit(1);
  }
  const issueNumber = String(target).replace(/^#/, '');

  const moveState = async ({ issueNumber: n, target: t }) => {
    await runMoveState(`#${n}`, t, { silent: true });
  };
  const logIssueTime = async (n) => {
    await runLogIssueTime(`#${n}`);
  };

  let result;
  try {
    result = await runVerbTest({
      cfg,
      issueNumber,
      projectDir,
      deps: { moveState, logIssueTime },
    });
  } catch (err) {
    console.error(`/task test: ${err.message}`);
    process.exit(1);
  }

  switch (result.status) {
    case 'no-vc':
      console.error(result.message);
      process.exit(4);
      break;
    case 'passed': {
      console.log(buildPassedMessage(issueNumber, result.target));
      saveState(
        {
          ...s,
          active: null,
          entryStartTs: null,
          wordsAtEntryStart: 0,
          lastActive: `#${issueNumber}`,
        },
        statePath
      );
      return;
    }
    case 'failed': {
      const fails = result.results.filter((r) => !r.passed).length;
      console.error(`✗ #${issueNumber} verification failed in sandbox (${fails} command(s)).`);
      process.exit(3);
    }
    default:
      console.error(`/task test: unknown result status: ${result.status}`);
      process.exit(1);
  }
}
