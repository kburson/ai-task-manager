// @story #1755
// Exact, ordered source inventory for the scoped delivery attribution exception.

import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './github-records/canonical-json.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const COMMIT_KEYS = ['messageHeadline', 'oid'];

function inventoryError(category) {
  return new TypeError(`delivery-attribution-exception:${category}`);
}

function validCommit(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === COMMIT_KEYS.length &&
    keys.every((key, index) => key === COMMIT_KEYS[index]) &&
    SHA_RE.test(value.oid) &&
    typeof value.messageHeadline === 'string' &&
    value.messageHeadline.length > 0 &&
    value.messageHeadline.isWellFormed() &&
    !value.messageHeadline.includes('\n') &&
    !value.messageHeadline.includes('\r')
  );
}

export function canonicalSourceInventory(sourceCommits, expectedHeadSha) {
  if (!SHA_RE.test(expectedHeadSha)) throw inventoryError('head-sha');
  if (!Array.isArray(sourceCommits) || sourceCommits.length === 0) {
    throw inventoryError('missing-source-commits');
  }
  if (!sourceCommits.every(validCommit)) throw inventoryError('source-commit-shape');
  const commits = sourceCommits.map(({ oid, messageHeadline }) => ({ oid, messageHeadline }));
  if (new Set(commits.map(({ oid }) => oid)).size !== commits.length) {
    throw inventoryError('duplicate-source-sha');
  }
  if (commits.at(-1).oid !== expectedHeadSha) throw inventoryError('head-mismatch');
  const sourceDigest = `sha256:${createHash('sha256')
    .update(canonicalRecordJson(commits))
    .digest('hex')}`;
  return { commits, sourceDigest };
}

export async function verifyLocalSourceInventory({ commits, headSha, inspectLocalCommit } = {}) {
  canonicalSourceInventory(commits, headSha);
  if (typeof inspectLocalCommit !== 'function') throw inventoryError('local-reader');
  for (const commit of commits) {
    let local;
    try {
      local = await inspectLocalCommit({ commitSha: commit.oid, headSha });
    } catch {
      throw inventoryError('local-object');
    }
    if (
      local?.oid !== commit.oid ||
      local.localHeadSha !== headSha ||
      typeof local.message !== 'string' ||
      local.message.split(/\r?\n/, 1)[0] !== commit.messageHeadline ||
      local.reachable !== true
    ) {
      throw inventoryError('local-object-mismatch');
    }
  }
  return true;
}
