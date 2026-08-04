import { attributingCommits as defaultAttributingCommits } from './commit-attribution.mjs';

const VERIFICATION_ACTIVITY_HEADING_RE =
  /^\s*(?:###\s+Verification report\b|##\s+[✓✗]\s+Sandboxed verification (?:passed|failed)\b|##\s+New Automated Tests\b)/i;

function normalizeTimestamps(values) {
  const byMs = new Map();
  for (const value of values) {
    const ms = Date.parse(String(value ?? ''));
    if (!Number.isFinite(ms)) continue;
    byMs.set(ms, new Date(ms).toISOString());
  }
  return Object.freeze(
    [...byMs.entries()].sort(([left], [right]) => left - right).map(([, timestamp]) => timestamp)
  );
}

export function verificationActivityTimestamps(comments = []) {
  if (!Array.isArray(comments)) return [];
  return normalizeTimestamps(
    comments
      .filter(
        (comment) =>
          comment &&
          typeof comment.body === 'string' &&
          VERIFICATION_ACTIVITY_HEADING_RE.test(comment.body)
      )
      .map((comment) => comment.createdAt)
  );
}

function result(status, timestamps, reason) {
  return Object.freeze({
    status,
    timestamps,
    ...(reason ? { reason } : {}),
  });
}

export async function collectResumeActivityEvidence({
  issueNumber,
  projectDir,
  comments = [],
  attributingCommits = defaultAttributingCommits,
} = {}) {
  const commentTimestamps = verificationActivityTimestamps(comments);
  let commits;
  try {
    commits = await attributingCommits(issueNumber, { cwd: projectDir });
  } catch {
    if (commentTimestamps.length > 0) return result('found', commentTimestamps);
    return result('unknown', Object.freeze([]), 'commit-attribution-failed');
  }

  const timestamps = normalizeTimestamps([
    ...commentTimestamps,
    ...(Array.isArray(commits) ? commits.map((commit) => commit?.ts) : []),
  ]);
  return result(timestamps.length > 0 ? 'found' : 'none', timestamps);
}
