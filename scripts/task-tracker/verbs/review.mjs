import { loadState, saveState, pauseTimingKeepBinding } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';
import {
  parseDodVerifiedMarker,
  parseTestStartedMarker,
  stripFencedCodeBlocks,
} from '../lib/markers.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { STANDARD_DOD_COMMANDS } from '../lib/evidence-markers.mjs';
import { parseProofMarker, hasExecutionProof } from '../lib/proof-marker.mjs';
import { unescapeValue } from '../lib/proof-marker.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { resolveVcRefCommands } from '../lib/vc-ref.mjs';
import { stripMarkers } from '../lib/ac-evidence.mjs';
import { buildRow, buildFlushRow, readLastKnownState } from '../gh-timing-comment.mjs';
import { assertVerbHomeState } from '../lib/verb-home-state-guard.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
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
import { reviewEpochId, isGitObjectId, sameGitObjectId } from '../lib/review-authority.mjs';
import { appendReviewAuthorityInvalidation } from '../lib/evidence-invalidation.mjs';
import { latestStageEntry } from '../lib/stage-entry-markers.mjs';
import { withVerbMutationScope } from '../lib/work-lease/verb-mutation-scope.mjs';
import { isGovernedAuthorityError } from '../lib/work-lease/governed-effect.mjs';
import { withIssueLock } from '../issue-mutator-lock.mjs';

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

function parseReviewCheckboxes(body) {
  const lines = String(body || '').split('\n');
  const vcItems = parseVerificationCommands(body);
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
    const cmdMatch = canRunCommand ? label.match(/^`([^`]+)`/) : null;
    let evidenceCommands = [];
    let proofPassed = false;
    if (!cmdMatch) {
      const props = parseProofMarker(label);
      if (props && typeof props.cmd === 'string') {
        evidenceCommands = [...props.cmd.matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1]);
      } else if (props && typeof props['vc-list'] === 'string') {
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
    checkboxes.push({
      lineIndex: i,
      checked,
      label,
      command: cmdMatch ? cmdMatch[1] : null,
      evidenceCommands,
      proofPassed,
      section: currentSection,
    });
  }

  return { lines, checkboxes };
}

// Apply sandbox-established command outcomes to the body snapshot held by the
// versioned writer. The command authority is intentionally captured before the
// write, but every checkbox location, label, proof declaration, and surrounding
// byte is reparsed from `body` so a concurrent UI edit cannot be overwritten by
// an earlier serialization.
export function normalizeReviewVerificationCheckboxes({
  body,
  commandResults,
  commandFailureReasons = new Map(),
  closeOwnedCheckboxes = new Set(),
} = {}) {
  const { lines, checkboxes } = parseReviewCheckboxes(body);
  const freshCommandResults = new Map(commandResults || []);
  const failures = [];
  const regressions = [];
  const proseCheckboxes = [];

  for (const cb of checkboxes) {
    if (cb.proofPassed) {
      for (const cmd of cb.evidenceCommands) freshCommandResults.set(cmd, true);
    }
  }

  const unverifiedTickLabels = extractUnverifiedTickLabels(body);
  for (const cb of checkboxes) {
    if (cb.command) {
      if (cb.checked && unverifiedTickLabels.has(stripMarkers(cb.label))) {
        freshCommandResults.set(cb.command, true);
      }
      const known = freshCommandResults.has(cb.command);
      const passed = freshCommandResults.get(cb.command) === true;
      if (passed) {
        if (!cb.checked) lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [ ]', '- [x]');
      } else {
        if (cb.checked) {
          regressions.push(cb.label);
          lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
        }
        const reason = commandFailureReasons.get(cb.command);
        failures.push(
          reason
            ? `${cb.label} (rejected: ${reason})`
            : known
              ? cb.label
              : `${cb.label} (unknown evidence command: ${cb.command})`
        );
      }
    } else if (
      !closeOwnedCheckboxes.has(cb.label) &&
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
    if (NON_DEMONSTRABLE_TAG_RE.test(cb.label)) continue;
    if (isAcWaived(cb.label)) continue;
    if (cb.evidenceCommands.length === 0) {
      if (cb.checked) {
        regressions.push(cb.label);
        lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
      }
      failures.push(`${cb.label} (missing automated evidence)`);
      continue;
    }
    const missingCommands = cb.evidenceCommands.filter((cmd) => !freshCommandResults.has(cmd));
    if (missingCommands.length > 0) {
      if (cb.checked) {
        regressions.push(cb.label);
        lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
      }
      failures.push(`${cb.label} (unknown evidence command: ${missingCommands.join(', ')})`);
      continue;
    }
    const failedCommands = cb.evidenceCommands.filter(
      (cmd) => freshCommandResults.get(cmd) !== true
    );
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

  for (const derivedCheckbox of [acceptanceCriteriaCheckbox, issueBodyCheckbox]) {
    if (!derivedCheckbox) continue;
    if (failures.length === 0) {
      if (!derivedCheckbox.checked) {
        lines[derivedCheckbox.lineIndex] = lines[derivedCheckbox.lineIndex].replace(
          '- [ ]',
          '- [x]'
        );
      }
    } else {
      if (derivedCheckbox.checked) {
        regressions.push(derivedCheckbox.label);
        lines[derivedCheckbox.lineIndex] = lines[derivedCheckbox.lineIndex].replace(
          '- [x]',
          '- [ ]'
        );
      }
      failures.push(`${derivedCheckbox.label} (blocked by unchecked/unverified items)`);
    }
  }

  return { body: lines.join('\n'), failures, regressions };
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

// Keep the durable invalidation before the visible failure block. The reducer
// intentionally treats an active failure block as stale, so this ordering is
// part of the write contract rather than presentation detail.
export function buildReviewFailureBody(body, failures, ts) {
  return stampReviewFailed(
    appendReviewAuthorityInvalidation(body, { ts, reason: 'review-failed' }).body,
    failures,
    { ts }
  );
}

// Review accepts only the revision that the Test sandbox selected and then
// persisted as green DoD evidence. This deliberately never reads ambient HEAD:
// authority is the pair of durable Test markers, not the current checkout.
export function validatePersistedTestEvidence(body) {
  const authorityBody = stripFencedCodeBlocks(body);
  const testStarted = parseTestStartedMarker(authorityBody);
  const dodVerified = parseDodVerifiedMarker(authorityBody);
  if (!testStarted?.sha || !dodVerified?.sha) {
    return { ok: false, reason: 'test-evidence-missing' };
  }
  // Reject arbitrary shared prefixes before comparing full and abbreviated IDs.
  if (!isGitObjectId(testStarted.sha) || !isGitObjectId(dodVerified.sha)) {
    return { ok: false, reason: 'test-evidence-sha-invalid' };
  }
  if (!sameGitObjectId(testStarted.sha, dodVerified.sha)) {
    return { ok: false, reason: 'test-evidence-sha-mismatch' };
  }
  return { ok: true, sha: dodVerified.sha };
}

// Bind the final Agent Review write to the body snapshot that will actually be
// mutated. A preflight snapshot can become stale while Review fetches comments
// and validator context, so this is deliberately called immediately before the
// passing stamp rather than reusing any earlier validation result.
export function prepareAgentReviewPassStamp({ body, ts, validators = [] } = {}) {
  const authorityBody = stripFencedCodeBlocks(body);
  const evidence = validatePersistedTestEvidence(authorityBody);
  if (!evidence.ok) return { ...evidence, status: 'review-failed' };
  const reviewEntry = latestStageEntry(authorityBody, 'review');
  if (!reviewEntry?.ts) {
    return { ok: false, reason: 'review-epoch-missing', status: 'review-failed' };
  }
  const epoch = reviewEpochId({ visit: reviewEntry.visit, enteredReviewAt: reviewEntry.ts });
  return {
    ok: true,
    status: 'review-passed',
    epoch,
    verifiedSha: evidence.sha,
    body: stampAgentReviewPassed(clearReviewFailed(body), {
      epoch,
      verifiedSha: evidence.sha,
      ts,
      validators,
    }),
  };
}

// A passing proof binds Review to the exact remote body that supplied its Test
// evidence. `versionedWriteBody` normally rebases a serialized edit after a
// verify race, but that would preserve a proof prepared against a stale body.
// Fail closed instead: the next review invocation prepares a new proof from a
// new gate snapshot and performs a fresh one-shot write.
export const PROOF_STAMP_MAX_RETRIES = 1;

// `mutateIssueBody` supplies the fresh locked base only at write time. Keep the
// gate, authority read, and serialization inside that callback so a body change
// after the gate snapshot cannot be turned into a stale passing proof.
export function makeAgentReviewPassMutator({
  ts,
  issueNumber,
  repo,
  comments = [],
  changedPaths = [],
  runGate = runAgentReviewGate,
  onPrepared = () => {},
} = {}) {
  return (base) => {
    const freshGate = runGate({ body: base, issueNumber, repo, comments, changedPaths });
    if (!freshGate.pass) {
      const prepared = {
        ok: false,
        reason: 'agent-review-gate-failed',
        status: 'review-failed',
        failures: Array.isArray(freshGate.failures) ? freshGate.failures : [],
        validators: Array.isArray(freshGate.validatorsRun) ? freshGate.validatorsRun : [],
      };
      onPrepared(prepared, base);
      return base;
    }
    const validators = Array.isArray(freshGate.validatorsRun) ? freshGate.validatorsRun : [];
    const authority = prepareAgentReviewPassStamp({
      body: freshGate.normalizedBody ?? base,
      ts,
      validators,
    });
    const prepared = authority.ok ? { ...authority, failures: [], validators } : authority;
    onPrepared(prepared, base);
    return prepared.ok ? prepared.body : base;
  };
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
  buildFailedBody = () => failedBody,
  prepareFailedBody,
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
  let prepared = {
    body: failedBody,
    failures: Array.isArray(failures) ? failures : [],
  };
  // (1) stamp the aitm-review-failed marker.
  try {
    await mutateBodyFn({
      issueNumber: issueNum,
      repo,
      mutate: (base) => {
        prepared = prepareFailedBody
          ? prepareFailedBody(base)
          : { body: buildFailedBody(base), failures: prepared.failures };
        return prepared.body;
      },
      timeout: ghApiTimeoutMs,
      deps: { pexec },
      allowUnverifiedTicks: true,
    });
  } catch (e) {
    logError(`[task-tracker] failed to stamp aitm-review-failed: ${e.message}`);
    throw e;
  }
  if (prepared.failures.length === 0) return { status: 'superseded', failures: [] };

  const objectionSummary = `agent review failed — ${prepared.failures.length} objection(s)`;
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
  return { status: 'failed', failures: prepared.failures };
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
  deps,
}) {
  const { runMoveState, safePostTiming, buildRow: buildRowFn = buildRow } = deps;
  const reason = 'sandbox verification failed';
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

export function finalizeReviewMutationOutcome(mutationOutcome, { exit = process.exit } = {}) {
  if (mutationOutcome?.exitCode != null) exit(mutationOutcome.exitCode);
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
  const lockIssue = ctx.withIssueLock || withIssueLock;
  const s = loadState(statePath);
  const target =
    rest.find((a) => /^#\d+$/.test(a)) || (s.active && s.active !== 'discover' ? s.active : null);
  if (!target) {
    console.error('Usage: /task review #N');
    process.exit(1);
  }
  // Queue replay has its own durable transition-receipt authority. It stays
  // outside review's verb-scoped lease and is deferred until the first
  // governed review mutation (including a durable body-gate refusal audit).
  let initialBodyGateRefusal = null;

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
      process.stderr.write(`⛔ Refusing to move ${target} to Test:\n`);
      for (const reason of preflight.reasons) {
        process.stderr.write(`   BLOCKED: ${reason}\n`);
      }
      process.stderr.write('\nRun `/task commit-trace ');
      process.stderr.write(`${target}` + '` after committing, then retry `/task review`.\n\n');
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
    assertVerbHomeState({
      verb: 'review',
      currentState: readLastKnownState(body).state,
      issueNumber: issueNum,
    });
    if (body) {
      const activeGates = DEFAULT_GATES.filter((g) => g.name !== 'verification-commands');
      const result = validateBody(body, { gates: activeGates });
      if (!result.ok) initialBodyGateRefusal = result;
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
  // Offline review is a read-only probe. It must not pause local state or open
  // lease authority when no remote review transition can run.
  if (SKIP_NETWORK) return;
  {
    const issueNum = target.replace(/^#/, '');
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const rawBody = JSON.parse(stdout).body ?? '';

    // Body shape is review's first issue-content gate. Preserve its historical
    // refusal precedence over DoD/SHA and epic-readiness checks while keeping
    // its one durable refusal audit inside exact review authority.
    if (initialBodyGateRefusal) {
      await drainQueueIfAny();
      await lockIssue({ issue: issueNum, verb: 'review', projDir: projectDir }, () =>
        withVerbMutationScope(
          {
            issueId: issueNum,
            operation: 'review-mutation',
            withGovernedEffect: ctx.withGovernedEffect,
            heartbeat: true,
          },
          async (scope) => {
            const ts = nowIso();
            const row = buildRow({
              ts,
              event: 'gate-refused',
              activeSec: 0,
              idleSec: 0,
              deltaWords: 0,
              wordMarker: s.lastWordMarker ?? 0,
              description: `→ test: ${initialBodyGateRefusal.refusedRules
                .map((r) => r.rule)
                .join(', ')}`,
            });
            await safePostTiming(target, row, {
              operation: 'review-mutation',
              withGovernedEffect: scope.continue,
            });
          }
        )
      );
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing to move ${target} to Test:\n`);
      for (const r of initialBodyGateRefusal.refusedRules)
        process.stderr.write(`   BLOCKED: ${r.rule}: ${r.reason}\n`);
      process.stderr.write('\nSee .ai-task-manager/templates/pickup-directive.md Hard Rules.\n\n');
      process.exit(4);
    }

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

    // #774 — the authoritative VC list, parsed once, so a by-id `vc-list`
    // citation on an AC marker resolves to its declared command(s) the same way
    // the other read-sites do (ac-evidence/evidence-markers/proof-marker).
    const { checkboxes } = parseReviewCheckboxes(rawBody);
    const commandResults = new Map();
    const commandFailureReasons = new Map();
    // #267 — `aitm-dod-verified` presence is now enforced by the
    // `test-exit-dod-verified` guard in `STATES.test.exitGuards`, evaluated
    // by runGuards just before the runMoveState call below. The inline check
    // that used to live here is retired in favor of the registry. The seed
    // loop below trusts that we either passed the registry gate (will pass
    // when reached) or will refuse before runMoveState.
    const persistedTestEvidence = validatePersistedTestEvidence(rawBody);
    if (!persistedTestEvidence.ok) {
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing /task review for ${target}:\n`);
      process.stderr.write(
        `   BLOCKED: persisted Test evidence is ${persistedTestEvidence.reason === 'test-evidence-missing' ? 'missing' : 'for different revisions'} — re-run \`/task test ${target}\` to re-verify.\n\n`
      );
      process.exit(4);
    }
    // #226 — under sandbox-verified authority, the standard DoD commands
    // (`npm test`, `npm run lint`, `npm run format:check`) are trusted-passed.
    // Seed commandResults so AC lines whose `aitm-verified cmd="..."` declaration
    // references these commands resolve as passed evidence instead of
    // false-positive `unknown evidence command` regressions.
    for (const cmd of STANDARD_DOD_COMMANDS) {
      commandResults.set(cmd, true);
    }
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
      if (!cb.command) continue;
      // #975 — an honestly-ticked, categorically non-machine-runnable command
      // remains trusted through its durable audit marker.
      if (cb.checked && unverifiedTickLabels.has(stripMarkers(cb.label))) {
        commandResults.set(cb.command, true);
        continue;
      }
      const validation = validateVerificationCommand(cb.command, { projectDir });
      if (!validation.ok) {
        commandResults.set(cb.command, false);
        commandFailureReasons.set(cb.command, validation.reason);
        console.log(`[task-tracker] rejected: ${validation.reason}`);
        continue;
      }
      // #137 — trust the sandbox-verified marker; do not re-execute.
      commandResults.set(cb.command, true);
    }

    // Epic child readiness is a genuine read-only refusal. Resolve it before
    // pausing the session or opening review mutation authority.
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

    await drainQueueIfAny();
    const govern = ctx.withGovernedEffect;
    const mutationOutcome = await lockIssue(
      { issue: issueNum, verb: 'review', projDir: projectDir },
      () =>
        withVerbMutationScope(
          {
            issueId: issueNum,
            operation: 'review-mutation',
            withGovernedEffect: govern,
            heartbeat: true,
          },
          async (scope) => {
            // Per-invocation capabilities preserve the one outer review authority
            // boundary. Nested writers must request this exact issue+operation;
            // direct local effects reverify immediately before their write.
            const scopedMutateBody = (options) =>
              mutateBodyFn({
                ...options,
                operation: 'review-mutation',
                deps: {
                  ...(options.deps || {}),
                  withGovernedEffect: scope.continue,
                },
              });
            const scopedSafePostTiming = (issue, row) =>
              safePostTiming(issue, row, {
                operation: 'review-mutation',
                withGovernedEffect: scope.continue,
              });
            const scopedRunMoveState = (issue, state, options = {}) =>
              runMoveState(issue, state, {
                ...options,
                governedOperation: 'review-mutation',
                withGovernedEffect: scope.continue,
              });

            const hadActiveSession = hasAgentTiming || s.active === target;
            await scope.effect(() => saveState(pauseTimingKeepBinding(s, target), statePath));
            if (hadActiveSession) {
              try {
                await scope.effect(() => setTaskStatus(projectDir, target, 'paused'));
              } catch (error) {
                if (isGovernedAuthorityError(error)) throw error;
                /* best-effort: failure must not abort the primary operation */
              }
            }
            console.log(`Review ${target}: task paused.`);

            // #362 — review's tick logic predates the same-line proof-marker invariant.
            // Every tick here is backed by machine evidence (commandResults from
            // sandbox-verified runs or derived `failures.length === 0` gates), so
            // `allowUnverifiedTicks: true` is correct semantically — the evidence
            // lives in commandResults, not yet stamped inline. Migrating review to
            // stamp same-line `aitm-verified-at` markers per tick is a follow-up.
            let normalization = { failures: [], regressions: [] };
            await scopedMutateBody({
              issueNumber: issueNum,
              repo: cfg.repo,
              mutate: (freshBase) => {
                normalization = normalizeReviewVerificationCheckboxes({
                  body: freshBase,
                  commandResults,
                  commandFailureReasons,
                  closeOwnedCheckboxes: CLOSE_OWNED_CHECKBOXES,
                });
                return normalization.body;
              },
              timeout: GH_API_TIMEOUT_MS,
              deps: { pexec },
              allowUnverifiedTicks: true,
            });
            const { failures, regressions } = normalization;

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
                deps: {
                  runMoveState: scopedRunMoveState,
                  safePostTiming: scopedSafePostTiming,
                  buildRow,
                },
              });
              console.error(`[task-tracker] Review failed for ${target}:`);
              failures.forEach((f) => console.error(`   ${f}`));
              return { exitCode: 3 };
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
              deps: {
                pexec,
                deriveAndStampFunctionalDod: deriveDodFn,
                nowIso,
                operation: 'review-mutation',
                withGovernedEffect: scope.continue,
              },
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
                await scopedSafePostTiming(
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
                return { exitCode: 4 };
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
            const reviewMove = await scopedRunMoveState(target, 'review', { silent: true });
            if (reviewMove && reviewMove.ok === false && reviewMove.benign !== true) {
              process.stderr.write('\n');
              process.stderr.write(
                `⛔ ${target} verification passed but the move to Review was refused:\n`
              );
              for (const line of String(reviewMove.stderr || '').split('\n')) {
                if (line.trim()) process.stderr.write(`   ${line}\n`);
              }
              process.stderr.write('\n');
              return { exitCode: reviewMove.status || 4 };
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
                  [
                    'issue',
                    'view',
                    String(issueNum),
                    '--repo',
                    cfg.repo,
                    '--json',
                    'body,comments',
                  ],
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
              let failures = gate.pass ? null : gate.failures;
              let passedValidators = gate.validatorsRun;

              if (gate.pass) {
                let finalPassStamp = null;
                let passWriteResult = null;
                let passWriteError = null;
                try {
                  passWriteResult = await scopedMutateBody({
                    issueNumber: issueNum,
                    repo: cfg.repo,
                    mutate: makeAgentReviewPassMutator({
                      ts: nowIso(),
                      issueNumber: Number(issueNum),
                      repo: cfg.repo,
                      comments,
                      changedPaths,
                      onPrepared: (prepared) => {
                        finalPassStamp = prepared;
                      },
                    }),
                    timeout: GH_API_TIMEOUT_MS,
                    deps: { pexec },
                    evidenceStamp: true,
                    maxRetries: PROOF_STAMP_MAX_RETRIES,
                  });
                } catch (e) {
                  if (isGovernedAuthorityError(e)) throw e;
                  passWriteError = e;
                  console.error(`[task-tracker] failed to stamp Agent Review Passed: ${e.message}`);
                }
                if (!finalPassStamp?.ok || passWriteError || passWriteResult?.status !== 'ok') {
                  failures =
                    finalPassStamp?.failures?.length > 0
                      ? finalPassStamp.failures
                      : [
                          `persisted-test-evidence: ${
                            finalPassStamp?.reason ||
                            (passWriteError
                              ? 'pass-stamp-write-failed'
                              : 'pass-stamp-not-persisted')
                          }`,
                        ];
                } else {
                  passedValidators = finalPassStamp.validators;
                }
              }

              if (failures) {
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
                const _tsRF = nowIso();
                const _dRF = deriveStateMoveDelta(rawBody, _tsRF);
                const failureResult = await emitReviewGateFailureTimeline({
                  target,
                  issueNum,
                  repo: cfg.repo,
                  failures,
                  prepareFailedBody: (freshBase) => {
                    // Preserve the Agent Review normalizer without replaying a stale
                    // snapshot over concurrent edits. Validators are pure, so rerun on
                    // the writer's base and adopt its verdict, objections, and
                    // normalized output as one authoritative result.
                    const freshGate = runAgentReviewGate({
                      body: freshBase,
                      issueNumber: Number(issueNum),
                      repo: cfg.repo,
                      comments,
                      changedPaths,
                    });
                    if (freshGate.pass) return { body: freshBase, failures: [] };
                    return {
                      body: buildReviewFailureBody(
                        freshGate.normalizedBody ?? freshBase,
                        freshGate.failures,
                        _tsRF
                      ),
                      failures: freshGate.failures,
                    };
                  },
                  ts: _tsRF,
                  delta: _dRF,
                  wordMarker: s.lastWordMarker ?? 0,
                  deps: {
                    runMoveState: scopedRunMoveState,
                    safePostTiming: scopedSafePostTiming,
                    mutateBodyFn: scopedMutateBody,
                    pexec,
                  },
                });
                if (failureResult.status === 'superseded') {
                  process.stderr.write(
                    `\n⚠️ ${target} body changed while persisting Review failure; the fresh gate passed. Re-run \`/task review ${target}\` to record the passing result.\n\n`
                  );
                  return { exitCode: 3 };
                }
                failures = failureResult.failures;
                process.stderr.write('\n');
                process.stderr.write(
                  `⛔ Agent Review Gate failed for ${target} — ${failures.length} objection(s):\n`
                );
                for (const f of failures) process.stderr.write(`   ${f}\n`);
                process.stderr.write(
                  `\n${target} stays in Review with its state action incomplete. Fix the objections\nabove in place — Review permits WRITE_ISSUE/WRITE_DOCS, which is the class of\nfix every registered validator asks for — then re-run \`/task review ${target}\`.\n\n`
                );
                return { exitCode: 3 };
              }
              // PASS — adopt any normalizer rewrite, clear a stale review-failed marker,
              // and stamp the PROVEN "Agent Review Passed" box: tick it AND append the
              // gate's own run-evidence marker (#841), plus an epoch-bound authority
              // proof tied to the revision persisted by Test. The box carries execution
              // proof, so the write goes through as a sanctioned `evidenceStamp`
              // — honest because the gate genuinely ran — WITHOUT the old
              // `allowUnverifiedTicks` bypass. A body with no such line (old template)
              // stamps to a noop and skips the write, which the close gate tolerates.
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
                validators: passedValidators,
                deps: { safePostTiming: scopedSafePostTiming, buildRow },
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
            await runLogIssueTime(target, {
              operation: 'review-mutation',
              withGovernedEffect: scope.continue,
            });
            console.log(`✓ ${target} moved to Review — all verification passed.`);
            console.log(`PROMPT_REQUIRED: review-approval ${target}`);
            return { exitCode: null };
          }
        )
    );
    finalizeReviewMutationOutcome(mutationOutcome);
    return;
  }
}
