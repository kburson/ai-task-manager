// @story #1661

import { createHash } from 'node:crypto';

export function actionDecisionSnapshot(overrides = {}, normalizations = []) {
  const snapshot = {
    state: 'plan',
    head: 'a'.repeat(40),
    startedAt: '2026-09-20T15:00:00.000Z',
    completedAt: '2026-09-20T15:00:01.000Z',
    observations: [
      {
        source: 'issue-body',
        identity: 'issue:1661',
        observedAt: '2026-09-20T15:00:00.500Z',
        digest: `sha256:${'c'.repeat(64)}`,
      },
    ],
    ...overrides,
  };
  snapshot.digest ??= `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        state: snapshot.state,
        head: snapshot.head,
        startedAt: snapshot.startedAt,
        completedAt: snapshot.completedAt,
        observations: snapshot.observations,
        normalizationInputs: normalizations.map(({ inputDigest, normalizerId }) => ({
          normalizerId,
          inputDigest,
        })),
      })
    )
    .digest('hex')}`;
  return snapshot;
}

export function legacyRefusalInventory(guardId = 'fixture-legacy-guard') {
  return {
    version: 1,
    guards: {
      [guardId]: {
        complete: true,
        sites: [
          {
            file: 'fixture.mjs',
            line: 1,
            fingerprint: 'sha256:fixture',
            kind: 'refusal',
          },
        ],
      },
    },
  };
}
