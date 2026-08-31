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
  await verbResume(ctx);
  await ctx.resumeReviewActionsAfterBind?.(/^#/.test(String(raw)) ? String(raw) : `#${raw}`);
}
