import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { loadState, saveState, pauseTimingKeepBinding } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';
import {
  parseDodVerifiedMarker,
  parseTestStartedMarker,
  parseVerificationReceipt,
} from '../lib/markers.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { STANDARD_DOD_COMMANDS } from '../lib/evidence-markers.mjs';
import { parseProofMarker, hasExecutionProof } from '../lib/proof-marker.mjs';
import { unescapeValue } from '../lib/proof-marker.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { resolveVcRefCommands } from '../lib/vc-ref.mjs';
import { stripMarkers } from '../lib/ac-evidence.mjs';
import {
  postTimingEvent,
  buildRow,
  buildFlushRow,
  readLastKnownState,
} from '../gh-timing-comment.mjs';
import { assertVerbHomeState } from '../lib/verb-home-state-guard.mjs';
import { GH_API_TIMEOUT_MS, sandboxTimeoutMs } from '../lib/process-timeouts.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';
import { deriveAndRescan } from '../lib/review-derive-rescan.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from '../lib/body-invariants.mjs';
import { isAcWaived } from '../lib/issue-kind.mjs';
// #809 — Agent Review Gate. `bootstrap` registers every built-in validator on
// the shared singleton registry as an import side effect; `runAgentReviewGate`
// runs them inline in `verbReview` and the marker helpers stamp/clear the
// `aitm-review-failed` record on a failing gate.
import '../lib/agent-review/bootstrap.mjs';
import {
  runAgentReviewGate,
  stampReviewFailed,
  clearReviewFailed,
  stampAgentReviewPassed,
} from '../lib/agent-review/review-gate.mjs';
import { computeReviewChangedPaths } from '../lib/review-changed-paths.mjs';
import { canonicalRecordJson } from '../lib/github-records/canonical-json.mjs';
import {
  buildVerificationFingerprint,
  createVerificationReceipt,
  hasVerificationReceiptMarker,
  upsertVerificationReceipt,
  validateVerificationReceipt,
} from '../lib/verification-receipt.mjs';

const TEST_RECEIPT_REQUIRED = Object.freeze([
  'lint-full',
  'format-full',
  'test-unit',
  'test-integration',
  'test-slow',
]);
const reviewPexec = promisify(execFile);

function isExactProjectFile(token, projectDir, { testFile = false } = {}) {
  if (!projectDir || typeof token !== 'string' || /[*?{}[\]]/.test(token)) return false;
  if (testFile && !/\.(?:test|spec)\.(?:[cm]?js|ts)$/.test(token)) return false;
  const resolved = path.resolve(projectDir, token);
  const relative = path.relative(projectDir, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false;
  }
  try {
    return statSync(resolved).isFile();
  } catch {
    return false;
  }
}

function isTargetedReviewProbe(argv, projectDir) {
  if (argv[0] === 'node') {
    return (
      argv.length >= 3 &&
      argv[1] === '--test' &&
      argv.slice(2).every((token) => isExactProjectFile(token, projectDir, { testFile: true }))
    );
  }

  if (argv[0] !== 'npx' || !['eslint', 'prettier'].includes(argv[1])) return false;
  if (argv[1] === 'eslint') {
    return (
      argv.length >= 3 && argv.slice(2).every((token) => isExactProjectFile(token, projectDir))
    );
  }
  return (
    argv.length >= 4 &&
    argv[2] === '--check' &&
    argv.slice(3).every((token) => isExactProjectFile(token, projectDir))
  );
}

function standardReviewCommandResults() {
  return new Map(
    [...STANDARD_DOD_COMMANDS, 'npm run test:unit', 'npm run test:integration'].map((command) => [
      command,
      true,
    ])
  );
}

function markerMatchesSha(marker, sha) {
  if (!marker?.sha) return false;
  return sha.startsWith(marker.sha) || marker.sha.startsWith(sha);
}

export async function resolveReviewVerificationEvidence({
  body,
  issueNumber,
  projectDir,
  getHeadSha,
  buildFingerprint = buildVerificationFingerprint,
} = {}) {
  const receipt = parseVerificationReceipt(body, 'test');
  const commandResults = standardReviewCommandResults();
  if (!receipt) {
    if (hasVerificationReceiptMarker(body, 'test')) {
      return {
        ok: false,
        mode: 'receipt-v1',
        receipt: null,
        commandResults: new Map(),
        reasons: [{ code: 'receipt-malformed' }],
        remediation:
          'Return to Develop, run Develop finalization, then complete one new Test pass.',
      };
    }
    return { ok: true, mode: 'legacy-marker', receipt: null, commandResults, reasons: [] };
  }

  let commitSha;
  try {
    commitSha = await getHeadSha({ projectDir });
  } catch {
    return {
      ok: false,
      mode: 'receipt-v1',
      receipt,
      commandResults: new Map(),
      reasons: [{ code: 'head-unresolvable' }],
      remediation: 'Return to Develop, run Develop finalization, then complete one new Test pass.',
    };
  }
  let fingerprint;
  try {
    fingerprint = await buildFingerprint({ projectDir, commitSha });
  } catch {
    return {
      ok: false,
      mode: 'receipt-v1',
      receipt,
      commandResults: new Map(),
      reasons: [{ code: 'fingerprint-unresolvable' }],
      remediation: 'Return to Develop, run Develop finalization, then complete one new Test pass.',
    };
  }
  const validation = validateVerificationReceipt({
    receipt,
    ...(issueNumber !== undefined ? { expectedIssue: Number(issueNumber) } : {}),
    expectedStage: 'test',
    fingerprint,
    required: TEST_RECEIPT_REQUIRED,
  });
  const reasons = [...validation.reasons];
  const testStarted = parseTestStartedMarker(body);
  const dodVerified = parseDodVerifiedMarker(body);
  if (!markerMatchesSha(testStarted, commitSha))
    reasons.push({ code: 'test-started-sha-mismatch' });
  if (!markerMatchesSha(dodVerified, commitSha))
    reasons.push({ code: 'dod-verified-sha-mismatch' });
  if (reasons.length === 0) {
    for (const command of receipt.commands) {
      if (!command.classification.startsWith('test-targeted-') || command.exitCode !== 0) continue;
      commandResults.set([command.command, ...command.args].join(' ').trim(), true);
    }
  }
  return {
    ok: reasons.length === 0,
    mode: 'receipt-v1',
    receipt,
    fingerprint,
    commandResults: reasons.length === 0 ? commandResults : new Map(),
    reasons,
    remediation: 'Return to Develop, run Develop finalization, then complete one new Test pass.',
  };
}

export function appendReviewProbeEvidence({ body, issueNumber, fingerprint, probes, now } = {}) {
  const prior = parseVerificationReceipt(body, 'review');
  const priorMatchesFingerprint =
    prior?.commitSha === fingerprint?.commitSha &&
    canonicalRecordJson(prior?.environment) === canonicalRecordJson(fingerprint?.environment);
  const commands = (probes || []).map((probe) => ({
    classification: 'review-probe',
    command: probe.command,
    args: probe.args || [],
    exitCode: probe.exitCode,
    durationMs: probe.durationMs,
    ...(probe.startedAt ? { startedAt: probe.startedAt } : {}),
    ...(probe.completedAt ? { completedAt: probe.completedAt } : {}),
  }));
  if (commands.length === 0) return { body: String(body || ''), receipt: null };
  const receipt = createVerificationReceipt({
    issueNumber,
    stage: 'review',
    fingerprint,
    commands: [...(priorMatchesFingerprint ? prior.commands : []), ...commands],
    now,
  });
  return { body: upsertVerificationReceipt(body, receipt), receipt };
}

export function parseReviewProbeCommands(rest = []) {
  const commands = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = String(rest[index]);
    if (arg === '--probe') {
      const command = rest[index + 1];
      if (!command || String(command).startsWith('--')) {
        throw new Error('review: --probe requires one quoted command');
      }
      commands.push(String(command));
      index += 1;
    } else if (arg.startsWith('--probe=')) {
      const command = arg.slice('--probe='.length);
      if (!command) throw new Error('review: --probe requires one quoted command');
      commands.push(command);
    }
  }
  return commands;
}

export function validateReviewProbeCommand(
  command,
  { projectDir, validateCommand = validateVerificationCommand } = {}
) {
  const validation = validateCommand(command, { projectDir });
  if (!validation.ok) return validation;
  const identity = validation.argv.join(' ');
  if (!isTargetedReviewProbe(validation.argv, projectDir)) {
    return {
      ok: false,
      reason: `Review probes must be targeted; '${identity}' is a standard stage-owned command`,
    };
  }
  return validation;
}

async function defaultReviewProbeHeadSha({ projectDir }) {
  const { stdout } = await reviewPexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
  return String(stdout || '').trim();
}

async function defaultExecuteReviewProbe({ argv, projectDir }) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const { stdout, stderr } = await reviewPexec(argv[0], argv.slice(1), {
      cwd: projectDir,
      timeout: sandboxTimeoutMs(),
      maxBuffer: 64 * 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      durationMs: Date.now() - startedMs,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || ''),
      durationMs: Date.now() - startedMs,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

async function defaultReviewProbeFetchBody({ cfg, issueNumber }) {
  const { stdout } = await reviewPexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

async function defaultReviewProbeMutateBody({ cfg, issueNumber, mutate }) {
  return mutateIssueBody({
    issueNumber,
    repo: cfg.repo,
    mutate,
    evidenceStamp: true,
    deps: { pexec: reviewPexec },
  });
}

export async function runReviewProbes({
  body,
  issueNumber,
  projectDir,
  commands,
  cfg = {},
  now = () => new Date().toISOString(),
  deps = {},
} = {}) {
  const getHeadSha = deps.getHeadSha || defaultReviewProbeHeadSha;
  const buildFingerprint = deps.buildFingerprint || buildVerificationFingerprint;
  const validateCommand = deps.validateCommand || validateReviewProbeCommand;
  const executeCommand = deps.executeCommand || defaultExecuteReviewProbe;
  const mutateBody = deps.mutateBody || defaultReviewProbeMutateBody;
  const fetchBody = deps.fetchBody || defaultReviewProbeFetchBody;
  const requested = Array.isArray(commands) ? commands : [];
  if (requested.length === 0) return { status: 'no-probes', probes: [] };

  const testEvidence = await resolveReviewVerificationEvidence({
    body,
    issueNumber,
    projectDir,
    getHeadSha,
    buildFingerprint,
  });
  if (!testEvidence.ok) {
    return { status: 'test-evidence-invalid', probes: [], reasons: testEvidence.reasons };
  }

  const initialSha = await getHeadSha({ projectDir });
  const initialFingerprint = await buildFingerprint({ projectDir, commitSha: initialSha });
  const validations = requested.map((command) => ({
    command,
    validation: validateCommand(command, { projectDir }),
  }));
  const rejected = validations.find(({ validation }) => !validation.ok);
  if (rejected) {
    return {
      status: 'rejected',
      probes: [],
      reasons: [
        {
          code: 'probe-command-rejected',
          command: rejected.command,
          reason: rejected.validation.reason,
        },
      ],
    };
  }
  const probes = [];
  for (const { validation } of validations) {
    const result = await executeCommand({ argv: validation.argv, projectDir });
    probes.push({
      command: validation.argv[0],
      args: validation.argv.slice(1),
      exitCode: result.exitCode,
      durationMs: result.durationMs ?? 0,
      ...(result.startedAt ? { startedAt: result.startedAt } : {}),
      ...(result.completedAt ? { completedAt: result.completedAt } : {}),
    });
  }

  const completedSha = await getHeadSha({ projectDir });
  const completedFingerprint = await buildFingerprint({
    projectDir,
    commitSha: completedSha,
  });
  const fingerprintChanged =
    initialSha !== completedSha ||
    canonicalRecordJson(initialFingerprint) !== canonicalRecordJson(completedFingerprint);
  if (fingerprintChanged) {
    return {
      status: 'fingerprint-changed',
      probes,
      reasons: [{ code: 'probe-fingerprint-changed' }],
    };
  }

  let writtenReceipt = null;
  await mutateBody({
    cfg,
    issueNumber,
    evidenceStamp: true,
    mutate: (base) => {
      const appended = appendReviewProbeEvidence({
        body: base,
        issueNumber,
        fingerprint: completedFingerprint,
        probes,
        now,
      });
      writtenReceipt = appended.receipt;
      return appended.body;
    },
  });
  const persistedBody = await fetchBody({ cfg, issueNumber });
  const readBack = parseVerificationReceipt(persistedBody, 'review');
  if (!writtenReceipt || readBack?.receiptId !== writtenReceipt.receiptId) {
    return { status: 'readback-failed', probes, reasons: [{ code: 'probe-readback-failed' }] };
  }
  return {
    status: probes.every(({ exitCode }) => exitCode === 0) ? 'passed' : 'failed',
    probes,
    receipt: readBack,
  };
}

// #975 — a VC-section checkbox legitimately ticked via the honest
// `--allow-unverified-ticks` hatch (#567, `check.mjs`'s `ensureChecked`) is
// recorded as a trailing `aitm-unverified-tick label="..." ts="..."` marker
// appended to the END of the body, not inline on the checkbox line — it is
// deliberately NOT in the `aitm-verified*` proof family, so it never poses as
// machine evidence. `label` is already `stripMarkers`-stripped by
// `appendUnverifiedTickAudit` at write time; callers must strip the same way
// before comparing.
export function extractUnverifiedTickLabels(rawBody) {
  const labels = new Set();
  const re = /<!--\s*aitm-unverified-tick\s+label="([^"]*)"[^>]*-->/g;
  let m;
  while ((m = re.exec(String(rawBody || '')))) {
    labels.add(unescapeValue(m[1]));
  }
  return labels;
}

// #515 — build the deferred verb-level "starting review" timing row. The ts is
// bound at CALL time (the post site, after runMoveState emits test:passed +
// review:started), NOT when the spec was created. #463 deferred only the
// *posting*; the timestamp was still captured eagerly via nowIso() at spec-build
// time, so the deferred row landed below the move-state pair while carrying a
// pre-move wall-clock — a non-monotonic backwards jump (#506 saw 11s). Keeping
// the spec timestamp-free and stamping `ts` here makes the row's Timestamp
// monotonically non-decreasing relative to the preceding phase-pair.
//
// `kind: 'flush'` rebuilds via buildFlushRow (minute scalars → whole seconds)
// to stay byte-identical to the computeOnly flush row; all other specs use
// buildRow with the seconds it already carries.
export function buildDeferredReviewRow(spec, ts) {
  if (!spec) return null;
  const { kind, ...params } = spec;
  return kind === 'flush' ? buildFlushRow({ ...params, ts }) : buildRow({ ...params, ts });
}

// EPIC #823 timing model v2 (C7 / defect D2): emit an agent-review-gate failure
// as a canonically-ordered timeline. Extracted from `verbReview` so the ORDER is
// unit-testable without the verb's dynamic-import network path
// (runReviewPreflight / runGuards can't be intercepted by node:test).
//
// Ordered side effects:
//   1. mutateBodyFn(… failedBody)                → stamp aitm-review-failed
//   2. safePostTiming(target, review:failed row)
//
// #881 — this function no longer moves the board. The Agent Review Gate is the
// ACTION of the Review state, so by the time it can fail the caller has already
// performed the Test→Review move and the `test:passed` + `review:started` pair is
// on the record (defect D2 stays fixed without the old transient Review touch).
// A failed action leaves the issue IN Review to be fixed in place and re-run; the
// Review→Develop demote that used to be step 4 is deliberately gone, because it
// discarded Test-stage verification over objections that Review's own activity
// policy (`WRITE_ISSUE`/`WRITE_DOCS`) permits fixing where the issue stands. The
// `deps.runMoveState` this function used to require is therefore unused; callers
// may still pass it harmlessly.
export async function emitReviewGateFailureTimeline({
  target,
  issueNum,
  repo,
  failures,
  failedBody,
  ts,
  delta,
  wordMarker,
  deps,
}) {
  const {
    safePostTiming,
    mutateBodyFn,
    buildRow: buildRowFn = buildRow,
    pexec,
    ghApiTimeoutMs = GH_API_TIMEOUT_MS,
    logError = (m) => console.error(m),
  } = deps;
  const objectionSummary = `agent review failed — ${failures.length} objection(s)`;
  // (1) stamp the aitm-review-failed marker.
  try {
    await mutateBodyFn({
      issueNumber: issueNum,
      repo,
      mutate: () => failedBody,
      timeout: ghApiTimeoutMs,
      deps: { pexec },
      allowUnverifiedTicks: true,
    });
  } catch (e) {
    logError(`[task-tracker] failed to stamp aitm-review-failed: ${e.message}`);
  }
  // (2) the review outcome row itself.
  await safePostTiming(
    target,
    buildRowFn({
      ts,
      event: 'review:failed',
      activeSec: delta.activeSec,
      idleSec: delta.idleSec,
      deltaWords: 0,
      // #475 AC1 — carried-forward durable marker (gate failure, no live session)
      wordMarker,
      description: `${objectionSummary}, staying in Review`,
    })
  );
}

// #904 — the PASS-path counterpart to `emitReviewGateFailureTimeline`. The fail
// path emits a `review:failed` row; the pass path historically emitted NONE,
// leaving the Timing Log recording only failures. This helper appends the
// symmetric `review:passed` row. It is timing-row-ONLY (no marker stamp): the
// pass branch already stamps the proven "Agent Review Passed" DoD box inline
// (via `stampAgentReviewPassed` + an `evidenceStamp` write) before calling this.
//
// `review:passed` is V3-legal without any `timing-log-sequence` change: it is a
// colon-qualified (⇒ known) slug in stage `review`; the preceding row is
// `review:started` (also `review`), so the stage walk sees a same-stage no-op;
// and the non-`:failed` qualifier's `aitm-entered-review` marker requirement is
// already met by the Test→Review move that ran before the gate. It is therefore
// a neutral same-stage active PHASE row.
export async function emitReviewGatePassTimeline({
  target,
  ts,
  delta,
  wordMarker,
  validators,
  deps,
}) {
  const { safePostTiming, buildRow: buildRowFn = buildRow } = deps;
  const validatorSummary =
    Array.isArray(validators) && validators.length ? validators.join(', ') : 'none';
  await safePostTiming(
    target,
    buildRowFn({
      ts,
      event: 'review:passed',
      activeSec: delta.activeSec,
      idleSec: delta.idleSec,
      deltaWords: 0,
      // #475 AC1 — carried-forward durable marker (gate pass, no live session)
      wordMarker,
      description: `agent review passed — validators: ${validatorSummary}, result=pass`,
    })
  );
}

// #844 (D6) — the SANDBOX-VERIFICATION-FAILURE demote path. Distinct from the
// gate-objection path above: by the time sandbox verification runs, review has
// NOT yet performed its authoritative Test→Review move, so this path simply
// records the failure outcome and demotes. It must mirror
// `emitReviewGateFailureTimeline` steps (3)+(4): emit a V3-legal `test:failed`
// AUDIT row — NEVER a bare `develop` ladder slug, which `timing-log-sequence`
// (V3) rejects as `malformed — unknown event slug "develop"` and which then
// permanently fails the Agent Review Gate on the issue (the live #823 stranding)
// — then demote via `runMoveState` with `--demote`/`--demote-reason` so the
// entry row is the canonical `demoted:develop` rather than a bare `develop`.
export async function emitSandboxVerificationFailureTimeline({
  target,
  ts,
  delta,
  wordMarker,
  reason = 'sandbox verification failed',
  deps,
}) {
  const { runMoveState, safePostTiming, buildRow: buildRowFn = buildRow } = deps;
  await safePostTiming(
    target,
    buildRowFn({
      ts,
      event: 'test:failed',
      activeSec: delta.activeSec,
      idleSec: delta.idleSec,
      deltaWords: 0,
      // #475 AC1 — carried-forward durable marker (verification-failed revert, no live session)
      wordMarker,
      description: `${reason}, reverted to Develop`,
    })
  );
  await runMoveState(target, 'develop', {
    extraArgs: ['--demote', '--demote-reason', reason],
  });
}

export async function verbReview(ctx) {
  const {
    cfg,
    statePath,
    projectDir,
    rest,
    SKIP_NETWORK,
    pexec,
    drainQueueIfAny,
    safePostTiming,
    runMoveState,
    runLogIssueTime,
    fetchSubIssues,
    getIssueBoardState,
    nowIso,
  } = ctx;
  let probeCommands;
  try {
    probeCommands = parseReviewProbeCommands(rest);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  if (SKIP_NETWORK && probeCommands.length > 0) {
    process.stderr.write('review: --probe refuses with TT_SKIP_NETWORK\n');
    process.exit(1);
  }
  // #622 — seam-widen for offline verb testing. These three externals do real
  // network I/O (preflight: git+gh; mutateIssueBody / deriveAndStampFunctionalDod:
  // gh issue edit). The real CLI passes none of them, so each falls back to its
  // module import below and live behaviour is unchanged; the coverage test injects
  // stubs to drive every branch without a gh/git subprocess.
  const mutateBodyFn = ctx.mutateIssueBody || mutateIssueBody;
  const deriveDodFn = ctx.deriveAndStampFunctionalDod || deriveAndStampFunctionalDod;
  // #622 — `ctx.runGuards` overrides the test→review guard evaluation for
  // offline tests. The real CLI leaves it undefined and uses the imported
  // registry runner, whose `child-cannot-lead-epic` guard does a live gh
  // GraphQL parent lookup; injecting a stub keeps the coverage test free of
  // any subprocess while driving both guard-refusal branches deterministically.
  const runGuardsFn = ctx.runGuards || runGuards;
  await drainQueueIfAny();
  const s = loadState(statePath);
  const target =
    rest.find((a) => /^#\d+$/.test(a)) || (s.active && s.active !== 'discover' ? s.active : null);
  if (!target) {
    console.error('Usage: /task review #N');
    process.exit(1);
  }

  if (!SKIP_NETWORK) {
    const issueNum = String(target).replace(/^#/, '');
    // #622 — `ctx.runReviewPreflight` overrides the dynamic import for offline
    // tests; the real CLI path leaves it undefined and lazy-imports as before.
    const runReviewPreflight =
      ctx.runReviewPreflight || (await import('../lib/review-preflight.mjs')).runReviewPreflight;
    const preflight = await runReviewPreflight({
      issueNumber: issueNum,
      repo: cfg.repo,
      projectDir,
      // #885 — the epic branch needs cfg to fetch the epic's children.
      cfg,
    });
    if (!preflight.ok) {
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing to move ${target} to Review:\n`);
      for (const reason of preflight.reasons) {
        process.stderr.write(`   BLOCKED: ${reason}\n`);
      }
      process.stderr.write(
        `\nResolve the blockers above, then retry \`/task review ${target}\`.\n\n`
      );
      process.exit(4);
    }
  }

  if (!SKIP_NETWORK) {
    const issueNum = String(target).replace(/^#/, '');
    let body = '';
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      body = (stdout || '').trim();
    } catch {
      /* best-effort: GitHub/telemetry side effect; core flow proceeds */
    }
    // #931 — refuse before the agent-review gate/any mutation if the issue
    // isn't in `test` (review's real entry state — test→review is the
    // authoritative move). A missing/failed best-effort fetch leaves body ''
    // (currentState null), which is a no-op — this guard only refuses a
    // *known* wrong state.
    const currentState = readLastKnownState(body).state;
    assertVerbHomeState({
      verb: 'review',
      currentState,
      issueNumber: issueNum,
    });
    if (probeCommands.length > 0) {
      if (currentState !== 'review') {
        process.stderr.write(
          `review: --probe requires #${issueNum} to already be in Review; current state is ${currentState || 'unknown'}\n`
        );
        process.exit(4);
      }
      const probeResult = await runReviewProbes({
        body,
        issueNumber: Number(issueNum),
        projectDir,
        commands: probeCommands,
        cfg,
      });
      if (probeResult.status === 'passed') {
        console.log(
          `✓ #${issueNum} recorded ${probeResult.probes.length} Review probe(s) in receipt ${probeResult.receipt.receiptId}.`
        );
        return;
      }
      const reasons = (probeResult.reasons || [])
        .map(({ code, reason }) => `${code}${reason ? `: ${reason}` : ''}`)
        .join(', ');
      process.stderr.write(
        `⛔ #${issueNum} Review probe ${probeResult.status}: ${reasons || 'one or more probes exited nonzero'}\n`
      );
      process.exit(probeResult.status === 'failed' ? 3 : 4);
    }
    if (body) {
      const activeGates = DEFAULT_GATES.filter((g) => g.name !== 'verification-commands');
      const result = validateBody(body, { gates: activeGates });
      if (!result.ok) {
        try {
          const ts = new Date().toISOString();
          const { buildRow } = await import('../gh-timing-comment.mjs');
          // Body not yet fetched at this point — fall back to 0/0.
          const row = buildRow({
            ts,
            event: 'gate-refused',
            activeSec: 0,
            idleSec: 0,
            deltaWords: 0,
            // #475 AC1 — carried-forward durable marker (gate-refused, no active session)
            wordMarker: s.lastWordMarker ?? 0,
            description: `→ review: ${result.refusedRules.map((r) => r.rule).join(', ')}`,
          });
          await postTimingEvent({ issueNumber: issueNum, repo: cfg.repo, row, timeoutMs: 3000 });
        } catch {
          /* best-effort: failure must not abort the primary operation */
        }
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing to move ${target} to Review:\n`);
        for (const r of result.refusedRules)
          process.stderr.write(`   BLOCKED: ${r.rule}: ${r.reason}\n`);
        process.stderr.write(
          '\nSee .ai-task-manager/templates/pickup-directive.md Hard Rules.\n\n'
        );
        process.exit(4);
      }
    }
  }

  const durIdx = rest.indexOf('--duration-minutes');
  const wordsIdx = rest.indexOf('--words');
  const parseFlag = (v) => Math.round(Number.parseFloat(String(v).replace(/^#/, '')) || 0);
  const agentDurationMin = durIdx >= 0 ? parseFlag(rest[durIdx + 1]) : null;
  const agentWords = wordsIdx >= 0 ? parseFlag(rest[wordsIdx + 1]) : null;
  const hasAgentTiming = agentDurationMin !== null || agentWords !== null;

  // EPIC #823 timing model v2 (C6 / defect D1): the review verb no longer emits
  // the bare `review` ("starting review") or `review-ready` ("task is now in
  // Review") timing rows. Neither was part of the canonical PHASE_EVENTS pair
  // (`test:passed` + `review:started`, emitted by runMoveState below) — they
  // were pre-v2 scaffolding retained by #516 DEFERRED (and deferred-posted per
  // #463). Word/time accounting is NOT lost by dropping them: the durable word
  // marker (advanced by hook-handler on each agent turn) and the phase-span
  // calculator carry both signals, and the `<phase>:completed` rows report
  // them. The bare rows merely re-displayed the same numbers, double-counting
  // them in the visible log.
  //
  // What we KEEP is the session pause. Review is a non-terminal verb (#407):
  // it closes the active timing session while preserving the binding, so a
  // follow-up verb needs no intervening `start`. `pauseTimingKeepBinding` nulls
  // the entry clock (entryStartTs / wordsAtEntryStart) without flushing a row;
  // the `--duration-minutes` / `--words` agent-session flags are still parsed
  // above but no longer materialize a row. `setTaskStatus(...,'paused')` runs
  // only when there was a live session to pause (agent-timing flags present or
  // the target is the active binding) — matching the pre-C6 branch behavior
  // where the cold/no-session path left fleet status untouched.
  //
  // #408 — no test→test self-move here: by the time `review` runs the issue is
  // already in `test`, so the authoritative test→review move is runMoveState
  // below, not a self-loop the transition matrix would reject as illegal.
  const hadActiveSession = hasAgentTiming || s.active === target;
  saveState(pauseTimingKeepBinding(s, target), statePath);
  if (hadActiveSession) {
    try {
      setTaskStatus(projectDir, target, 'paused');
    } catch {
      /* best-effort: failure must not abort the primary operation */
    }
  }
  console.log(`Review ${target}: task paused.`);
  if (!SKIP_NETWORK) {
    const issueNum = target.replace(/^#/, '');
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const rawBody = JSON.parse(stdout).body ?? '';

    // #267 — Early test→review guard fast-path. Evaluate ONLY the
    // `test-exit-dod-verified` guard here so we refuse missing-sandbox-proof
    // bodies before doing the full AC verification pass below. The full
    // exit-guard set (including pre-close completeness) runs again at the
    // runMoveState boundary below — single source of truth in the registry.
    {
      const dodResult = await runGuardsFn('test', 'review', {
        issueNumber: Number(issueNum),
        repo: cfg.repo,
        body: rawBody,
        cfg,
        fromState: 'test',
        toState: 'review',
      });
      const dodRefusal = (dodResult.refusals || []).find((r) => r.id === 'test-exit-dod-verified');
      if (dodRefusal) {
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing /task review for ${target}:\n`);
        process.stderr.write(
          '   BLOCKED: missing `aitm-dod-verified` marker — run `/task test ' +
            `${target}` +
            '` first.\n\n'
        );
        process.exit(4);
      }
    }

    const lines = rawBody.split('\n');
    // #774 — the authoritative VC list, parsed once, so a by-id `vc-list`
    // citation on an AC marker resolves to its declared command(s) the same way
    // the other read-sites do (ac-evidence/evidence-markers/proof-marker).
    const vcItems = parseVerificationCommands(rawBody);

    let inVerifSection = false;
    let currentSection = '';
    const checkboxes = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) currentSection = headingMatch[1].trim().toLowerCase();
      if (/^#{1,6}\s+Verification Commands/.test(line)) {
        inVerifSection = true;
        continue;
      }
      if (/^#{1,6}\s/.test(line) && inVerifSection) inVerifSection = false;
      const m = line.match(/^- \[([ x])\] (.+)$/);
      if (!m) continue;
      const checked = m[1] === 'x';
      const label = m[2].trim();
      const canRunCommand = inVerifSection || currentSection === 'definition of done';
      // Stop at the first closing backtick (no `$` anchor) so a VC/DoD entry
      // whose command carries a trailing inline `aitm-verified` proof marker —
      // stamped by auto-tick-verified on a green `test` run — still parses.
      // Mirrors the shared parsers hardened in #368 AC9
      // (parseVerificationCommands / parseEvidenceChecklist); review.mjs kept
      // its own un-migrated copy with the anchored `$` that this fixes.
      const cmdMatch = canRunCommand ? label.match(/^`([^`]+)`/) : null;
      // #396/#468 — consolidated declaration is the sole path. When this is a
      // prose-evidence checkbox, read the declared command(s) from the
      // `aitm-verified cmd="..."` form.
      // #481 — `cmd` is the persistent declaration component, read regardless of
      // run-props. The consolidated single-marker form carries declaration AND
      // run-props (`exit`/`sha`/`ts`) in one comment; `ac-stamp`/`dod-stamp`
      // upsert the passing sandbox run there. The pre-#481 `!hasExecutionProof`
      // guard hid the declaration once proof landed, so review rejected the very
      // markers `ac-stamp` produces ("missing automated evidence"). Read the cmd
      // always; when run-props show `exit="0"` the marker itself is the passing
      // sandbox evidence (`proofPassed`), seeded into `commandResults` below.
      let evidenceCommands = [];
      let proofPassed = false;
      if (!cmdMatch) {
        const props = parseProofMarker(label);
        if (props && typeof props.cmd === 'string') {
          evidenceCommands = [...props.cmd.matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1]);
        } else if (props && typeof props['vc-list'] === 'string') {
          // #774 — the canonical by-id citation the Refine-exit guardrail (#773)
          // mandates lives in `vc-list`; resolve it against the VC section so a
          // vc-list-authored AC is not falsely un-ticked as "missing automated
          // evidence" here (this was review.mjs's own un-migrated inline parser).
          try {
            evidenceCommands = resolveVcRefCommands(props['vc-list'], vcItems) || [];
          } catch {
            evidenceCommands = [];
          }
        }
        if (props && hasExecutionProof(label)) {
          proofPassed = String(props.exit) === '0';
        }
      }
      const cleanLabel = label.trim();
      checkboxes.push({
        lineIndex: i,
        checked,
        label: cleanLabel,
        command: cmdMatch ? cmdMatch[1] : null,
        evidenceCommands,
        proofPassed,
        section: currentSection,
      });
    }

    const failures = [];
    const regressions = [];
    const getReviewHeadSha =
      ctx.getReviewHeadSha ||
      (async ({ projectDir: cwd }) => {
        const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
          cwd,
          timeout: 10_000,
        });
        return String(stdout || '').trim();
      });
    const reviewEvidence = await resolveReviewVerificationEvidence({
      body: rawBody,
      issueNumber: Number(issueNum),
      projectDir,
      getHeadSha: getReviewHeadSha,
      buildFingerprint: ctx.buildVerificationFingerprint || buildVerificationFingerprint,
    });
    if (!reviewEvidence.ok) {
      const codes = reviewEvidence.reasons.map(({ code }) => code).join(', ');
      const reason = `verification receipt invalid: ${codes}; Develop finalization and a new Test pass required`;
      const _tsReceipt = nowIso();
      const _dReceipt = deriveStateMoveDelta(rawBody, _tsReceipt);
      await emitSandboxVerificationFailureTimeline({
        target,
        ts: _tsReceipt,
        delta: _dReceipt,
        wordMarker: s.lastWordMarker ?? 0,
        reason,
        deps: { runMoveState, safePostTiming, buildRow },
      });
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing /task review for ${target}:\n`);
      process.stderr.write(`   BLOCKED: ${reason}.\n`);
      process.stderr.write(`   RECOVERY: ${reviewEvidence.remediation}\n\n`);
      process.exit(4);
    }
    const commandResults = reviewEvidence.commandResults;
    const proseCheckboxes = [];
    // #267 — `aitm-dod-verified` presence is now enforced by the
    // `test-exit-dod-verified` guard in `STATES.test.exitGuards`, evaluated
    // by runGuards just before the runMoveState call below. The inline check
    // that used to live here is retired in favor of the registry. The seed
    // loop below trusts that we either passed the registry gate (will pass
    // when reached) or will refuse before runMoveState.
    // #154 — SHA-drift gate. The `aitm-test-started` marker records outer HEAD
    // at the moment Test began; if HEAD has moved since, the sandbox proof is
    // stale and the issue must be re-tested. Tolerates marker absence on
    // legacy issues (the dod-verified marker also encodes a SHA, so a future
    // hardening pass can require both — for now we only block when the
    // test-started marker is present and mismatched).
    const testStarted = parseTestStartedMarker(rawBody);
    if (reviewEvidence.mode === 'legacy-marker' && testStarted) {
      let currentHeadSha = null;
      try {
        const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], {
          cwd: projectDir,
          timeout: 10_000,
        });
        currentHeadSha = String(stdout || '').trim();
      } catch {
        // best-effort — if we can't resolve HEAD, fall back to the existing
        // dod-verified path. SHA-drift refusal is opportunistic, not mandatory.
      }
      if (currentHeadSha) {
        const m = testStarted.sha;
        const matches = currentHeadSha.startsWith(m) || m.startsWith(currentHeadSha);
        if (!matches) {
          process.stderr.write('\n');
          process.stderr.write(`⛔ Refusing /task review for ${target}:\n`);
          process.stderr.write(
            `   BLOCKED: HEAD drifted from \`${m.slice(0, 8)}\` to \`${currentHeadSha.slice(0, 8)}\` during Test — re-run \`/task test ${target}\` to re-verify.\n\n`
          );
          process.exit(4);
        }
      }
    }
    // #1089 — standard command results are seeded only by
    // resolveReviewVerificationEvidence: exact-SHA v1 receipts fail closed;
    // marker-only issues retain the explicitly bounded legacy compatibility path.
    // #481 — a prose-evidence checkbox carrying run-props with `exit="0"` is
    // backed by the sandbox run `ac-stamp`/`dod-stamp` recorded on its single
    // `aitm-verified` marker. Seed its declared commands as passed so the
    // evidence audit recognizes the consolidated single-marker proof instead of
    // demanding a retired sibling `aitm-ac-evidence` marker.
    for (const cb of checkboxes) {
      if (cb.proofPassed) {
        for (const cmd of cb.evidenceCommands) commandResults.set(cmd, true);
      }
    }
    const { CLOSE_OWNED_CHECKBOXES } = await import('../runtime.mjs');
    const unverifiedTickLabels = extractUnverifiedTickLabels(rawBody);
    for (const cb of checkboxes) {
      if (cb.command) {
        // #975 — an honestly-ticked, categorically non-machine-runnable
        // command (the `--allow-unverified-ticks` hatch) must not be
        // re-validated against the sandbox allowlist and demoted as a
        // regression; trust the audited tick the same way #481 trusts a
        // sandbox-stamped proof marker, so AC lines citing this VC as
        // evidence don't cascade into false regressions either.
        if (cb.checked && unverifiedTickLabels.has(stripMarkers(cb.label))) {
          commandResults.set(cb.command, true);
          continue;
        }
        const validation = validateVerificationCommand(cb.command, { projectDir });
        if (!validation.ok) {
          commandResults.set(cb.command, false);
          console.log(`[task-tracker] rejected: ${validation.reason}`);
          if (cb.checked) {
            regressions.push(cb.label);
            lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
          }
          failures.push(`${cb.label} (rejected: ${validation.reason})`);
          continue;
        }
        // #1089 — v1 issues trust a targeted command only when it appears in
        // the exact-SHA Test receipt (or was already seeded by explicit inline
        // execution proof above). Legacy marker-only issues retain the prior
        // bounded compatibility behavior. Review never re-executes the command.
        const passed =
          reviewEvidence.mode === 'legacy-marker' || commandResults.get(cb.command) === true;
        commandResults.set(cb.command, passed);
        if (passed) {
          if (!cb.checked) lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [ ]', '- [x]');
        } else {
          if (cb.checked) {
            regressions.push(cb.label);
            lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
          }
          failures.push(cb.label);
        }
      } else if (
        !CLOSE_OWNED_CHECKBOXES.has(cb.label) &&
        (cb.section === 'acceptance criteria' || cb.section === 'definition of done')
      ) {
        proseCheckboxes.push(cb);
      }
    }

    const issueBodyCheckbox = proseCheckboxes.find(
      (cb) => cb.label === 'Issue body checkboxes ticked'
    );
    const acceptanceCriteriaCheckbox = proseCheckboxes.find(
      (cb) => cb.label === 'Acceptance criteria met'
    );
    const evidenceCheckboxes = proseCheckboxes.filter(
      (cb) => cb.label !== 'Issue body checkboxes ticked' && cb.label !== 'Acceptance criteria met'
    );

    for (const cb of evidenceCheckboxes) {
      // #679 — honor the same honest `<!-- aitm-non-demonstrable -->` opt-out
      // marker that refine-to-plan-gate.mjs and review-preflight.mjs already honor.
      // Without this, a legitimately-tagged, zero-evidence checked box gets
      // flagged as a regression and un-ticked on every `/task review` run,
      // permanently bouncing the issue back to develop.
      if (NON_DEMONSTRABLE_TAG_RE.test(cb.label)) continue;
      // #841 — honor intentionally-waived ACs. An AC bearing an `aitm-ac-waived`
      // marker is neither flagged nor un-ticked: the waiver is an explicit,
      // audited decision that this AC is not gate-verifiable, the same shape the
      // completeness scan and review-preflight honor. Reimplements the legit half
      // of the reverted #840 fresh.
      if (isAcWaived(cb.label)) continue;
      if (cb.evidenceCommands.length === 0) {
        if (cb.checked) {
          regressions.push(cb.label);
          lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
        }
        failures.push(`${cb.label} (missing automated evidence)`);
        continue;
      }
      const missingCommands = cb.evidenceCommands.filter((cmd) => !commandResults.has(cmd));
      if (missingCommands.length > 0) {
        if (cb.checked) {
          regressions.push(cb.label);
          lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
        }
        failures.push(`${cb.label} (unknown evidence command: ${missingCommands.join(', ')})`);
        continue;
      }
      const failedCommands = cb.evidenceCommands.filter((cmd) => commandResults.get(cmd) !== true);
      if (failedCommands.length > 0) {
        if (cb.checked) {
          regressions.push(cb.label);
          lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
        }
        failures.push(`${cb.label} (evidence failed: ${failedCommands.join(', ')})`);
        continue;
      }
      if (!cb.checked) lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [ ]', '- [x]');
    }

    if (acceptanceCriteriaCheckbox) {
      if (failures.length === 0) {
        if (!acceptanceCriteriaCheckbox.checked) {
          lines[acceptanceCriteriaCheckbox.lineIndex] = lines[
            acceptanceCriteriaCheckbox.lineIndex
          ].replace('- [ ]', '- [x]');
        }
      } else {
        if (acceptanceCriteriaCheckbox.checked) {
          regressions.push(acceptanceCriteriaCheckbox.label);
          lines[acceptanceCriteriaCheckbox.lineIndex] = lines[
            acceptanceCriteriaCheckbox.lineIndex
          ].replace('- [x]', '- [ ]');
        }
        failures.push(
          `${acceptanceCriteriaCheckbox.label} (blocked by unchecked/unverified items)`
        );
      }
    }

    if (issueBodyCheckbox) {
      if (failures.length === 0) {
        if (!issueBodyCheckbox.checked) {
          lines[issueBodyCheckbox.lineIndex] = lines[issueBodyCheckbox.lineIndex].replace(
            '- [ ]',
            '- [x]'
          );
        }
      } else {
        if (issueBodyCheckbox.checked) {
          regressions.push(issueBodyCheckbox.label);
          lines[issueBodyCheckbox.lineIndex] = lines[issueBodyCheckbox.lineIndex].replace(
            '- [x]',
            '- [ ]'
          );
        }
        failures.push(`${issueBodyCheckbox.label} (blocked by unchecked/unverified items)`);
      }
    }

    const finalBody = lines.join('\n');
    // #362 — review's tick logic predates the same-line proof-marker invariant.
    // Every tick here is backed by machine evidence (commandResults from
    // sandbox-verified runs or derived `failures.length === 0` gates), so
    // `allowUnverifiedTicks: true` is correct semantically — the evidence
    // lives in commandResults, not yet stamped inline. Migrating review to
    // stamp same-line `aitm-verified-at` markers per tick is a follow-up.
    await mutateBodyFn({
      issueNumber: issueNum,
      repo: cfg.repo,
      mutate: () => finalBody,
      timeout: GH_API_TIMEOUT_MS,
      deps: { pexec },
      allowUnverifiedTicks: true,
    });

    if (failures.length > 0) {
      if (regressions.length > 0) {
        console.error(`[task-tracker] Regressions detected for ${target}:`);
        regressions.forEach((r) => console.error(`   REGRESSION: ${r}`));
      }
      const _tsR1 = nowIso();
      const _dR1 = deriveStateMoveDelta(rawBody, _tsR1);
      // #844 (D6) — emit a V3-legal `test:failed` audit row + `--demote` move
      // via the shared helper (never a bare `develop` ladder slug).
      await emitSandboxVerificationFailureTimeline({
        target,
        ts: _tsR1,
        delta: _dR1,
        wordMarker: s.lastWordMarker ?? 0,
        deps: { runMoveState, safePostTiming, buildRow },
      });
      console.error(`[task-tracker] Review failed for ${target}:`);
      failures.forEach((f) => console.error(`   ${f}`));
      process.exit(3);
    }
    const subNums = await fetchSubIssues(issueNum);
    if (subNums.length > 0) {
      const childStates = await Promise.all(
        subNums.map(async (n) => ({ num: n, state: await getIssueBoardState(n) }))
      );
      const notReview = childStates.filter((c) => c.state !== 'review' && c.state !== 'done');
      if (notReview.length > 0) {
        console.error(
          `[task-tracker] ⛔ Epic ${target} cannot move to Review — ${notReview.length} child issue(s) not in Review:`
        );
        notReview.forEach((c) => console.error(`   #${c.num}: ${c.state ?? 'unknown'}`));
        console.error('Wait for all sub-issues to reach Review, then run `/task review` again.');
        process.exit(3);
      }
    }
    // #257 — completeness gate at test → review. After auto-ticking every
    // command/evidence-backed item above, reuse the EXACT close-gate scanner so
    // an incomplete story cannot enter Review and be presented for
    // review → done approval. `uncheckedPreCloseCheckboxes` already excludes
    // Lifecycle + close-owned items and strips fenced examples, giving exact
    // parity with the close gate (single source of truth across both paths).
    // On any remaining unticked item: refuse, leave the board in Test, emit no
    // `review-approval` prompt.
    // #315 — Auto-stamp the two derived Functional DoD keys (`acs`,
    // `checkboxes`) before the parity scan, mirroring close.mjs. Without this
    // pass, review refuses promotion on stories whose every AC + every
    // non-self checkbox is complete but whose derived keys haven't been
    // stamped yet (close.mjs would stamp them). Best-effort: any failure
    // (network, version conflict) falls through to the scan with the stale
    // body — the worst case is the pre-#315 behavior.
    // #502 — delegate the derive + rescan to `deriveAndRescan`, which ALWAYS
    // re-fetches the live body before the gate (regardless of derive
    // ok/noop/throw) and LOGS any failure instead of swallowing it. Fixes the
    // false `test-to-review-incomplete` refusal caused by scanning the stale
    // pre-derive `rawBody`.
    const { scanBody } = await deriveAndRescan({
      issueNumber: issueNum,
      repo: cfg.repo,
      scanBody: rawBody,
      deps: { pexec, deriveAndStampFunctionalDod: deriveDodFn, nowIso },
    });
    // #267 — Completeness gate (formerly an inline `uncheckedPreCloseCheckboxes`
    // call) now lives in `STATES.test.exitGuards` as the
    // `test-exit-pre-close-completeness` guard. Evaluate the full test→review
    // exit-guard set here against `scanBody` (which reflects the auto-tick +
    // derived-DoD refresh above). Refusal surface preserved bit-for-bit:
    // gate-refused timing row, `⛔ Refusing to move … N incomplete checkbox(es)`,
    // one indented line per offending checkbox, retry hint, exit 4.
    {
      const guardResult = await runGuardsFn('test', 'review', {
        issueNumber: Number(issueNum),
        repo: cfg.repo,
        body: scanBody,
        cfg,
        fromState: 'test',
        toState: 'review',
      });
      const completenessRefusal = (guardResult.refusals || []).find(
        (r) => r.id === 'test-exit-pre-close-completeness'
      );
      if (completenessRefusal) {
        const blockers = completenessRefusal.blockers || [];
        // Recover the original checkbox-label lines from the blocker strings.
        // Guard formats each blocker as: `test-to-review-incomplete: <line> (the close gate …)`.
        const stillUnticked = blockers.map((b) =>
          b
            .replace(/^test-to-review-incomplete:\s*/, '')
            .replace(/\s*\(the close gate enforces the same set\)\s*$/, '')
        );
        const { buildRow: br0 } = await import('../gh-timing-comment.mjs');
        const _tsR0 = nowIso();
        const _dR0 = deriveStateMoveDelta(rawBody, _tsR0);
        await safePostTiming(
          target,
          br0({
            ts: _tsR0,
            event: 'gate-refused',
            activeSec: _dR0.activeSec,
            idleSec: _dR0.idleSec,
            deltaWords: 0,
            // #475 AC1 — carried-forward durable marker (completeness gate refusal, no live session)
            wordMarker: s.lastWordMarker ?? 0,
            description: `→ review blocked: ${stillUnticked.length} unticked checkbox(es)`,
          })
        );
        process.stderr.write('\n');
        process.stderr.write(
          `⛔ Refusing to move ${target} to Review — ${stillUnticked.length} incomplete checkbox(es):\n`
        );
        for (const line of stillUnticked) process.stderr.write(`   ${line}\n`);
        process.stderr.write(
          '\nTick every item above (the close gate enforces the same set), then retry `/task review`.\n\n'
        );
        process.exit(4);
      }
    }
    // #881 — the move to Review runs FIRST, unconditionally. Entering Review is
    // not gated on the agent review: the Agent Review Gate is the ACTION of the
    // Review state, not an exit condition of Test and not an entry condition of
    // Review. Test's own exit guards (completeness, above; dod-verified; sandbox
    // proof) already ran and are the real exit conditions.
    //
    // #406 — the move is authoritative. `runMoveState` returns a structured
    // result; a genuine refusal (`ok:false` and not a benign self-loop) must NOT
    // fall through to the gate. The matrix gate (`validateTransition`) that
    // refused live on #233 is not replicated by the inline guards above, so
    // gating on this result is the only correct check. A re-run while already in
    // Review is a satisfied no-op (#882) and passes here, which is what makes the
    // state action re-runnable in place.
    const reviewMove = await runMoveState(target, 'review', { silent: true });
    if (reviewMove && reviewMove.ok === false && reviewMove.benign !== true) {
      process.stderr.write('\n');
      process.stderr.write(
        `⛔ ${target} verification passed but the move to Review was refused:\n`
      );
      for (const line of String(reviewMove.stderr || '').split('\n')) {
        if (line.trim()) process.stderr.write(`   ${line}\n`);
      }
      process.stderr.write('\n');
      process.exit(reviewMove.status || 4);
    }
    // #809 — Agent Review Gate: the Review state's action, run on arrival. This
    // is the objective, machine-checkable half of review sign-off: a pass ticks
    // the "Agent Review Passed" DoD item and review continues to the human gate;
    // a failure writes a `review:failed` timing row + an `aitm-review-failed`
    // body marker listing every objection and LEAVES THE ISSUE IN REVIEW (#881)
    // with its state action incomplete, to be fixed in place and re-run. With
    // zero validators registered the gate is a vacuous pass.
    {
      // #881 — re-fetch the body HERE, after the move, not before it. `scanBody`
      // was captured upstream of `runMoveState`, which stamps `aitm-entered-review`
      // and writes the `review:started` timing row. Handing the gate that stale
      // copy made `timing-log-sequence` object against every issue: it read the
      // new `review:started` row from the live timing log but no matching
      // `aitm-entered-review` marker in the body, and the failure stamp derived
      // from the same stale copy then threw `MarkerLossError` for dropping that
      // very marker. Fetch body and comments together so both halves of the
      // gate's input come from one post-move snapshot.
      let comments = [];
      let gateBody = scanBody;
      try {
        const { stdout } = await pexec(
          'gh',
          ['issue', 'view', String(issueNum), '--repo', cfg.repo, '--json', 'body,comments'],
          { timeout: GH_API_TIMEOUT_MS }
        );
        const parsed = JSON.parse(stdout || '{}');
        comments = Array.isArray(parsed.comments) ? parsed.comments : [];
        if (typeof parsed.body === 'string' && parsed.body.trim()) gateBody = parsed.body;
      } catch {
        // Best-effort: a fetch failure leaves `comments` empty and `gateBody` on
        // the pre-move `scanBody`. Any validator that requires a comment reports
        // its own failure, so the gate never silently passes on missing evidence.
        comments = [];
      }
      // #940 — the `trunk...HEAD` changed-path set makes the V2 "New Automated
      // Tests" required-comment diff-aware for `docs-only` issues. Best-effort:
      // any failure yields [], which is default-deny at the consumer (an unknown
      // diff keeps the NAT requirement).
      const changedPaths = await computeReviewChangedPaths({
        cfg,
        projectDir,
        deps: { pexec },
      });
      const gate = runAgentReviewGate({
        body: gateBody,
        issueNumber: Number(issueNum),
        repo: cfg.repo,
        comments,
        changedPaths,
      });
      if (!gate.pass) {
        // FAIL — the Review state's action did not complete. The issue STAYS IN
        // REVIEW (#881); the objection is fixed in place and `review <N>` re-run.
        // EPIC #823 timing model v2 (C7 / defect D2) is preserved: the move above
        // already laid down `test:passed` + `review:started`, so the
        // `review:failed` row has its preceding `review:started` and the timeline
        // reads
        //
        //   test:passed → review:started → review:failed
        //
        // with no `demoted:develop` / `develop:started` pair and (by design) no
        // `review:approved`.
        const baseBody = typeof gate.normalizedBody === 'string' ? gate.normalizedBody : gateBody;
        const _tsRF = nowIso();
        const failedBody = stampReviewFailed(baseBody, gate.failures, { ts: _tsRF });
        const _dRF = deriveStateMoveDelta(rawBody, _tsRF);
        await emitReviewGateFailureTimeline({
          target,
          issueNum,
          repo: cfg.repo,
          failures: gate.failures,
          failedBody,
          ts: _tsRF,
          delta: _dRF,
          wordMarker: s.lastWordMarker ?? 0,
          deps: { runMoveState, safePostTiming, mutateBodyFn, pexec },
        });
        process.stderr.write('\n');
        process.stderr.write(
          `⛔ Agent Review Gate failed for ${target} — ${gate.failures.length} objection(s):\n`
        );
        for (const f of gate.failures) process.stderr.write(`   ${f}\n`);
        process.stderr.write(
          `\n${target} stays in Review with its state action incomplete. Fix the objections\nabove in place — Review permits WRITE_ISSUE/WRITE_DOCS, which is the class of\nfix every registered validator asks for — then re-run \`/task review ${target}\`.\n\n`
        );
        process.exit(3);
      }
      // PASS — adopt any normalizer rewrite, clear a stale review-failed marker,
      // and stamp the PROVEN "Agent Review Passed" box: tick it AND append the
      // gate's own run-evidence marker (#841). The box now carries execution
      // proof (ts + validators + result=pass, sha=`sandbox` since the gate runs
      // in-process), so the write goes through as a sanctioned `evidenceStamp`
      // — honest because the gate genuinely ran — WITHOUT the old
      // `allowUnverifiedTicks` bypass. A body with no such line (old template)
      // stamps to a noop and skips the write, which the close gate tolerates.
      const passBase = typeof gate.normalizedBody === 'string' ? gate.normalizedBody : gateBody;
      const tickedBody = stampAgentReviewPassed(clearReviewFailed(passBase), {
        ts: nowIso(),
        validators: gate.validatorsRun,
      });
      if (tickedBody !== gateBody) {
        try {
          await mutateBodyFn({
            issueNumber: issueNum,
            repo: cfg.repo,
            mutate: () => tickedBody,
            timeout: GH_API_TIMEOUT_MS,
            deps: { pexec },
            evidenceStamp: true,
          });
        } catch (e) {
          console.error(`[task-tracker] failed to stamp Agent Review Passed: ${e.message}`);
        }
      }
      // #904 — emit the symmetric `review:passed` timing row, mirroring the fail
      // path's `review:failed`. Emitted UNCONDITIONALLY on pass (outside the
      // stamp `if` above, which is skipped for old-template bodies that tick to a
      // no-op). The Test→Review move already laid down `test:passed` +
      // `review:started` above the gate block, so this row is strictly monotonic
      // after `review:started` and lands before `runLogIssueTime`.
      const _tsRP = nowIso();
      const _dRP = deriveStateMoveDelta(rawBody, _tsRP);
      await emitReviewGatePassTimeline({
        target,
        ts: _tsRP,
        delta: _dRP,
        wordMarker: s.lastWordMarker ?? 0,
        validators: gate.validatorsRun,
        deps: { safePostTiming, buildRow },
      });
    }
    // #881 — the authoritative Test→Review move used to sit HERE, after the
    // Agent Review Gate, which made the gate a precondition of the transition.
    // It has been hoisted above the gate block: entering Review is unconditional
    // and the gate is the Review state's action. The refusal handling moved with
    // it verbatim.
    // EPIC #823 timing model v2 (C6 / defect D1): the bare `review` row (the
    // #463 deferred verb-level "starting review" post) and the `review-ready`
    // state-move row (#516 DEFERRED) are both retired here. runMoveState above
    // emits the canonical `test:passed` + `review:started` pair, which is the
    // complete lifecycle record for the test→review transition; the two ad-hoc
    // rows only re-displayed word/time already carried by those rows and the
    // durable word marker (see the entry-side note above). `buildDeferredReviewRow`
    // remains an exported pure helper for its own unit tests; it is no longer
    // called from the verb path.
    await runLogIssueTime(target);
    console.log(`✓ ${target} moved to Review — all verification passed.`);
    console.log(`PROMPT_REQUIRED: review-approval ${target}`);
  }
}
