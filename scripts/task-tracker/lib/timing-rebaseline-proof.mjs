// @story #2022 #2068
// Read native execution records as data; never evaluate transcript commands.
import { fileURLToPath } from 'node:url';
import { timingBodySha } from './heal-actor-opener-replays.mjs';

export const refuseRebaseline = (reason) => {
  throw new TypeError('timing-rebaseline:' + reason);
};

function relocationCommand(command, issue) {
  if (
    !Array.isArray(command) ||
    command.length !== 3 ||
    command[0] !== '/bin/zsh' ||
    command[1] !== '-lc'
  )
    return false;
  // Canonical native source-checkout Start. Keep the carrier closed: no
  // wrappers, composed commands, extra flags or substituted issue/role.
  if (command[2] === `npx aitm start ${issue} --role agent --confirm-relocation`) return true;
  const lines = command[2]?.split('\n');
  if (lines?.length !== 3 || lines[0] !== 'set -e') return false;
  const start = lines[1].split(' ');
  if (
    start.length !== 8 ||
    !/^\/[^\s;&|`$]+\/node$/.test(start[0]) ||
    !/^\/[^\s;&|`$]+\/bin\/aitm\.mjs$/.test(start[1])
  )
    return false;
  return (
    lines[1] ===
      `${start[0]} ${start[1]} start ${issue} --role agent --confirm-relocation --allow-foreign-worktree` &&
    lines[2] === `${start[0]} ${start[1]} explain ${issue} --json`
  );
}

export function readRebaselineProof(text, { sessionId, issueNumber, projectDir, baseline, end }) {
  if (typeof text !== 'string' || !text) refuseRebaseline('transcript-unavailable');
  const metadata = [];
  const proofs = [];
  let cursor = 0;
  let prefix = null;
  let lineNumber = 0;
  for (const line of text.split('\n')) {
    lineNumber++;
    cursor += line.length + 1;
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      if (prefix !== null && cursor >= text.length && !text.endsWith('\n')) break;
      refuseRebaseline('malformed-transcript');
    }
    const ms = Date.parse(record.timestamp);
    if (!Number.isFinite(ms)) refuseRebaseline('malformed-transcript');
    if (record.type === 'session_meta') metadata.push(record.payload);
    if (prefix !== null && ms <= end) refuseRebaseline('historical-transcript-reentry');
    if (ms > end && prefix === null) {
      prefix = text.slice(0, Math.min(cursor, text.length));
    }
    if (ms > end) continue;
    const item = record.payload?.item;
    if (
      record.type !== 'event_msg' ||
      record.payload?.type !== 'item_completed' ||
      item?.type !== 'CommandExecution'
    )
      continue;
    if (!relocationCommand(item.command, issueNumber)) continue;
    let cwd;
    try {
      cwd = fileURLToPath(item.cwd);
    } catch {
      refuseRebaseline('native-cwd');
    }
    const duration = item.duration?.secs * 1000 + item.duration?.nanos / 1e6;
    if (
      !Number.isSafeInteger(item.duration?.secs) ||
      item.duration.secs < 0 ||
      !Number.isSafeInteger(item.duration?.nanos) ||
      item.duration.nanos < 0 ||
      item.duration.nanos >= 1e9
    )
      continue;
    if (
      cwd !== projectDir ||
      item.source !== 'unified_exec_startup' ||
      item.status !== 'completed' ||
      item.exit_code !== 0 ||
      typeof item.id !== 'string' ||
      !item.id ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 120_000 ||
      baseline < ms - duration ||
      baseline > ms ||
      !item.aggregated_output
        ?.split('\n')
        .includes(
          `Bound #${issueNumber} (live timing span already active; no duplicate reengagement row).`
        )
    )
      continue;
    proofs.push({ line: lineNumber, executionId: item.id, completedAt: record.timestamp });
  }
  if (
    metadata.length !== 1 ||
    metadata[0]?.id !== sessionId ||
    typeof metadata[0]?.cwd !== 'string'
  )
    refuseRebaseline('session-identity');
  if (proofs.length !== 1) refuseRebaseline('native-relocation-evidence');
  if (prefix === null) prefix = text;
  return {
    transcriptSha: timingBodySha(prefix),
    prefixBytes: Buffer.byteLength(prefix),
    nativeProof: proofs[0],
  };
}
