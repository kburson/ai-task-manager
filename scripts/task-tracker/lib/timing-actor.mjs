// @story #1857
// Pure correlation identity; a public actor key grants no authority.
import { createHash } from 'node:crypto';
import { FALLBACK_SESSION_ID } from './session-id.mjs';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const KEY = /^v1:[a-f0-9]{64}$/;
function invalid() {
  const error = new TypeError('Invalid timing actor identity or marker');
  error.code = 'TIMING_ACTOR_INVALID';
  throw error;
}
export function timingActorKey(identity) {
  if (
    !identity ||
    typeof identity.provider !== 'string' ||
    typeof identity.sid !== 'string' ||
    !ID.test(identity.provider) ||
    !ID.test(identity.sid) ||
    [FALLBACK_SESSION_ID, 'default', 'unknown'].includes(identity.sid) ||
    identity.sid.includes('..')
  )
    invalid();
  return (
    'v1:' +
    createHash('sha256')
      .update(JSON.stringify(['aitm.timing-actor/v1', identity.provider, identity.sid]))
      .digest('hex')
  );
}
export function assertTimingActorKey(key) {
  if (typeof key !== 'string' || !KEY.test(key)) invalid();
  return key;
}
export function timingActorMarker(identity) {
  const key =
    typeof identity === 'string' ? assertTimingActorKey(identity) : timingActorKey(identity);
  return ' <!-- aitm-actor:v1 key=' + key.slice(3) + ' -->';
}
export function readTimingActor(line) {
  const source = String(line ?? '');
  if (!source.includes('aitm-actor:')) {
    if (source.includes('aitm-engagement:')) invalid();
    return null;
  }
  const matches = [
    ...source.matchAll(new RegExp('<!-- aitm-actor:v1 key=([a-f0-9]{64}) -->', 'g')),
  ];
  if (matches.length !== 1 || source.split('aitm-actor:').length !== 2) invalid();
  const match = matches[0];
  let suffix = source.slice(match.index + match[0].length);
  let engagement;
  if (suffix.includes('aitm-engagement:')) {
    const evidence = suffix.match(
      /^\s*<!-- aitm-engagement:v1 start=(\d+) end=(\d+) active=(unknown|\d+) wstart=(unknown|\d+) wend=(unknown|\d+) fstart=(unknown|\d+) fend=(unknown|\d+) -->/
    );
    if (!evidence) invalid();
    engagement = {
      startMs: Number(evidence[1]),
      endMs: Number(evidence[2]),
      activeEstimateSec: evidence[3] === 'unknown' ? null : Number(evidence[3]),
      wordStart: evidence[4] === 'unknown' ? null : Number(evidence[4]),
      wordEnd: evidence[5] === 'unknown' ? null : Number(evidence[5]),
      fullWordStart: evidence[6] === 'unknown' ? null : Number(evidence[6]),
      fullWordEnd: evidence[7] === 'unknown' ? null : Number(evidence[7]),
    };
    validateTimingEngagement(engagement);
    const cells = source
      .slice(0, match.index)
      .split('|')
      .map((cell) => cell.trim());
    for (const [cursor, cell] of [
      [engagement.wordEnd, cells[6]],
      [engagement.fullWordEnd, cells[8]],
    ]) {
      if (
        cursor !== null &&
        (!new RegExp('^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$').test(cell || '') ||
          Number(cell.replaceAll(',', '')) !== cursor)
      )
        invalid();
    }
    suffix = suffix.slice(evidence[0].length);
  }
  if (!/^\s*(?:<!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->)?\s*$/.test(suffix)) invalid();
  return {
    key: 'v1:' + match[1],
    marker: match[0],
    index: match.index,
    ...(engagement ? { engagement } : {}),
  };
}

export function validateTimingEngagement(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.startMs) ||
    value.startMs < 0 ||
    !Number.isSafeInteger(value.endMs) ||
    value.endMs < value.startMs ||
    (value.activeEstimateSec !== null &&
      (!Number.isSafeInteger(value.activeEstimateSec) ||
        value.activeEstimateSec < 0 ||
        value.activeEstimateSec * 1000 > value.endMs - value.startMs))
  )
    invalid();
  for (const [start, end] of [
    [value.wordStart, value.wordEnd],
    [value.fullWordStart, value.fullWordEnd],
  ]) {
    if (start === null && end === null) continue;
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end < start)
      invalid();
  }
  return value;
}
export function timingEngagementMarker(value) {
  validateTimingEngagement(value);
  return (
    ' <!-- aitm-engagement:v1 start=' +
    value.startMs +
    ' end=' +
    value.endMs +
    ' active=' +
    (value.activeEstimateSec ?? 'unknown') +
    ' wstart=' +
    (value.wordStart ?? 'unknown') +
    ' wend=' +
    (value.wordEnd ?? 'unknown') +
    ' fstart=' +
    (value.fullWordStart ?? 'unknown') +
    ' fend=' +
    (value.fullWordEnd ?? 'unknown') +
    ' -->'
  );
}
