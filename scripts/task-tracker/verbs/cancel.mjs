import { loadState, saveState } from '../state.mjs';

// `/task cancel` — escape hatch for a stuck discovery bucket. Clears the
// bucket and the `discover` binding WITHOUT emitting any timing rows (there is
// no issue to log against, and the elapsed time is discarded, not reconciled).
// No-op when there is no active discovery bucket. See issue #234.
export async function verbCancel(ctx) {
  const { statePath, drainQueueIfAny } = ctx;
  if (drainQueueIfAny) await drainQueueIfAny();
  const s = loadState(statePath);
  if (s.active !== 'discover' && !s.discoverBucket) {
    console.log('No active discovery bucket to cancel.');
    return;
  }
  saveState({ ...s, active: null, discoverBucket: null }, statePath);
  console.log('Cancelled discovery bucket. No timing rows recorded.');
}
