import { loadState } from '../state.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

export async function verbReject(ctx) {
  const {
    cfg,
    statePath,
    rest,
    SKIP_NETWORK,
    pexec,
    safePostTiming,
    runMoveState,
    getIssueBoardState,
    nowIso,
  } = ctx;
  const target = rest.find((a) => /^#\d+$/.test(a)) || (loadState(statePath).lastActive ?? null);
  if (!target) {
    console.error('Usage: /task reject #N --reason "..."');
    process.exit(1);
  }
  const reasonIdx = rest.indexOf('--reason');
  const reason = reasonIdx >= 0 ? rest[reasonIdx + 1] : null;
  if (!reason || !reason.trim()) {
    console.error('Usage: /task reject #N --reason "..."  (reason is required)');
    process.exit(1);
  }
  const issueNum = String(target).replace(/^#/, '');
  if (!SKIP_NETWORK) {
    const state = await getIssueBoardState(issueNum);
    if (state !== 'review') {
      console.error(
        `⛔ /task reject refused: #${issueNum} is in '${state ?? 'unknown'}', expected 'review'.`
      );
      process.exit(1);
    }
    const ts = nowIso();
    const commentBody = `### ❌ Review rejected\n\n${reason.trim()}\n\n— rejected at ${ts}`;
    try {
      await pexec('gh', ['issue', 'comment', issueNum, '-R', cfg.repo, '--body', commentBody], {
        timeout: GH_API_TIMEOUT_MS,
      });
    } catch (err) {
      console.error(`⚠ failed to post rejection comment: ${err.message}`);
      process.exit(1);
    }
  }
  await runMoveState(target, 'develop');
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const { deriveStateMoveDelta } = await import('../lib/timing-rows.mjs');
  let rejectBody = '';
  try {
    const { stdout } = await pexec(
      'gh',
      ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body'],
      { timeout: GH_API_TIMEOUT_MS }
    );
    rejectBody = JSON.parse(stdout).body ?? '';
  } catch {
    // best-effort — fall through with empty body (delta is 0/0)
  }
  const descReason = reason.trim().slice(0, 40);
  // #475 AC1 — stamp the durable carried-forward Word Marker, not 0.
  const _lwm = loadState(statePath).lastWordMarker ?? 0;
  const _ts = nowIso();
  const _d = deriveStateMoveDelta(rejectBody, _ts);
  await safePostTiming(
    target,
    buildRow({
      ts: _ts,
      event: 'develop',
      activeSec: _d.activeSec,
      idleSec: _d.idleSec,
      deltaWords: 0,
      // #475 AC1 — carried-forward durable marker, not 0 (review-rejected revert, no live session)
      wordMarker: _lwm,
      description: `review rejected: ${descReason}`,
    })
  );
  console.log(`✓ ${target} rejected — moved back to Develop.`);
}
