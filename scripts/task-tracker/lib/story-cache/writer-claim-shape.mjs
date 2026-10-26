// @story #2042 #2056 #2057
// Pure accepted claim shape; this is not persistent ownership authority.
import path from 'node:path';
import { cacheWriterOwnershipDecision } from '../ownership-policy.mjs';
const token = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
function fail(code, reason) {
  throw Object.assign(new Error(`Story writer refused: ${reason}`), { code, reason });
}
export function validateStoryWriterClaim(claim, context = {}) {
  if (
    !claim ||
    claim.schema !== 'aitm.story-writer-claim/v1' ||
    !token(claim.claimId) ||
    !/^[a-f0-9]{64}$/.test(claim.identityKey ?? '') ||
    !token(claim.human) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(claim.human) ||
    Object.keys(claim).some(
      (key) =>
        ![
          'schema',
          'claimId',
          'identityKey',
          'human',
          'sessionId',
          'worktree',
          'cachePath',
          'status',
          'transfer',
          'registryKey',
        ].includes(key)
    ) ||
    (Object.hasOwn(claim, 'registryKey') && !/^[a-f0-9]{64}$/.test(claim.registryKey)) ||
    !token(claim.sessionId) ||
    !absolute(claim.worktree) ||
    !absolute(claim.cachePath) ||
    !claim.cachePath.startsWith(path.join(claim.worktree, '.tmp', 'gh') + path.sep) ||
    claim.status !== 'owned' ||
    claim.transfer !== null
  )
    fail('STORY_WRITER_UNAVAILABLE', 'claim');
  if (context.sessionId !== claim.sessionId || context.worktree !== claim.worktree)
    fail('STORY_WRITER_OWNED', 'local-owner');
  if (
    Object.hasOwn(context, 'assignment') &&
    !cacheWriterOwnershipDecision({ assignees: context.assignment, currentUser: claim.human }).ok
  )
    fail('STORY_WRITER_ASSIGNMENT', 'live-assignment');
}
