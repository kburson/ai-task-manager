import { loadState, saveState, pauseTimingKeepBinding } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';
import { parseTestStartedMarker } from '../lib/markers.mjs';
import { runGuards } from '../lib/guard-registry.mjs';
import '../lib/guard-bootstrap.mjs';
import { STANDARD_DOD_COMMANDS } from '../lib/evidence-markers.mjs';
import { parseProofMarker, hasExecutionProof } from '../lib/proof-marker.mjs';
import { postTimingEvent } from '../gh-timing-comment.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { deriveAndStampFunctionalDod } from '../lib/functional-dod-derive.mjs';

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
    flushActiveToGH,
    runMoveState,
    runLogIssueTime,
    fetchSubIssues,
    getIssueBoardState,
    nowIso,
  } = ctx;
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
    const { runReviewPreflight } = await import('../lib/review-preflight.mjs');
    const preflight = await runReviewPreflight({
      issueNumber: issueNum,
      repo: cfg.repo,
      projectDir,
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
    } catch {}
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
            // wordMarker:0 audit row — gate-refused, no active session
            wordMarker: 0,
            description: `→ test: ${result.refusedRules.map((r) => r.rule).join(', ')}`,
          });
          await postTimingEvent({ issueNumber: issueNum, repo: cfg.repo, row, timeoutMs: 3000 });
        } catch {}
        process.stderr.write('\n');
        process.stderr.write(`⛔ Refusing to move ${target} to Test:\n`);
        for (const r of result.refusedRules)
          process.stderr.write(`   BLOCKED: ${r.rule}: ${r.reason}\n`);
        process.stderr.write('\nSee .ai-task-manager/pickup-directive.md Hard Rules.\n\n');
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

  if (hasAgentTiming) {
    const ts = nowIso();
    const activeMin = agentDurationMin ?? 0;
    const deltaWords = agentWords ?? 0;
    const { buildRow } = await import('../gh-timing-comment.mjs');
    const row = buildRow({
      ts,
      event: 'review',
      activeSec: activeMin * 60,
      idleSec: 0,
      deltaWords,
      wordMarker: s.wordsAtEntryStart + deltaWords,
      description: 'agent session — starting review',
    });
    await safePostTiming(target, row);
    // #407 — preserve the binding across review (a non-terminal verb). Only
    // the timing session closes; the issue stays bound so a follow-up verb
    // needs no intervening re-`start`. `pause` is the sole verb that nulls
    // `active`.
    saveState(pauseTimingKeepBinding(s, target), statePath);
    try {
      setTaskStatus(projectDir, target, 'paused');
    } catch {}
    await runMoveState(target, 'test', { silent: true });
  } else if (s.active === target) {
    await flushActiveToGH(s, 'review', 'starting review');
    // #407 — preserve binding (see note above).
    saveState(pauseTimingKeepBinding(s, target), statePath);
    try {
      setTaskStatus(projectDir, target, 'paused');
    } catch {}
    await runMoveState(target, 'test', { silent: true });
  } else {
    const ts = nowIso();
    const { buildRow } = await import('../gh-timing-comment.mjs');
    // Body not loaded in this branch; honest 0/0.
    const row = buildRow({
      ts,
      event: 'review',
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      // wordMarker:0 ok — no active session for this target on review entry
      wordMarker: 0,
      description: 'starting review',
    });
    await safePostTiming(target, row);
    await runMoveState(target, 'test', { silent: true });
    // #407 — preserve binding (see note above).
    saveState(pauseTimingKeepBinding(s, target), statePath);
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
      const dodResult = await runGuards('test', 'review', {
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

    let inVerifSection = false;
    let currentSection = '';
    const checkboxes = [];
    const evidencePattern = /<!--\s*aitm-verified-by:\s*([\s\S]*?)\s*-->/;
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
      const evidenceMatch = !cmdMatch ? label.match(evidencePattern) : null;
      let evidenceCommands = evidenceMatch
        ? [...evidenceMatch[1].matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1])
        : [];
      // #396 — consolidated-declaration fallback. The #367/#368/#369/#382
      // corpus migration rewrote AC verifier declarations from the legacy
      // `aitm-verified-by:` marker to the consolidated `aitm-verified cmd="..."`
      // form. #395 taught the shared reader (lib/evidence-markers.mjs
      // `evidenceCommands`) the fallback, but review.mjs's private parser kept
      // its un-migrated copy (see #368 AC9 note above) and therefore yielded an
      // empty command list for migrated ACs — false-bouncing them at line ~343.
      // Mirror the shared reader exactly: when this is a prose-evidence checkbox
      // with no legacy marker AND no execution proof on the line, read the
      // declared command(s) from the consolidated declaration. Legacy-first
      // ordering avoids double-counting a dual-marker line; the
      // `hasExecutionProof` guard keeps a record-of-run proof stamp
      // (ts/sha/evidence) from being misread as a re-gating verifier declaration.
      if (!cmdMatch && !evidenceCommands.length && !hasExecutionProof(label)) {
        const props = parseProofMarker(label);
        if (props && typeof props.cmd === 'string') {
          evidenceCommands = [...props.cmd.matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1]);
        }
      }
      const cleanLabel = label.replace(evidencePattern, '').trim();
      checkboxes.push({
        lineIndex: i,
        checked,
        label: cleanLabel,
        command: cmdMatch ? cmdMatch[1] : null,
        evidenceCommands,
        section: currentSection,
      });
    }

    const failures = [];
    const regressions = [];
    const commandResults = new Map();
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
    if (testStarted) {
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
    // #226 — under sandbox-verified authority, the standard DoD commands
    // (`npm test`, `npm run lint`, `npm run format:check`) are trusted-passed.
    // Seed commandResults so AC lines whose `aitm-verified-by` annotation
    // references these commands resolve as passed evidence instead of
    // false-positive `unknown evidence command` regressions.
    for (const cmd of STANDARD_DOD_COMMANDS) {
      commandResults.set(cmd, true);
    }
    const { CLOSE_OWNED_CHECKBOXES } = await import('../runtime.mjs');
    for (const cb of checkboxes) {
      if (cb.command) {
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
        // #137 — trust the sandbox-verified marker; do not re-execute.
        const passed = true;
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
    await mutateIssueBody({
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
      const { buildRow: br } = await import('../gh-timing-comment.mjs');
      const _tsR1 = nowIso();
      const _dR1 = deriveStateMoveDelta(rawBody, _tsR1);
      await safePostTiming(
        target,
        br({
          ts: _tsR1,
          event: 'develop',
          activeSec: _dR1.activeSec,
          idleSec: _dR1.idleSec,
          deltaWords: 0,
          // wordMarker:0 audit row — verification-failed revert, no live session
          wordMarker: 0,
          description: 'verification failed — reverted to Develop',
        })
      );
      await runMoveState(target, 'develop');
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
    let scanBody = rawBody;
    try {
      const { stdout: _shaOut } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {
        timeout: 5000,
      });
      const derivedHeadSha = (_shaOut || '').trim() || 'unknown';
      const derivedResult = await deriveAndStampFunctionalDod({
        issueNumber: issueNum,
        repo: cfg.repo,
        sha: derivedHeadSha,
        ts: nowIso(),
        deps: { pexec },
      });
      if (derivedResult && derivedResult.status === 'ok') {
        const { stdout: refreshedStdout } = await pexec(
          'gh',
          ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
          { timeout: GH_API_TIMEOUT_MS }
        );
        scanBody = String(refreshedStdout || scanBody);
      }
    } catch {
      // best-effort — fall through to scan with the pre-derive body
    }
    // #267 — Completeness gate (formerly an inline `uncheckedPreCloseCheckboxes`
    // call) now lives in `STATES.test.exitGuards` as the
    // `test-exit-pre-close-completeness` guard. Evaluate the full test→review
    // exit-guard set here against `scanBody` (which reflects the auto-tick +
    // derived-DoD refresh above). Refusal surface preserved bit-for-bit:
    // gate-refused timing row, `⛔ Refusing to move … N incomplete checkbox(es)`,
    // one indented line per offending checkbox, retry hint, exit 4.
    {
      const guardResult = await runGuards('test', 'review', {
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
            // wordMarker:0 audit row — completeness gate refusal, no live session
            wordMarker: 0,
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
    // #406 — the move is authoritative. `runMoveState` returns a structured
    // result; a genuine refusal (`ok:false` and not the benign done→done
    // self-loop) must NOT print the success banner. The matrix gate
    // (`validateTransition`) that refused live on #233 is not replicated by the
    // inline guards above, so gating on this result is the only correct fix.
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
    const reviewTs = nowIso();
    const { buildRow: br2 } = await import('../gh-timing-comment.mjs');
    const _dR2 = deriveStateMoveDelta(rawBody, reviewTs);
    const reviewRow = br2({
      ts: reviewTs,
      event: 'review-ready',
      activeSec: _dR2.activeSec,
      idleSec: _dR2.idleSec,
      deltaWords: 0,
      // wordMarker:0 audit row — post-move state event, no active session
      wordMarker: 0,
      description: 'task is now in Review',
    });
    await safePostTiming(target, reviewRow);
    await runLogIssueTime(target);
    console.log(`✓ ${target} moved to Review — all verification passed.`);
    console.log(`PROMPT_REQUIRED: review-approval ${target}`);
  }
}
