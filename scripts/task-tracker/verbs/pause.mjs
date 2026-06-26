import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { canonicalPauseReason, isOtherReason } from '../lib/canonical-pause-reason.mjs';

export async function verbPause(ctx) {
  const { statePath, projectDir, rest, drainQueueIfAny, flushActiveToGH } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.log('nothing to pause');
    return;
  }
  const reasonText = rest.join(' ').trim() || undefined;
  // #534 — non-switch pauses carry an explicit, paired reason. The Event slug
  // becomes `pause:<canonical-slug>` (question/discuss/blocked/break, else
  // `other`); the operator's free text rides in the Description cell, preserved
  // verbatim when the slug collapses to `other`. The symmetric `/task resume`
  // reads the persisted slug/text back to emit `resume:<slug>`.
  const reasonSlug = canonicalPauseReason(reasonText);
  const pauseEvent = `pause:${reasonSlug}`;
  // For `other`, the free text is the only carrier of intent → keep it in the
  // Description. For a canonical slug, still echo any free text the operator
  // typed so context is never lost.
  const pauseDesc = reasonText ?? (isOtherReason(reasonSlug) ? undefined : reasonSlug);
  const { deltaMin, deltaWallMin, deltaWords, ts } = await flushActiveToGH(
    s,
    pauseEvent,
    pauseDesc
  );
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  saveState(
    {
      ...s,
      active: null,
      entryStartTs: null,
      wordsAtEntryStart: 0,
      lastActive: s.active,
      paused: true,
      // #475 AC2 — record the pause instant so `resume` can compute the idle
      // span of the pause window and stamp it on the `resumed` row.
      pausedAtTs: ts,
      // #534 — persist the resolved reason so the symmetric `/task resume`
      // (no-arg) can pair against the same slug and echo the same free text.
      pauseReasonSlug: reasonSlug,
      pauseReasonText: reasonText ?? null,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, s.active, 'paused');
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  console.log(
    `Paused ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words. Use "/task resume" to resume.`
  );
}
