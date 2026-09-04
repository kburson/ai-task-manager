import { verbResume } from './resume.mjs';

// `/task start <N>` binds to issue #N (same path as `/task #N`).
// `/task start` with no issue number exits with an error directing the user
// to provide a number. Use `/task resume` to un-pause the last paused task.
export async function verbStart(ctx) {
  const raw = ctx.rest[0];
  if (!raw || !/^#?\d+$/.test(String(raw))) {
    console.log('no task number provided; use "/task start <N>"');
    process.exitCode = 1;
    return;
  }
  // #1488 — do NOT re-issue the Review resident wake here. `verbResume` owns
  // that decision (see `wakeReviewResidents`) and deliberately declines it for
  // the `start` verb, as `verbSwitch` does too. Re-issuing it re-ran the Review
  // action and re-paused the session this bind had just opened, which left
  // `deliver` — requiring Review state AND a running binding — unreachable.
  await verbResume(ctx);
}
