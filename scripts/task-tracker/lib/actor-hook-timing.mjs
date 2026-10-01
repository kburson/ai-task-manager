// @story #1857
// Hooks use the same original-actor publication and cursor recovery as task verbs.
import { loadState, saveState } from '../state.mjs';
import { currentSessionId } from '../word-counter.mjs';

export async function runActorHookTiming(ctx, { event, sid }) {
  if (sid !== currentSessionId()) throw new Error('HOOK_ACTOR_MISMATCH');
  if (!['PreCompact', 'PostCompact', 'SessionStart'].includes(event))
    throw new Error('HOOK_TIMING_EVENT_INVALID');
  let state = loadState(ctx.statePath);
  if (!state.active || state.active === 'discover') return { status: 'unbound' };
  await ctx.flushActiveToGH(state, 'update', 'pending hook recovery', undefined, {
    recoverOnly: true,
  });
  state = loadState(ctx.statePath);
  if (!state.entryStartTs) return { status: 'paused' };
  if (event === 'SessionStart') {
    // A process restart does not establish when the prior process stopped.
    // Preserve that uncertainty at the current recording time; never credit
    // the unobserved gap as active work or invent a historical departure.
    await ctx.flushActiveToGH(
      { ...state, entryStartTs: null },
      'session-end-recovery',
      'prior session end unavailable'
    );
    const current = loadState(ctx.statePath);
    saveState({ ...current, entryStartTs: new Date().toISOString(), paused: false }, ctx.statePath);
    const result = await ctx.flushActiveToGH(
      loadState(ctx.statePath),
      'session-start',
      'current provider session started'
    );
    return { status: 'recovered-unknown', ...result };
  }
  const timingEvent = event === 'PreCompact' ? 'pre-compact-flush' : 'post-compact-resume';
  const result = await ctx.flushActiveToGH(
    state,
    timingEvent,
    event === 'PreCompact' ? 'context compacted' : 'resumed after compact'
  );
  return { status: 'flushed', ...result };
}
