import { loadState, saveState } from '../state.mjs';
import { setTaskStatus } from '../fleet-registry.mjs';
import { bodyOf } from '../gh-timing-comment.mjs';
import { isTerminalReviewHandoffOpen } from '../lib/terminal-review-handoff.mjs';
import { timingPostWarningSuffix } from '../lib/timing-post-outcome.mjs';
import { releaseBindingOccupancy } from '../lib/occupancy-lifecycle.mjs';

export async function verbStop(ctx) {
  const {
    cfg,
    statePath,
    projectDir,
    rest,
    drainQueueIfAny,
    flushActiveToGH,
    readTimingCommentBody,
  } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
    console.log('nothing to stop');
    return;
  }
  if (readTimingCommentBody && cfg?.repo) {
    try {
      const result = await readTimingCommentBody({
        issueNumber: String(s.active).replace(/^#/, ''),
        repo: cfg.repo,
      });
      if (result?.status !== 'error' && isTerminalReviewHandoffOpen(bodyOf(result))) {
        try {
          setTaskStatus(projectDir, s.active, 'paused');
        } catch {
          /* best-effort: failure must not abort the primary operation */
        }
        const issueNumber = String(s.active).replace(/^#/, '');
        console.log(
          `Terminal review handoff for ${s.active}: kept bound with no stop row. ` +
            `Continue directly with "/task close ${issueNumber}".`
        );
        return;
      }
    } catch {
      /* unknown durable timing state: preserve the existing stop behavior */
    }
  }
  const reason = rest.join(' ').trim() || undefined;
  const { deltaMin, deltaWallMin, deltaWords, post } = await flushActiveToGH(s, 'stop', reason);
  const wallNote = deltaWallMin !== deltaMin ? ` (wall ${deltaWallMin})` : '';
  saveState(
    {
      ...s,
      active: null,
      entryStartTs: null,
      wordsAtEntryStart: 0,
      lastActive: s.active,
      paused: undefined,
    },
    statePath
  );
  try {
    setTaskStatus(projectDir, s.active, 'stopped');
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  (ctx.releaseBindingOccupancy ?? releaseBindingOccupancy)(
    { projectDir, issue: s.active },
    { releaseOccupancy: ctx.releaseOccupancy }
  );
  console.log(
    `Stopped ${s.active}: +${deltaMin} active min${wallNote}, +${deltaWords} words${timingPostWarningSuffix(post)}. Use "/task resume <N>" to return to it later.`
  );
}
