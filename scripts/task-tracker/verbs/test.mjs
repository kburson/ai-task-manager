// `/task test` — sandboxed verification runner (#137).
//
// Replaces the in-place command runner that previously lived in review.mjs.
// On invocation:
//   1. Resolves the target issue (from rest args or active binding).
//   2. Parses `## Verification Commands` from the issue body.
//   3. Stages a fresh git worktree at `tmp/.task-test-<N>-<sha8>-<token>/` from
//      HEAD (the per-run `<token>` keeps concurrent runs from colliding — #563).
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
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { loadState, saveState, pauseTimingKeepBinding } from '../state.mjs';
import { projectTmpDir } from '../paths.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import {
  COMPLETE_TEST_LANES,
  parseVerificationCommands,
  partitionVerificationCommands,
} from '../lib/verification-commands.mjs';
import { migrateTestsLaneSplit } from '../lib/tests-lane-split.mjs';
import { parseIssueKind } from '../lib/issue-kind.mjs';
import { docsKindDropsTests } from '../lib/dod-kind-filter.mjs';
import { computeReviewChangedPaths } from '../lib/review-changed-paths.mjs';
import {
  insertDodVerifiedMarker,
  insertTestStartedMarker,
  parseVerificationReceipt,
  upsertVerificationReceipt,
} from '../lib/markers.mjs';
import {
  buildVerificationFingerprint,
  createVerificationReceipt,
  hasVerificationReceiptMarker,
  requiredTestReceiptClassifications,
  validateVerificationReceipt,
} from '../lib/verification-receipt.mjs';
import { captureEvidenceProvenance } from '../lib/evidence-provenance.mjs';
import { runDevelopVerification } from '../verify-develop.mjs';
import { autoTickVerified } from '../lib/auto-tick-verified.mjs';
import { STAGES, parseEntryMarkers, stampEntryMarker } from '../lib/stage-entry-markers.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { detectFunctionalPretick, detectLifecyclePretick } from '../lib/lifecycle-dod.mjs';
import { GH_API_TIMEOUT_MS, sandboxTimeoutMs } from '../lib/process-timeouts.mjs';
import { describeSandboxFailure } from '../lib/sandbox-exit-render.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { assertVerbHomeState } from '../lib/verb-home-state-guard.mjs';
import { postNewAutomatedTestsComment } from '../lib/new-automated-tests-comment.mjs';
import { locateAuthoritySource } from '../lib/github-records/authority-locator.mjs';
import {
  hasAcceptedTestEvidence,
  resolveLifecycleGateEvidence,
} from '../lib/github-records/lifecycle-gate-source.mjs';
import { gql } from '../../gh/lib/github-projects.mjs';

const pexec = promisify(execFile);

// cspell:ignore metachar
// #973 — `validateVerificationCommand` rejects a command for one of two
// distinct reasons: a shell-metacharacter/injection-vector match (the
// `FORBIDDEN` scan in verification-allowlist.mjs — `forbidden semicolon (;)`
// etc.) or a per-bin shape mismatch (an otherwise well-formed, non-injecting
// command using a subcommand/flag/bin outside the restrictive allowlist —
// `bin 'npm' rejects subcommand 'install' ...`). Only the latter is a policy
// signal about command *shape*, not an attempted attack; it alone is safe to
// exclude from the pass/fail gate. A metachar-scan rejection must keep
// blocking — that is the injection-attempt case story #137's regression test
// guards (a blocked payload must not let the run report "passed").
const POLICY_SHAPE_REJECTION_RE = /^bin '[^']+' rejects (?:(?:flag|subcommand) )?'/;
function isPolicyShapeRejection(reason) {
  return typeof reason === 'string' && POLICY_SHAPE_REJECTION_RE.test(reason);
}

function defaultLifecycleGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

function lifecycleEvidenceReason(error) {
  return { code: String(error?.message || 'lifecycle-gate-source:unknown') };
}

const NPM_CI_TIMEOUT_MS = 600_000; // 10 min worst-case fresh install
const TAIL_LINES = 50;
// #254 — bounded retry of the sandbox SETUP chain (worktree add / config seed /
// npm ci). These are infrastructure steps that *throw* on transient failure; the
// VC loop is deliberately excluded from retry (see runVerbTest) so a genuine red
// still rolls back on first occurrence.
const SETUP_MAX_ATTEMPTS = 3;

// @story #541 — the sandbox boundary must strip session-scoped lock state from
// the env handed to `npm ci` and every Verification Command. `promote` wraps the
// develop→test delegate spawn in `withIssueLock`, which sets
// `AITM_ISSUE_LOCK_HELD=1` in `process.env` for the duration of the spawn; that
// flag then leaks `promote → test delegate → npm run test:all → each test file →
// the move-state subprocess the lock-contention tests spawn`. move-state honors
// the flag as "lock already held upstream, skip re-acquisition", so the
// contention path those tests assert on never fires — green at repo root, red in
// the sandbox. Scrubbing the flag here restores a clean ambient env for every
// sandboxed command, matching a bare repo-root invocation.
export const SANDBOX_STRIPPED_ENV_VARS = ['AITM_ISSUE_LOCK_HELD'];

export function buildSandboxEnv(baseEnv = process.env, overrides = {}) {
  const next = { ...baseEnv };
  for (const key of SANDBOX_STRIPPED_ENV_VARS) {
    delete next[key];
  }
  return { ...next, ...overrides };
}

function tail(text, n = TAIL_LINES) {
  const lines = String(text || '').split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

function shortSha(sha) {
  return String(sha || '').slice(0, 8) || 'no-head';
}

// #563 — sandbox worktree path. The legacy form
// `.task-test-<issue>-<shortSha>` was fully deterministic: two concurrent runs
// for the same issue at the same HEAD computed the identical path, and the
// `existsSync→removeWorktree` reclaim let the second run delete the first's
// live worktree (false-red). A per-run uniqueness `token` (defaulting to
// `<pid>-<random>`) disambiguates concurrent runs so they never alias — the
// token IS the ownership boundary, making the reclaim structurally unable to
// touch a peer's worktree. The deterministic prefix is retained so the path
// stays easy to grep. Pass an explicit `token` for deterministic cleanup/test paths.
export function sandboxWorktreePath({ projectDir, issueNum, sha, token } = {}) {
  const tok = token || `${process.pid}-${randomBytes(4).toString('hex')}`;
  return path.join(projectTmpDir(projectDir), `.task-test-${issueNum}-${shortSha(sha)}-${tok}`);
}

export function buildPassedMessage(issueNumber, target) {
  const label = target ? target.charAt(0).toUpperCase() + target.slice(1) : 'Test';
  return `✓ #${issueNumber} verified in sandbox — moved to ${label}.`;
}

// #444 — loud-success banner for an in-place re-verify: the issue was already
// in Test, the sandbox re-ran the current Verification Commands set, and the
// board column stayed put (a benign test→test self-loop). Distinct from
// `buildPassedMessage` so it never falsely claims a develop→test promotion.
export function buildReverifiedMessage(issueNumber) {
  return `✓ #${issueNumber} re-verified in sandbox — already in Test (in-place re-verify, board unchanged).`;
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
  // #346 — two-stage cleanup. `git worktree remove --force` unregisters the
  // worktree from the parent repo's metadata, but git refuses to descend
  // through nested .git/ repositories on disk (the slow-suite fixtures with
  // their own .git/ hit this). Without the rmSync fallback, the next
  // `git worktree add` aborts on "<wtPath>' already exists" and `runSetupWithRetry`
  // burns all 3 attempts on the same wall. Git first (clean registration),
  // then rm -rf (guarantee disk state matches metadata). Both swallowed per
  // the best-effort contract — neither should bubble to callers.
  try {
    await pexec('git', ['worktree', 'remove', '--force', wtPath], {
      cwd: projectDir,
      timeout: 30_000,
    });
  } catch {
    // best-effort
  }
  try {
    rmSync(wtPath, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

async function defaultNpmCi({ path: wtPath }) {
  await pexec('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: wtPath,
    timeout: NPM_CI_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    // @story #541/#1165 — strip leaked lock state and keep all project-local
    // setup authority inside the detached verification worktree.
    env: buildSandboxEnv(process.env, { AI_TASK_MANAGER_PROJECT_DIR: wtPath }),
  });
}

async function defaultExecInSandbox({ argv, path: wtPath }) {
  const timeoutMs = sandboxTimeoutMs();
  const startedAt = Date.now();
  const startedInstant = new Date().toISOString();
  try {
    const { stdout, stderr } = await pexec(argv[0], argv.slice(1), {
      cwd: wtPath,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      // @story #541/#1165 — strip leaked lock state, then bind project-local
      // execution to this detached verification worktree, never its parent.
      env: buildSandboxEnv(process.env, { AI_TASK_MANAGER_PROJECT_DIR: wtPath }),
    });
    return {
      exit: 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      startedAt: startedInstant,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    // #856 — a timeout/signal kill leaves `err.code === null`, so the bare
    // `?? 1` fallback used to render it as `exit 1`, hiding the real cause.
    // Compute an honest cause string that names a timeout (ceiling + elapsed)
    // or a signal, keeping the numeric `exit` for the pass/fail logic.
    const cause = describeSandboxFailure({ err, timeoutMs, elapsedMs: Date.now() - startedAt });
    return {
      exit: err.code ?? err.exitCode ?? 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
      ...(cause ? { cause } : {}),
      startedAt: startedInstant,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  }
}

function defaultRunDevelopFinalization({ projectDir, issueNumber }) {
  return runDevelopVerification({ projectDir, mode: 'final', issueNumber });
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
// #522 — `evidenceStamp` is forwarded so the sandbox auto-stamp call site (the
// only Test-stage write that INTRODUCES execution proof) can bypass the
// proof-introduction guard; all other Test writes leave it false.
async function defaultMutateBody({ cfg, issueNum, mutate, evidenceStamp = false }) {
  return mutateIssueBody({
    issueNumber: issueNum,
    repo: cfg.repo,
    mutate,
    deps: { pexec },
    evidenceStamp,
  });
}

async function defaultPostComment({ cfg, issueNum, body }) {
  await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function buildResultTable(results, { sha, status, autoTicked = 0, laneSkip = null }) {
  const rows = results.map((r) => {
    const mark = r.passed ? '✓' : r.rejected ? '⚠' : '✗';
    // #856 — a killed command carries an honest `cause` (e.g. a timeout naming
    // the ceiling, or a signal); render it instead of the misleading `exit 1`.
    const result = r.cause ? r.cause : `exit ${r.exit ?? 'n/a'}`;
    return `| ${mark} | \`${r.command}\` | ${result} |`;
  });
  const header = `## ${status === 'green' ? '✓ Sandboxed verification passed' : '✗ Sandboxed verification failed'}\n\nHEAD: \`${shortSha(sha)}\``;
  const ticked =
    status === 'green' && autoTicked > 0
      ? `\n\n_Auto-ticked ${autoTicked} command-backed checkbox${autoTicked === 1 ? '' : 'es'} from passing evidence (#255)._`
      : '';
  // #1158 — an omitted lane has no row, so say plainly which lanes were skipped
  // and on what evidence. Silence would read as "the table is the whole run".
  const skipped = laneSkip
    ? `\n\n_Complete test lanes skipped (${laneSkip.lanes.join(', ')}): kind \`${laneSkip.kind}\` and a provably documentation-only diff of ${laneSkip.changedPaths.length} file${laneSkip.changedPaths.length === 1 ? '' : 's'} (#1158)._`
    : '';
  const table = ['| | Command | Result |', '|---|---|---|', ...rows].join('\n') + ticked + skipped;
  const tails = results
    .filter((r) => !r.passed)
    .map(
      (r) =>
        `### \`${r.command}\` — tail\n\n` +
        (r.rejected
          ? `_rejected: ${r.rejected}_\n`
          : (r.cause ? `_${r.cause}_\n\n` : '') +
            '```\n' +
            tail([r.stdout, r.stderr].filter(Boolean).join('\n')) +
            '\n```\n')
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

// #254 — run the setup chain (createWorktree → npmCi) with bounded
// retry. On a transient throw, remove any partial worktree (so the next
// `git worktree add` doesn't collide) and retry up to `attempts` times. The
// last failure's tagged diagnostics are reported via `captureDiag`. Throws the
// final tagged error once attempts are exhausted.
// #575 — no seed step: the worktree checkout already carries git-tracked
// `.ai-task-manager/` config + templates, so there is nothing to backfill.
async function runSetupWithRetry({
  attempts,
  projectDir,
  wtPath,
  createWorktree,
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
  const npmCi = deps.npmCi || defaultNpmCi;
  const execInSandbox = deps.execInSandbox || defaultExecInSandbox;
  const runDevelopFinalization = deps.runDevelopFinalization;
  const buildFingerprint = deps.buildFingerprint || buildVerificationFingerprint;
  const getSandboxHeadSha = deps.getSandboxHeadSha || defaultGetHeadSha;
  // #1158 — the sandbox's own `trunk...HEAD` changed-path set. Shares the
  // #940 Review-layer helper so both gates decide "is this diff docs-only?"
  // from the same computation; it is best-effort and returns [] on any
  // failure, which is default-deny downstream.
  const computeChangedPaths =
    deps.computeChangedPaths ||
    (({ projectDir: dir }) => computeReviewChangedPaths({ cfg, projectDir: dir, deps: { pexec } }));
  const moveState = deps.moveState;
  const logIssueTime = deps.logIssueTime;
  const postNewTests = deps.postNewAutomatedTestsComment;

  let body = await fetchBody({ cfg, issueNum });
  // #931 — refuse before any pretick/sandbox work if the issue isn't in
  // `develop` (first entry) or `test` (in-place re-verify self-loop). A stale
  // bind or a hand-run `/task test` from the wrong stage must not burn a
  // worktree + npm ci for nothing.
  const currentState = readLastKnownState(body).state;
  assertVerbHomeState({
    verb: 'test',
    currentState,
    issueNumber: issueNum,
  });
  const sha = await getHeadSha({ projectDir });
  let authoritySource;
  try {
    authoritySource = locateAuthoritySource({ issueBody: body });
  } catch (error) {
    return {
      status: 'directory-evidence-invalid',
      sha,
      reasons: [lifecycleEvidenceReason(error)],
    };
  }
  if (authoritySource.kind === 'github-records/v1') {
    const resolveLifecycleEvidence = deps.resolveLifecycleEvidence || resolveLifecycleGateEvidence;
    let lifecycleEvidence;
    try {
      lifecycleEvidence = await resolveLifecycleEvidence({
        repository: cfg.repo,
        issue: Number(issueNum),
        issueBody: body,
        expectedSha: sha,
        graphql: deps.graphql || defaultLifecycleGraphql,
        readContractRecord: deps.readContractRecord,
        deps: deps.listIssueRecords ? { listIssueRecords: deps.listIssueRecords } : undefined,
      });
    } catch (error) {
      return {
        status: 'directory-evidence-invalid',
        sha,
        reasons: [lifecycleEvidenceReason(error)],
      };
    }
    if (!hasAcceptedTestEvidence(lifecycleEvidence)) {
      return {
        status: 'directory-evidence-invalid',
        sha,
        sourceKind: lifecycleEvidence.sourceKind,
        lifecycleEvidence,
        reasons: [{ code: 'directory-test-evidence-missing' }],
      };
    }
    if (currentState === 'test') {
      return {
        status: 'directory-evidence-accepted',
        sha,
        sourceKind: lifecycleEvidence.sourceKind,
        lifecycleEvidence,
      };
    }
    const moveResult = moveState
      ? await moveState({ issueNumber: issueNum, target: 'test', lifecycleEvidence })
      : undefined;
    const moveFailed = moveResult && moveResult.ok === false && moveResult.benign !== true;
    if (moveFailed) {
      return {
        status: 'move-failed',
        sha,
        results: [],
        target: 'test',
        move: moveResult,
        sourceKind: lifecycleEvidence.sourceKind,
        lifecycleEvidence,
      };
    }
    if (logIssueTime) await logIssueTime(issueNum);
    return {
      status: 'passed',
      sha,
      results: [],
      receipt: null,
      target: 'test',
      move: moveResult,
      sourceKind: lifecycleEvidence.sourceKind,
      lifecycleEvidence,
    };
  }
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
  // #952 — a pre-#864 body's `tests` DoD verifier may still declare the
  // retired single `npm run test:all` command. Auto-migrate it to the
  // two-lane split (`npm test` + `npm run test:slow`) on the live body
  // before the sandbox ever sees the stale command — otherwise the sandbox
  // hits `npm error Missing script: "test:all"`, a red that `promote`'s
  // wrapper misreports as a silent exit-0.
  {
    const migrated = migrateTestsLaneSplit(body);
    if (migrated.changed) {
      body = migrated.body;
      await mutateBody({ cfg, issueNum, mutate: (base) => migrateTestsLaneSplit(base).body });
    }
  }

  const vcs = parseVerificationCommands(body);
  if (vcs.length === 0) {
    return {
      status: 'no-vc',
      message:
        `⛔ #${issueNum}: REFUSING to verify — body has no \`## Verification ` +
        `Commands\` section with a parseable \`- [ ] \`command\`\` entry. This is ` +
        `a failure, not a clean pass: there is nothing to run, so the issue ` +
        `cannot advance to review. Seed a Verification Commands section (a ` +
        `plan→develop gate now enforces presence; pre-#410 issues need a ` +
        `back-fill) and re-run \`test\`.`,
    };
  }

  if (runDevelopFinalization && currentState === 'test') {
    const currentFingerprint = await buildFingerprint({ projectDir, commitSha: sha });
    const existingTestReceipt = parseVerificationReceipt(body, 'test');
    const existingValidation = validateVerificationReceipt({
      receipt: existingTestReceipt,
      expectedIssue: Number(issueNum),
      expectedStage: 'test',
      fingerprint: currentFingerprint,
      required: requiredTestReceiptClassifications(existingTestReceipt),
    });
    if (existingValidation.ok && deps.forceRerun !== true) {
      return {
        status: 'already-verified',
        sha,
        receipt: existingTestReceipt,
        reasons: [],
      };
    }
    if (existingValidation.ok && deps.forceRerun === true) {
      await postComment({
        cfg,
        issueNum,
        body: `⚠ Audited Test re-run override: valid exact-SHA receipt ${existingTestReceipt.receiptId} was bypassed with --force.`,
      });
    }
  }
  let developEvidence = null;
  let developReuseRefusal = [];
  if (runDevelopFinalization && currentState === 'develop' && deps.forceRerun !== true) {
    try {
      const currentFingerprint = await buildFingerprint({ projectDir, commitSha: sha });
      const existingReceipt = parseVerificationReceipt(body, 'develop-final');
      const markerPresent = hasVerificationReceiptMarker(body, 'develop-final');
      const existingValidation = validateVerificationReceipt({
        receipt: existingReceipt,
        expectedIssue: Number(issueNum),
        expectedStage: 'develop-final',
        fingerprint: currentFingerprint,
        required: ['lint-full', 'format-full'],
      });
      if (existingValidation.ok) {
        developEvidence = {
          receipt: existingReceipt,
          fingerprint: currentFingerprint,
          validation: existingValidation,
        };
      } else {
        developReuseRefusal = markerPresent
          ? existingValidation.reasons
          : [{ code: 'receipt-missing' }];
      }
    } catch (error) {
      developReuseRefusal = [
        { code: 'fingerprint-unresolvable', message: String(error?.message || error) },
      ];
    }
  }
  if (runDevelopFinalization && !developEvidence) {
    if (developReuseRefusal.length > 0) {
      const codes = developReuseRefusal.map(({ code }) => code).join(', ');
      await postComment({
        cfg,
        issueNum,
        body: `⚠ Develop-final receipt reuse refused before Test: ${codes}. Running one new Develop finalization.`,
      });
    }
    const finalization = await runDevelopFinalization({
      projectDir,
      issueNumber: Number(issueNum),
    });
    if (!finalization?.ok || !finalization.receipt || !finalization.fingerprint) {
      const codes = (finalization?.reasons || []).map(({ code }) => code).join(', ') || 'unknown';
      await postComment({
        cfg,
        issueNum,
        body: `⛔ Develop finalization refused before Test: ${codes}. The issue remains in Develop.`,
      });
      return { status: 'develop-final-invalid', sha, reasons: finalization?.reasons || [] };
    }
    await mutateBody({
      cfg,
      issueNum,
      evidenceStamp: true,
      mutate: (base) => upsertVerificationReceipt(base, finalization.receipt),
    });
    body = await fetchBody({ cfg, issueNum });
    const readBack = parseVerificationReceipt(body, 'develop-final');
    const validation = validateVerificationReceipt({
      receipt: readBack,
      expectedIssue: Number(issueNum),
      expectedStage: 'develop-final',
      fingerprint: finalization.fingerprint,
      required: ['lint-full', 'format-full'],
    });
    if (!validation.ok) {
      const codes = validation.reasons.map(({ code }) => code).join(', ');
      await postComment({
        cfg,
        issueNum,
        body: `⛔ Develop finalization receipt read-back refused: ${codes}. The issue remains in Develop.`,
      });
      return { status: 'develop-final-invalid', sha, reasons: validation.reasons };
    }
    developEvidence = { receipt: readBack, fingerprint: finalization.fingerprint, validation };
  }
  // #563 — per-run-unique path. With a unique token the reclaim below can only
  // ever match THIS run's own leftover, never a concurrent peer's live worktree.
  const wtPath = sandboxWorktreePath({ projectDir, issueNum, sha });
  if (existsSync(wtPath)) {
    await removeWorktree({ projectDir, path: wtPath });
  }

  // #270 — Gate-first flow. The board stays on `develop` for the entire
  // sandbox run; `moveState('test')` is only called once the sandbox is green
  // and `aitm-dod-verified` has been stamped. The develop-exit-sandbox-proof
  // guard then accepts the transition because the marker is present. Red and
  // setup-crash paths return without ever calling `moveState`, so there is
  // no scaffolding to undo and no risk of a half-stepped lifecycle.
  const results = [];
  let cleanupNeeded = false;
  let setupDiag = null; // #254 — tagged diagnostics from the last failed setup attempt
  let testFingerprint = null;
  let testExecutionContext = null;
  let evidenceRefusal = null;
  let partition = null;
  // #1158 — set only when the complete-lane floor was PROVEN droppable for this
  // run; carries the evidence that made the drop legal so the receipt can say
  // "these lanes were skipped, and here is why" rather than staying silent.
  let laneSkip = null;
  // #1158 — fail-loud blocker: the lanes were skipped while the VC list still
  // declares a legacy aggregate (`npm test` / `npm run test:all`) whose verdict
  // is derived from those very lanes. Refuse instead of deriving from nothing.
  let laneSkipRefusal = null;
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
      npmCi,
      removeWorktree,
      onCreated: () => {
        cleanupNeeded = true;
      },
      captureDiag: (d) => {
        setupDiag = d;
      },
    });

    let commandsToRun = vcs;
    if (developEvidence) {
      const sandboxSha = await getSandboxHeadSha({ projectDir: wtPath });
      if (sandboxSha !== sha) {
        evidenceRefusal = [{ code: 'sha-mismatch', expected: sha, actual: sandboxSha }];
      } else {
        testFingerprint = await buildFingerprint({ projectDir: wtPath, commitSha: sha });
        const validation = validateVerificationReceipt({
          receipt: developEvidence.receipt,
          expectedIssue: Number(issueNum),
          expectedStage: 'develop-final',
          fingerprint: testFingerprint,
          required: ['lint-full', 'format-full'],
        });
        if (!validation.ok) evidenceRefusal = validation.reasons;
      }

      if (!evidenceRefusal) {
        // #1158 — "the kind declares, the diff decides". The complete-lane floor
        // is dropped ONLY when the issue is marked `docs-only` AND the sandbox's
        // own `trunk...HEAD` diff is provably documentation-only. This is the
        // same `docsKindDropsTests` rule the DoD layer (#865) and the Review NAT
        // gate (#940) already use, so all three layers relax together or not at
        // all. `computeChangedPaths` yields [] on any failure and
        // `diffIsDocsOnly` treats an empty set as NOT proven, so an unresolvable
        // diff keeps every lane running — exactly like a code-touching one.
        const kind = parseIssueKind(body);
        const changedPaths = await computeChangedPaths({ projectDir: wtPath });
        const dropLanes = docsKindDropsTests(kind, changedPaths);
        if (dropLanes) {
          laneSkip = {
            reason: 'docs-only-diff',
            kind,
            lanes: COMPLETE_TEST_LANES.map(({ classification }) => classification),
            changedPaths,
          };
        }
        partition = partitionVerificationCommands({
          commands: vcs,
          reusableClassifications: developEvidence.validation.reusableCommands.map(
            ({ classification }) => classification
          ),
          includeCompleteLanes: !dropLanes,
        });
        // #1158 — a legacy aggregate's verdict is DERIVED from the complete
        // lanes' results (see the compatibility block below). With the lanes
        // skipped there is nothing to derive from, and the derivation would
        // quietly report the aggregate as failed. Refuse the run instead: the
        // operator either drops the aggregate from the VC list or lets the lanes
        // run. The board is not moved and no verdict is invented.
        if (laneSkip && partition.compatibility.length > 0) {
          laneSkipRefusal = {
            code: 'lane-skip-vs-legacy-aggregate',
            declared: partition.compatibility.map(({ command }) => command),
            lanes: laneSkip.lanes,
          };
        }
      }

      if (!evidenceRefusal && !laneSkipRefusal) {
        for (const reused of partition.reused) {
          const source = developEvidence.receipt.commands.find(
            ({ classification }) => classification === reused.classification
          );
          results.push({
            command: reused.command,
            classification: reused.classification,
            passed: true,
            exit: 0,
            stdout: '',
            stderr: '',
            durationMs: source.durationMs,
            startedAt: source.startedAt,
            completedAt: source.completedAt,
            reusedFrom: developEvidence.receipt.receiptId,
            receiptCommand: { ...source, reusedFrom: developEvidence.receipt.receiptId },
          });
        }
        for (const lane of partition.completeLanes) {
          const argv = lane.command.split(' ');
          const r = await execInSandbox({ argv, path: wtPath, projectDir });
          results.push({
            command: lane.command,
            classification: lane.classification,
            passed: r.exit === 0,
            exit: r.exit,
            cause: r.cause,
            stdout: r.stdout,
            stderr: r.stderr,
            durationMs: r.durationMs ?? 0,
            startedAt: r.startedAt,
            completedAt: r.completedAt,
            receiptCommand: {
              classification: lane.classification,
              command: argv[0],
              args: argv.slice(1),
              exitCode: r.exit,
              durationMs: r.durationMs ?? 0,
              ...(r.startedAt ? { startedAt: r.startedAt } : {}),
              ...(r.completedAt ? { completedAt: r.completedAt } : {}),
            },
          });
        }
        const byClassification = new Map(results.map((result) => [result.classification, result]));
        for (const legacy of partition.compatibility) {
          const required =
            legacy.classification === 'test-all-legacy'
              ? ['test-unit', 'test-integration', 'test-slow']
              : ['test-unit', 'test-integration'];
          const passed = required.every(
            (classification) => byClassification.get(classification)?.passed
          );
          results.push({
            command: legacy.command,
            classification: legacy.classification,
            passed,
            exit: passed ? 0 : 1,
            stdout: '',
            stderr: '',
            durationMs: 0,
          });
        }
        commandsToRun = partition.targeted;
      } else {
        commandsToRun = [];
      }
    }

    for (const vc of commandsToRun) {
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
      const r = await execInSandbox({ argv: validation.argv, path: wtPath, projectDir });
      results.push({
        command: vc.command,
        classification: developEvidence ? `test-targeted-${results.length + 1}` : undefined,
        passed: r.exit === 0,
        exit: r.exit,
        cause: r.cause,
        stdout: r.stdout,
        stderr: r.stderr,
        durationMs: r.durationMs ?? 0,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        ...(developEvidence
          ? {
              receiptCommand: {
                classification: `test-targeted-${results.length + 1}`,
                command: validation.argv[0],
                args: validation.argv.slice(1),
                exitCode: r.exit,
                durationMs: r.durationMs ?? 0,
                ...(r.startedAt ? { startedAt: r.startedAt } : {}),
                ...(r.completedAt ? { completedAt: r.completedAt } : {}),
              },
            }
          : {}),
      });
    }

    if (developEvidence && !evidenceRefusal && !laneSkipRefusal) {
      const completedFingerprint = await buildFingerprint({ projectDir: wtPath, commitSha: sha });
      const completedValidation = validateVerificationReceipt({
        receipt: developEvidence.receipt,
        expectedIssue: Number(issueNum),
        expectedStage: 'develop-final',
        fingerprint: completedFingerprint,
        required: ['lint-full', 'format-full'],
      });
      if (!completedValidation.ok) evidenceRefusal = completedValidation.reasons;
      testFingerprint = completedFingerprint;
      if (!evidenceRefusal) {
        // Capture while the detached sandbox still exists. Once `finally`
        // removes it, Git metadata lookup would walk up to the bound child
        // worktree and falsely attribute the receipt to that checkout.
        testExecutionContext = captureEvidenceProvenance({
          projectDir: wtPath,
          boundIssue: issueNum,
        });
      }
    }
  } catch (err) {
    // #270 — sandbox-setup or sandbox-run threw. The board is still on
    // `develop` (gate-first flow never moved it), so there is nothing to undo.
    // Post the audit comment for visibility and re-throw so the caller
    // surfaces a non-zero exit.
    //
    // #254 — the audit comment carries durable diagnostics (failing step,
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
    throw err;
  } finally {
    if (cleanupNeeded) {
      await removeWorktree({ projectDir, path: wtPath });
    }
  }

  if (evidenceRefusal) {
    const codes = evidenceRefusal.map(({ code }) => code).join(', ');
    await postComment({
      cfg,
      issueNum,
      body: `⛔ Develop receipt is invalid in the Test sandbox: ${codes}. Return to Develop and finalize again.`,
    });
    return { status: 'develop-evidence-invalid', sha, reasons: evidenceRefusal, wtPath };
  }

  // #1158 — lanes were legally skipped but the VC list still declares an
  // aggregate that can only be derived FROM those lanes. Refuse loudly; the
  // board is untouched (gate-first flow never moved it) and no verdict is
  // manufactured for a command that did not run.
  if (laneSkipRefusal) {
    await postComment({
      cfg,
      issueNum,
      body: [
        `⛔ Test refused: ${laneSkipRefusal.code}.`,
        '',
        `This issue's diff is provably documentation-only, so the complete test lanes (${laneSkipRefusal.lanes.join(', ')}) were skipped.`,
        `But \`## Verification Commands\` still declares ${laneSkipRefusal.declared.map((c) => `\`${c}\``).join(', ')}, whose pass/fail is derived from those lanes.`,
        '',
        'Deriving a verdict from lanes that never ran would be fabricated evidence. Either remove the aggregate command from the VC list, or drop the `docs-only` kind so the lanes run.',
      ].join('\n'),
    });
    return { status: 'lane-skip-refused', sha, reasons: [laneSkipRefusal], laneSkip, wtPath };
  }

  // #973 — a `rejected` result whose reason is a policy-shape mismatch (see
  // `isPolicyShapeRejection` above) must not gate promotion the same way a
  // genuine nonzero-exit `failed` result does. A metachar/injection-vector
  // rejection still does — it keeps `allGreen` false, matching story #137's
  // invariant that a blocked attack payload must not report as a pass. The
  // allowlist rejection still renders with its `⚠` mark and reason in
  // `buildResultTable` so the operator sees the VC needs rewriting either way.
  const allGreen =
    results.length > 0 &&
    results.every((r) => r.passed || (r.rejected && isPolicyShapeRejection(r.rejected)));

  if (allGreen) {
    const ts = now();
    const baseReceipt = developEvidence
      ? createVerificationReceipt({
          issueNumber: Number(issueNum),
          stage: 'test',
          fingerprint: testFingerprint,
          executionContext: testExecutionContext,
          commands: results
            .filter(({ receiptCommand }) => receiptCommand)
            .map(({ receiptCommand }) => receiptCommand),
          now,
        })
      : null;
    // #1158 — a lane that did not run contributes NO command entry, so the
    // receipt never claims a pass it did not earn. Absence alone, though, is
    // ambiguous: it reads the same as a run that simply never reached the lane.
    // `laneSkip` is the positive record that disambiguates it — which lanes were
    // omitted, and on what evidence. Its absence means the lanes were declared
    // and ran; its presence means they were deliberately skipped.
    const testReceipt = baseReceipt && laneSkip ? { ...baseReceipt, laneSkip } : baseReceipt;
    // #270 — Gate-first: stamp `aitm-dod-verified` (and a defensive
    // `test`-entry marker for stub moveStates that skip stamping) BEFORE
    // `moveState('test')`. The develop-exit-sandbox-proof guard inside
    // `runGuards` then sees the marker on the live body and accepts the
    // transition. verbTest advances develop→test only; Test→Review is a
    // separate forward verb (`/task review`).
    let stamped = insertDodVerifiedMarker(body, sha, ts);
    if (testReceipt) stamped = upsertVerificationReceipt(stamped, testReceipt);
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
        // #522 — sanctioned sandbox auto-stamp: `insertDodVerifiedMarker` +
        // `autoTickVerified` mint proof from the green sandbox run just executed.
        evidenceStamp: true,
        mutate: (base) => {
          let next = insertDodVerifiedMarker(base, sha, ts);
          if (testReceipt) next = upsertVerificationReceipt(next, testReceipt);
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
    // #406 — capture the move result so a refused promotion does not read as a
    // pass. The sandbox genuinely went green (post the table + log time below),
    // but the success banner in `verbTest` must be gated on the move actually
    // landing. Only an explicit `ok === false` (and not the benign done→done
    // self-loop) is a failure; legacy stub deps that return `undefined` keep
    // the `passed` path.
    let moveResult;
    if (moveState) {
      moveResult = await moveState({ issueNumber: issueNum, target: 'test' });
    }
    const moveFailed = moveResult && moveResult.ok === false && moveResult.benign !== true;
    let newTestsPost = null;
    if (!moveFailed && postNewTests) {
      try {
        newTestsPost = await postNewTests({
          cfg,
          issueNumber: issueNum,
          cwd: projectDir,
        });
      } catch (err) {
        newTestsPost = { status: 'post-failed', error: err.message };
      }
    }
    await postComment({
      cfg,
      issueNum,
      body: buildResultTable(results, {
        sha,
        status: 'green',
        autoTicked: autoTick.tickedVc.length + autoTick.tickedFunctional.length,
        laneSkip,
      }),
    });
    if (logIssueTime) await logIssueTime(issueNum);
    if (moveFailed) {
      return {
        status: 'move-failed',
        sha,
        ts,
        results,
        receipt: testReceipt,
        wtPath,
        target: 'test',
        move: moveResult,
      };
    }
    // #444 — a benign move result with target 'test' can only be a test→test
    // self-loop: the issue was already in `test` and the sandbox just re-ran the
    // current VC set in place (an in-place re-verify, not a fresh entry). The
    // board column is unchanged; surface a distinct loud-success status so the
    // banner does not falsely claim a develop→test promotion.
    // #882 — a self-transition is now a legal no-op (`ok:true, noop:true`) rather
    // than the exit-5 refusal this branch originally keyed on. Both shapes are
    // accepted so the status survives regardless of which path produced it.
    if (
      moveResult &&
      (moveResult.noop === true || (moveResult.ok === false && moveResult.benign === true))
    ) {
      return {
        status: 'reverified',
        sha,
        ts,
        results,
        receipt: testReceipt,
        wtPath,
        target: 'test',
        move: moveResult,
        newTestsPost,
      };
    }
    return {
      status: 'passed',
      sha,
      ts,
      results,
      receipt: testReceipt,
      wtPath,
      target: 'test',
      newTestsPost,
    };
  }

  // #270 — Red path. Gate-first means the board never moved; nothing to undo.
  await postComment({
    cfg,
    issueNum,
    body: buildResultTable(results, { sha, status: 'red', laneSkip }),
  });
  return { status: 'failed', sha, results, wtPath };
}

// #346 — re-exported so the slow regression test (and any future callers that
// need to exercise the two-stage cleanup) can import it directly without
// reaching through `runVerbTest` deps injection.
export { defaultRemoveWorktree, defaultCreateWorktree, defaultExecInSandbox };

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

  const moveState = async ({ issueNumber: n, target: t, lifecycleEvidence }) =>
    runMoveState(`#${n}`, t, { silent: true, lifecycleEvidence });
  const logIssueTime = async (n) => {
    await runLogIssueTime(`#${n}`);
  };

  let result;
  try {
    result = await runVerbTest({
      cfg,
      issueNumber,
      projectDir,
      deps: {
        moveState,
        logIssueTime,
        postNewAutomatedTestsComment,
        runDevelopFinalization: defaultRunDevelopFinalization,
        forceRerun: rest.includes('--force'),
      },
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
      if (result.newTestsPost?.status === 'posted') {
        console.log('  ↳ posted "## New Automated Tests" comment');
      } else if (result.newTestsPost?.status === 'post-failed') {
        console.error(`  ⚠ new-automated-tests comment post failed: ${result.newTestsPost.error}`);
      }
      // #407 — preserve the binding (`active`) across a successful non-terminal
      // verb. Only the timing session closes; the issue stays bound so the next
      // verb needs no intervening re-`start`. `pause` remains the sole verb that
      // nulls `active`.
      saveState(pauseTimingKeepBinding(s, `#${issueNumber}`), statePath);
      return;
    }
    case 'reverified': {
      // #444 — already in Test; the sandbox re-ran the current VC set in place
      // and re-stamped results. Loud success, board column unchanged. Same
      // timing/binding handling as `passed`.
      console.log(buildReverifiedMessage(issueNumber));
      if (result.newTestsPost?.status === 'posted') {
        console.log('  ↳ posted "## New Automated Tests" comment');
      } else if (result.newTestsPost?.status === 'post-failed') {
        console.error(`  ⚠ new-automated-tests comment post failed: ${result.newTestsPost.error}`);
      }
      saveState(pauseTimingKeepBinding(s, `#${issueNumber}`), statePath);
      return;
    }
    case 'already-verified':
      console.log(
        `✓ #${issueNumber} already has a valid exact-SHA Test receipt (${result.receipt.receiptId}); standard commands were not rerun.`
      );
      saveState(pauseTimingKeepBinding(s, `#${issueNumber}`), statePath);
      return;
    case 'directory-evidence-accepted':
      console.log(
        `✓ #${issueNumber} already has accepted current-contract exact-SHA Test evidence; body receipts were not consulted.`
      );
      saveState(pauseTimingKeepBinding(s, `#${issueNumber}`), statePath);
      return;
    case 'move-failed': {
      // #406 — sandbox passed but the board move was refused. Do NOT print the
      // success banner; surface the move-state child's real refusal reason and
      // exit non-zero.
      process.stderr.write('\n');
      process.stderr.write(
        `⛔ #${issueNumber} verified in sandbox but the move to Test was refused:\n`
      );
      for (const line of String(result.move?.stderr || '').split('\n')) {
        if (line.trim()) process.stderr.write(`   ${line}\n`);
      }
      process.stderr.write('\n');
      process.exit(result.move?.status || 3);
    }
    case 'failed': {
      const fails = result.results.filter(
        (r) => !r.passed && !(r.rejected && isPolicyShapeRejection(r.rejected))
      ).length;
      console.error(`✗ #${issueNumber} verification failed in sandbox (${fails} command(s)).`);
      process.exit(3);
    }
    case 'develop-final-invalid':
    case 'develop-evidence-invalid':
    case 'directory-evidence-invalid':
      console.error(
        `✗ #${issueNumber} verification evidence refused: ${result.reasons.map(({ code }) => code).join(', ')}`
      );
      process.exit(3);
      break;
    default:
      console.error(`/task test: unknown result status: ${result.status}`);
      process.exit(1);
  }
}
