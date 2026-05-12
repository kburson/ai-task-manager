import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { projectTmpDir } from '../paths.mjs';
import { validateVerificationCommand } from '../lib/verification-allowlist.mjs';
import { validateBody, DEFAULT_GATES } from '../lib/body-gates.mjs';
import { postTimingEvent } from '../gh-timing-comment.mjs';

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
    rest.find((a) => /^#\d+$/.test(a)) || (s.active && s.active !== 'plan' ? s.active : null);
  if (!target) {
    console.error('Usage: /task review #N');
    process.exit(1);
  }

  if (!SKIP_NETWORK) {
    const issueNum = String(target).replace(/^#/, '');
    let body = '';
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
        { timeout: 10000 }
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
              { timeout: 5000 }
            );
          } catch {}
        } else {
          try {
            const ts = new Date().toISOString();
            const { buildRow } = await import('../gh-timing-comment.mjs');
            const row = buildRow({
              ts,
              event: 'gate-refused',
              activeMin: 0,
              idleMin: 0,
              deltaWords: 0,
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
    await runMoveState(target, 'test');
    console.log(
      `Review ${target}: +${activeMin} active min (agent), +${deltaWords} words; task paused.`
    );
  } else if (s.active === target) {
    const { deltaMin, deltaWallMin, deltaWords } = await flushActiveToGH(
      s,
      'review',
      'starting review'
    );
    const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
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
    await runMoveState(target, 'test');
    console.log(
      `Review ${target}: +${deltaMin} active min${wallNote}, +${deltaWords} words; task paused.`
    );
  } else {
    const ts = nowIso();
    const { buildRow } = await import('../gh-timing-comment.mjs');
    const row = buildRow({
      ts,
      event: 'review',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 0,
      description: 'starting review',
    });
    await safePostTiming(target, row);
    await runMoveState(target, 'test');
    saveState(
      { ...s, active: null, entryStartTs: null, wordsAtEntryStart: 0, lastActive: target },
      statePath
    );
    console.log(`Review ${target}: task paused.`);
  }
  if (!SKIP_NETWORK) {
    const issueNum = target.replace(/^#/, '');
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body'],
      { timeout: 10000 }
    );
    const rawBody = JSON.parse(stdout).body ?? '';
    const lines = rawBody.split('\n');

    let inVerifSection = false;
    const checkboxes = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^#{1,6}\s+Verification Commands/.test(line)) {
        inVerifSection = true;
        continue;
      }
      if (/^#{1,6}\s/.test(line) && inVerifSection) inVerifSection = false;
      const m = line.match(/^- \[([ x])\] (.+)$/);
      if (!m) continue;
      const checked = m[1] === 'x';
      const label = m[2].trim();
      const cmdMatch = inVerifSection ? label.match(/^`(.+)`$/) : null;
      checkboxes.push({ lineIndex: i, checked, label, command: cmdMatch ? cmdMatch[1] : null });
    }

    const failures = [];
    const regressions = [];
    const { CLOSE_OWNED_CHECKBOXES } = await import('../runtime.mjs');
    for (const cb of checkboxes) {
      if (cb.command) {
        const validation = validateVerificationCommand(cb.command, { projectDir });
        if (!validation.ok) {
          console.log(`[task-tracker] rejected: ${validation.reason}`);
          if (cb.checked) {
            regressions.push(cb.label);
            lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
          }
          failures.push(`${cb.label} (rejected: ${validation.reason})`);
          continue;
        }
        let passed = false;
        try {
          await pexec(validation.argv[0], validation.argv.slice(1), {
            cwd: projectDir,
            timeout: 300000,
          });
          passed = true;
        } catch {}
        if (passed) {
          if (!cb.checked) lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [ ]', '- [x]');
        } else {
          if (cb.checked) {
            regressions.push(cb.label);
            lines[cb.lineIndex] = lines[cb.lineIndex].replace('- [x]', '- [ ]');
          }
          failures.push(cb.label);
        }
      } else if (!cb.checked && !CLOSE_OWNED_CHECKBOXES.has(cb.label)) {
        failures.push(`- [ ] ${cb.label}`);
      }
    }

    const tmpBody = path.join(projectTmpDir(projectDir), `task-review-body-${issueNum}.md`);
    try {
      writeFileSync(tmpBody, lines.join('\n'), 'utf8');
      await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmpBody], {
        timeout: 15000,
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
      await safePostTiming(
        target,
        br({
          ts: nowIso(),
          event: 'develop',
          activeMin: 0,
          idleMin: 0,
          deltaWords: 0,
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
    await runMoveState(target, 'review');
    const reviewTs = nowIso();
    const { buildRow: br2 } = await import('../gh-timing-comment.mjs');
    const reviewRow = br2({
      ts: reviewTs,
      event: 'review-ready',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 0,
      description: 'task is now in Review',
    });
    await safePostTiming(target, reviewRow);
    await runLogIssueTime(target);
    console.log(`✓ ${target} moved to Review — all verification passed.`);
    console.log(`PROMPT_REQUIRED: review-approval ${target}`);
  }
}
