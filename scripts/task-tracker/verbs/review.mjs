import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { projectTmpDir } from '../paths.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';
import { hasDodVerifiedMarker, parseTestStartedMarker } from '../lib/markers.mjs';
import { postTimingEvent } from '../gh-timing-comment.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { deriveStateMoveDelta } from '../lib/timing-rows.mjs';

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
      process.stderr.write(`⛔ Refusing to move ${target} to Validate:\n`);
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
        if (process.env.TASK_TRACKER_FORCE_DONE === '1') {
          process.stderr.write(
            `⚠ TASK_TRACKER_FORCE_DONE=1 — bypassing review gate for ${target}\n`
          );
          for (const r of result.refusedRules)
            process.stderr.write(`   • ${r.rule}: ${r.reason}\n`);
          try {
            await pexec(
              'gh',
              [
                'issue',
                'comment',
                issueNum,
                '-R',
                cfg.repo,
                '--body',
                `⚠ **review gate bypassed** via \`TASK_TRACKER_FORCE_DONE=1\` at ${new Date().toISOString()}. Unverified: ${result.refusedRules.map((r) => r.rule).join(', ')}.`,
              ],
              { timeout: GH_API_TIMEOUT_MS }
            );
          } catch {}
        } else {
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
              description: `→ validate: ${result.refusedRules.map((r) => r.rule).join(', ')}`,
            });
            await postTimingEvent({ issueNumber: issueNum, repo: cfg.repo, row, timeoutMs: 3000 });
          } catch {}
          process.stderr.write('\n');
          process.stderr.write(`⛔ Refusing to move ${target} to Validate:\n`);
          for (const r of result.refusedRules)
            process.stderr.write(`   BLOCKED: ${r.rule}: ${r.reason}\n`);
          process.stderr.write('\nSee .ai-task-manager/pickup-directive.md Hard Rules.\n\n');
          process.exit(4);
        }
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
      activeMin,
      idleMin: 0,
      deltaWords,
      wordMarker: s.wordsAtEntryStart + deltaWords,
      description: 'agent session — starting review',
    });
    await safePostTiming(target, row);
    saveState(
      { ...s, active: null, entryStartTs: null, wordsAtEntryStart: 0, lastActive: target },
      statePath
    );
    try {
      setTaskStatus(projectDir, target, 'paused');
    } catch {}
    await runMoveState(target, 'test', { silent: true });
  } else if (s.active === target) {
    await flushActiveToGH(s, 'review', 'starting review');
    saveState(
      {
        ...s,
        active: null,
        entryStartTs: null,
        wordsAtEntryStart: 0,
        lastActive: target,
      },
      statePath
    );
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
    saveState(
      { ...s, active: null, entryStartTs: null, wordsAtEntryStart: 0, lastActive: target },
      statePath
    );
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
      const cmdMatch = canRunCommand ? label.match(/^`(.+)`$/) : null;
      const evidenceMatch = !cmdMatch ? label.match(evidencePattern) : null;
      const evidenceCommands = evidenceMatch
        ? [...evidenceMatch[1].matchAll(/`([^`]+)`/g)].map((cmd) => cmd[1])
        : [];
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
    // #137 — sandboxed /task test stamps `aitm-dod-verified` after green
    // verification. When present, /task review trusts that evidence and
    // skips re-running commands. Without the marker, refuse — the test
    // stage must run first.
    const sandboxVerified = hasDodVerifiedMarker(rawBody);
    if (!sandboxVerified) {
      process.stderr.write('\n');
      process.stderr.write(`⛔ Refusing /task review for ${target}:\n`);
      process.stderr.write(
        '   BLOCKED: missing `aitm-dod-verified` marker — run `/task test ' +
          `${target}` +
          '` first.\n\n'
      );
      process.exit(4);
    }
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

    const tmpBody = path.join(projectTmpDir(projectDir), `task-review-body-${issueNum}.md`);
    try {
      writeFileSync(tmpBody, lines.join('\n'), 'utf8');
      await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmpBody], {
        timeout: GH_API_TIMEOUT_MS,
      });
    } finally {
      try {
        unlinkSync(tmpBody);
      } catch {}
    }

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
    await runMoveState(target, 'review', { silent: true });
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
