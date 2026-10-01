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
  if (!source.includes('aitm-actor:')) return null;
  const matches = [
    ...source.matchAll(new RegExp('<!-- aitm-actor:v1 key=([a-f0-9]{64}) -->', 'g')),
  ];
  if (matches.length !== 1 || source.split('aitm-actor:').length !== 2) invalid();
  const match = matches[0];
  const suffix = source.slice(match.index + match[0].length);
  if (!/^\s*(?:<!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->)?\s*$/.test(suffix)) invalid();
  return { key: 'v1:' + match[1], marker: match[0], index: match.index };
}
