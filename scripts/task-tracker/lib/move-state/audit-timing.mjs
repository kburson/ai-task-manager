// INTERNAL — library module for the state-movement boundary (#559).
//
// Audit/timing concern extracted from `scripts/gh/move-state.mjs`. These are
// the timeline-observable emissions that fire AFTER a committed board move:
//   • the paired `<prev>:complete` + `<next>:enter` lifecycle rows (#128/#540),
//   • the Full-Auto review-gate audit comment / human-reviewer marker (#169),
//   • the out-of-band emergency-move audit comment + timing row.
//
// Every function here is best-effort: a failure surfaces on stderr and never
// rolls back the board move (which is already committed by the time these run).
// The host calls them in the SAME interleaved order as the pre-#559 inline
// block, so timeline ordering relative to the cache/unpark side-effects is
// byte-identical — see move-state.mjs `__mutationBlock` for the call order and
// the #535/#516 ordering rationale.
//
// Runtime values, `cfg`, and the I/O primitives (`gh`, `pexec`) arrive via the
// shared `ctx` object the host assembles once; stateless helpers + node
// builtins are imported directly here (identical module instances, no behavior
// drift).

import { durableWordMarker } from '../../state.mjs';
import { getProjectDir, projectTmpDir } from '../../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../process-timeouts.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// #128 — Paired lifecycle row emission. The chokepoint for all kanban
// transitions emits `<prev>:complete` + `<next>:enter` rows (both share
// the same wall-clock `ts`) from the canonical PHASE_EVENTS table. Demote
// substitutes a `demoted` row (no completion event) before the
// `<next>:enter`. Skip when SKIP_NETWORK is set or when both halves are
// absent (e.g. transitions with no completion event for the previous
// state and no entry event for the target). Best-effort — failures here
// do not roll back the committed board move.
export async function emitPhasePairRows(ctx) {
  const { issueArg, stateArg, resolvedFromState, demoteFlag, cfg, SKIP_NETWORK } = ctx;
  if (SKIP_NETWORK) return;
  try {
    const { buildRow, postTimingEvent, readTimingCommentBody } =
      await import('../../gh-timing-comment.mjs');
    const { deriveStateMoveDelta } = await import('../timing-rows.mjs');
    const { PHASE_EVENTS } = await import('../../phase-events.mjs');

    const ts = new Date().toISOString();
    const prev = resolvedFromState || '';
    const timingBody = await readTimingCommentBody({
      issueNumber: issueArg,
      repo: cfg.repo,
      timeoutMs: GH_API_TIMEOUT_MS,
    });
    const { activeSec, idleSec } = deriveStateMoveDelta(timingBody, ts);

    // #475 AC1 — every phase-pair row carries the carried-forward durable
    // marker rather than collapsing to 0.
    const _phaseMarker = durableWordMarker(getProjectDir());
    // First row: completion of the previous state (or `demoted` for demote).
    if (demoteFlag) {
      const row = buildRow({
        ts,
        event: 'demoted',
        activeSec,
        idleSec,
        deltaWords: 0,
        wordMarker: _phaseMarker,
        description: prev ? `demoted from ${prev}` : 'demoted',
      });
      await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
    } else if (prev && PHASE_EVENTS[prev]?.complete && stateArg !== 'done') {
      // #540 — the move to `done` is the ONE transition where the
      // `<prev>:complete` row is NOT emitted here. `prev` is always `review`
      // for a done move, and the close verb (close.mjs) now owns the
      // `review:approved` row so it can emit it BEFORE `issue:wrap` (the
      // wrap-up row close.mjs posts ahead of this terminal board move).
      // Emitting `review:approved` here as well would (a) duplicate the row
      // and (b) land it AFTER `issue:wrap`, reproducing the #535 misordering.
      const row = buildRow({
        ts,
        phase: { state: prev, phase: 'complete' },
        activeSec,
        idleSec,
        deltaWords: 0,
        wordMarker: _phaseMarker,
      });
      await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
    }

    // Second row: entry into the new state. Share the same `ts` so the
    // pair is co-located in the table.
    //
    // #475 AC4 / #516 — the move to `done` is special. The board reaches Done
    // only AFTER post-approval cleanup (timing flushed, body updated, `gh
    // issue close`), so this is the terminal "ready for next story" moment.
    // Emit the `done.complete` (`issue:closed`) event here carrying the
    // wrap→close cleanup interval (the `activeSec/idleSec` delta derived
    // above). The wrap-up moment itself (`done.enter` = `issue:wrap`) was
    // already logged by the close verb, and the approval moment is now carried
    // by the review state's own completion (`review:approved`) rather than
    // being borrowed here — the asymmetry #516 dissolved.
    if (stateArg === 'done' && !demoteFlag && PHASE_EVENTS.done?.complete) {
      const row = buildRow({
        ts,
        phase: { state: 'done', phase: 'complete' },
        activeSec,
        idleSec,
        deltaWords: 0,
        wordMarker: _phaseMarker,
      });
      await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
    } else if (PHASE_EVENTS[stateArg]?.enter) {
      // `<next>:enter` derives from PHASE_EVENTS; honest 0/0 because the
      // paired emission shares ts with the completion row above — no
      // elapsed delta is possible between the two halves.
      const row = buildRow({
        ts,
        phase: { state: stateArg, phase: 'enter' },
        activeSec: 0,
        idleSec: 0,
        deltaWords: 0,
        wordMarker: _phaseMarker,
      });
      await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
    }
  } catch (err) {
    process.stderr.write(`[move-state] #${issueArg}: phase-pair emission failed: ${err.message}\n`);
  }
}

// #169 — Full-Auto review-gate audit. When the move lands at `done` and
// `TASK_TRACKER_HUMAN_REVIEWER` is unset, post a structured audit comment
// so the close is observable as auto-approved. When set, stamp an
// `aitm-human-reviewer` body marker. Idempotent on both paths.
export async function emitFullAutoReviewAudit(ctx) {
  const { issueArg, stateArg, cfg, SKIP_NETWORK, pexec } = ctx;
  if (!(stateArg === 'done' && !SKIP_NETWORK && process.env.AITM_CASCADE !== '1')) return;
  try {
    const { enforceFullAutoAudit } = await import('../human-reviewer-audit.mjs');
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    const currentBody = JSON.parse(stdout).body ?? '';
    const tmpForMarker = path.join(
      projectTmpDir(getProjectDir()),
      `aitm-human-reviewer-${issueArg}-${Date.now()}.md`
    );
    const result = await enforceFullAutoAudit({
      issueNumber: issueArg,
      repo: cfg.repo,
      body: currentBody,
      env: process.env,
      writeIssueBody: async ({ body }) => {
        writeFileSync(tmpForMarker, body, 'utf8');
        try {
          await ctx.gh(['issue', 'edit', issueArg, '-R', cfg.repo, '--body-file', tmpForMarker]);
        } finally {
          try {
            unlinkSync(tmpForMarker);
          } catch {
            /* best-effort */
          }
        }
      },
    });
    if (result.mode === 'full-auto' && result.auditPosted) {
      process.stderr.write(
        `[human-reviewer-audit] #${issueArg}: posted full-auto audit comment (no human reviewer)\n`
      );
    } else if (result.mode === 'human-reviewer' && result.stamped) {
      process.stderr.write(
        `[human-reviewer-audit] #${issueArg}: stamped human-reviewer marker (${result.handle})\n`
      );
    }
  } catch (err) {
    // surface, do not block — board move is committed
    process.stderr.write(
      `[human-reviewer-audit] #${issueArg}: enforcement failed: ${err.message}\n`
    );
  }
}

// Out-of-band audit trail: visible comment + timing-log row. Best-effort —
// failures do not roll back the board move.
export async function emitOutOfBandAudit(ctx) {
  const { issueArg, stateArg, resolvedFromState, outOfBandReason, cfg, SKIP_NETWORK, gh } = ctx;
  if (!(outOfBandReason && !SKIP_NETWORK)) return;
  const ts = new Date().toISOString();
  const fromLabel = resolvedFromState || '?';
  const auditMarker = `<!-- aitm-out-of-band-move: ${fromLabel}→${stateArg}:${outOfBandReason}:${ts} -->`;
  const auditBody = `⚠ **Out-of-band move-state** ${fromLabel} → ${stateArg} at ${ts}.\nReason: ${outOfBandReason}\n\n${auditMarker}`;
  try {
    await gh(['issue', 'comment', issueArg, '-R', cfg.repo, '--body', auditBody]);
  } catch {
    /* best-effort */
  }
  try {
    const { buildRow, postTimingEvent, readTimingCommentBody } =
      await import('../../gh-timing-comment.mjs');
    const { deriveStateMoveDelta } = await import('../timing-rows.mjs');
    // Best-effort fetch of the timing-log comment body (where prior rows live).
    // The issue body never contains timing rows. If the fetch fails the delta
    // is honest 0/0.
    const _timingBodyM2 = await readTimingCommentBody({
      issueNumber: issueArg,
      repo: cfg.repo,
      timeoutMs: GH_API_TIMEOUT_MS,
    });
    const _dM2 = deriveStateMoveDelta(_timingBodyM2, ts);
    const row = buildRow({
      ts,
      event: 'out-of-band-move',
      activeSec: _dM2.activeSec,
      idleSec: _dM2.idleSec,
      deltaWords: 0,
      // #475 AC1 — carried-forward durable marker (out-of-band audit row)
      wordMarker: durableWordMarker(getProjectDir()),
      description: `${fromLabel}→${stateArg}: ${outOfBandReason}`,
    });
    await postTimingEvent({ issueNumber: issueArg, repo: cfg.repo, row, timeoutMs: 3000 });
  } catch {
    /* best-effort */
  }
}
