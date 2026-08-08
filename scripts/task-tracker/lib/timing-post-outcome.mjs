import { parseTimingRow } from './timing-row-reader.mjs';

export async function postTimingSafely(
  { issue, row, repo, timeoutMs, queuePath, skipNetwork = false },
  { postTimingEvent, enqueue, warn = console.error }
) {
  if (skipNetwork) return { ok: true, skipped: true };
  try {
    await postTimingEvent({ issueNumber: issue, repo, row, timeoutMs });
    return { ok: true };
  } catch (error) {
    enqueue({ kind: 'timing', issue, row }, queuePath);
    const event = parseTimingRow(String(row))?.event || 'unknown';
    warn(
      `[task-tracker] WARNING: timing row ${event} for ${issue} queued, not posted (${error.message})`
    );
    return { ok: false, queued: true, err: error.message };
  }
}

export function timingPostWarningSuffix(post) {
  if (post?.ok !== false) return '';
  const error = String(post.err || 'unknown error');
  return ` — WARNING: timing row queued, not posted (${error})`;
}
