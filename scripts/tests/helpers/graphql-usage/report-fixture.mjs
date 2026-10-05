// @story #1838
import { observation } from './observation.mjs';
export const rootId = 'root-a';
export const context = {
  commonRootId: rootId,
  worktreeId: 'tree-a',
  sessionId: 'sha256:' + 'a'.repeat(64),
  sessionSource: 'measurement-launcher',
  enrollmentId: 'enrollment-a',
};
export function row(callId, startedAt = '2026-09-28T00:00:00.000Z', overrides = {}) {
  return { ...observation(context, callId), startedAt, endedAt: startedAt, ...overrides };
}
export function participant(overrides = {}) {
  return {
    schemaVersion: 'aitm.graphql-usage.manifest/v1',
    ...context,
    collectorLaunchRoute: 'measurement-launcher',
    originatingLaunchRoute: null,
    outcome: 'enrolled',
    recordedAt: '2026-09-27T23:00:00.000Z',
    reasonCode: null,
    ...overrides,
  };
}
export function input(observations = [], overrides = {}) {
  return {
    observations,
    participants: [participant()],
    diagnostics: [],
    controls: [],
    duplicateCount: 0,
    conflictCount: 0,
    partialLineCount: 0,
    malformedLineCount: 0,
    unsupportedVersionCount: 0,
    fileOpenCount: 1,
    elapsedMs: 1,
    unclosedWriterCount: 0,
    extents: [],
    ...overrides,
  };
}
export const options = {
  commonRootId: rootId,
  startedAt: '2026-09-28T00:00:00.000Z',
  endedAt: '2026-09-29T00:00:00.000Z',
  timeZone: 'UTC',
};
export function declaration(overrides = {}) {
  return {
    schema: 'aitm.graphql-usage.comparison/v1',
    declaredAt: '2026-09-27T23:00:00.000Z',
    startedAt: options.startedAt,
    endedAt: options.endedAt,
    commonRootId: rootId,
    participants: [{ worktreeId: context.worktreeId, sessionId: context.sessionId }],
    groups: [
      {
        id: 'queries',
        operations: ['GetIssue'],
        observationKind: 'http-attempt',
        signal: 'point-cost',
        sites: ['scripts/gh/lib/github-projects.mjs:12'],
      },
    ],
    inventory: [
      {
        schemaVersion: 'aitm.graphql-usage.inventory/v1',
        source: 'scripts/gh/lib/github-projects.mjs',
        line: 12,
        classification: 'direct-http',
        reason: 'direct GraphQL HTTP endpoint',
        coverage: 'covered',
      },
    ],
    ...overrides,
  };
}
