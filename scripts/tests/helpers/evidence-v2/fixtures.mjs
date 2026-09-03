// @story #1496
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import {
  upsertDeliveredCloseTransaction,
  TERMINAL_CLOSE_STEPS,
} from '../../../task-tracker/lib/close-convergence.mjs';

export function legacyFixtures({ acceptedSha, issueNumber = 1000001 }) {
  const transaction = {
    schema: 'aitm.delivered-close/v1',
    transactionId: randomUUID(),
    issueNumber,
    acceptedSha,
    reviewAuthority: 'human-gate',
    completedSteps: [...TERMINAL_CLOSE_STEPS],
  };
  return Object.freeze({
    provenance: {
      historicalIssues: [1490, 1488, 1485],
      synthetic: true,
      productionEvidenceEligible: false,
    },
    completedBody: upsertDeliveredCloseTransaction('', transaction),
    boardBeforeCheckpointBody: upsertDeliveredCloseTransaction('', {
      ...transaction,
      transactionId: randomUUID(),
      completedSteps: ['timing', 'estimation', 'lifecycle'],
    }),
    reopened: { state: 'OPEN', stateReason: 'REOPENED' },
    oldBinding: { sessionId: 'synthetic-session', generation: 'old-claim', issueNumber },
    newerSameSessionBinding: {
      sessionId: 'synthetic-session',
      generation: 'new-claim',
      issueNumber,
    },
    foreignBinding: {
      sessionId: 'foreign-synthetic-session',
      generation: 'foreign-claim',
      issueNumber,
    },
  });
}

function snapshot(file) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) return { mode: stat.mode, link: readlinkSync(file) };
  if (stat.isDirectory())
    return Object.fromEntries(
      readdirSync(file)
        .sort()
        .map((name) => [name, snapshot(path.join(file, name))])
    );
  return {
    mode: stat.mode,
    bytes: stat.size,
    digest: createHash('sha256').update(readFileSync(file)).digest('hex'),
  };
}

export function captureProtectedState({ paths }) {
  try {
    return {
      status: 'observed',
      observations: Object.fromEntries(paths.map((file) => [file, snapshot(file)])),
    };
  } catch (error) {
    return { status: 'inconclusive', reason: error.message };
  }
}

export function compareProtectedState(before, after) {
  if (before.status !== 'observed' || after.status !== 'observed') return 'inconclusive';
  return JSON.stringify(before.observations) === JSON.stringify(after.observations)
    ? 'unchanged'
    : 'changed';
}
