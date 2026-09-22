// @story #1670
// Test-only deterministic authority-cost capture.  Counts are calls through
// createObservationAttempt's read port, rather than its deduplicated bundle.
import { createObservationAttempt } from '../../task-tracker/lib/action-decision/observations.mjs';
import { createHash } from 'node:crypto';
import { collectSessionReadiness } from '../../task-tracker/lib/action-decision/session.mjs';
import { collectEarlyPromoteReadiness } from '../../task-tracker/lib/action-decision/promote.mjs';
import { collectTestReadiness } from '../../task-tracker/lib/action-decision/test.mjs';
import { collectReviewReadiness } from '../../task-tracker/lib/action-decision/review.mjs';
import { collectDeliveryReadiness } from '../../task-tracker/lib/action-decision/deliver.mjs';
import { collectCloseReadiness } from '../../task-tracker/lib/action-decision/close.mjs';
import { computeScopeIdentity } from '../../task-tracker/lib/workflow-policy/scope-identity.mjs';

const REPOSITORY = 'example/project';
const ISSUE = 1670;
const HEAD = 'a'.repeat(40);
const now = () => '2026-09-21T00:00:00.000Z';

function body(state) {
  return `## User Story\nAuthority cost\n\n## Scope\nFixed collector fixture\n\n## Acceptance Criteria\n- [x] Read-only\n\n## Verification Commands\n- [x] \`node --test scripts/tests/unit/task-tracker/lib/action-authority-cost.test.mjs\`\n\n<!-- aitm-last-known-state state="${state}" ts="2026-09-21T00:00:00Z" -->`;
}

function attemptFor({ actionId, state, values = {} }) {
  const issueBody = body(state);
  const scope = computeScopeIdentity({ repository: REPOSITORY, issue: ISSUE, body: issueBody });
  const overrides = typeof values === 'function' ? values({ issueBody, scope }) : values;
  const requests = [];
  const attempt = createObservationAttempt({
    repository: REPOSITORY,
    issue: ISSUE,
    boundaryId: `authority-cost:${actionId}:${ISSUE}`,
    now,
    read: async (request) => {
      requests.push({
        resource: request.resource,
        identity: request.identity,
        scope: request.scope,
        key: JSON.stringify([request.resource, request.identity, request.scope]),
      });
      const sources = {
        'issue-body': { number: ISSUE, body: issueBody, state: 'OPEN' },
        'project-board': { state, assignees: [] },
        'local-config': { repo: REPOSITORY, projectId: null, gateAssigneeMatch: false },
        'session-state': { active: `#${ISSUE}`, paused: false },
        worktree: { matches: true, headSha: HEAD, clean: true },
        occupancy: { available: true },
        'migration-journal': { active: false },
        'github-user': { login: 'operator' },
        'workflow-policy': {
          status: 'policy-compatible',
          repository: REPOSITORY,
          issue: ISSUE,
          scopeIdentity: scope,
          decisions: [],
        },
        delivery: {
          preflight: {
            ok: true,
            reasons: [],
            headSha: HEAD,
            bodyDigest: `sha256:${createHash('sha256').update(issueBody).digest('hex')}`,
          },
          reviewEvidence: { ok: true, mode: 'receipt-v1', reasons: [] },
          gateInput: {
            issueNumber: ISSUE,
            repository: REPOSITORY,
            body: issueBody,
            acceptedSha: HEAD,
            lineage: { deliveryTarget: 'trunk' },
          },
          mode: 'incorporated',
        },
        ...overrides,
      };
      const value = sources[request.identity] ?? sources[request.resource];
      return { ...request, value };
    },
  });
  return { attempt, issueBody, scope, requests };
}

const readyGuards = async () => ({ ok: true, status: 'ready', refusals: [], humanDecision: null });

async function measure(id, state, collect, values) {
  const fixture = attemptFor({ actionId: id, state, values });
  const result = await collect(fixture);
  return Object.freeze({
    id,
    scenarioId: `authority-cost.${id}.fixed-collector`,
    status: result.status,
    blockerCodes: result.blockers?.map(({ code }) => code) ?? [],
    blockers: result.blockers ?? [],
    requestCount: fixture.requests.length,
    requestKeys: fixture.requests.map(({ resource, identity }) => `${resource}:${identity}`),
    requests: fixture.requests,
  });
}

/** Run each shipped read-only collector once with fixed complete local fixtures. */
export async function measureFixedActionAuthorityReads() {
  return Object.freeze({
    method: 'createObservationAttempt-read-port-ledger/v1',
    actions: await Promise.all([
      measure(
        'bind',
        'plan',
        ({ attempt, scope }) =>
          collectSessionReadiness({
            actionId: 'bind',
            issue: ISSUE,
            stateBefore: { active: null, paused: false },
            config: { repo: REPOSITORY, preferences: { gateAssigneeMatch: false } },
            attempt,
            ports: { scope },
          }),
        { 'session-state': { active: null, paused: false } }
      ),
      measure(
        'resume',
        'plan',
        ({ attempt, scope }) =>
          collectSessionReadiness({
            actionId: 'resume',
            issue: ISSUE,
            stateBefore: { active: null, paused: true, lastActive: ISSUE },
            config: { repo: REPOSITORY, preferences: { gateAssigneeMatch: false } },
            attempt,
            ports: { scope, explicitTarget: true },
          }),
        { 'session-state': { active: null, paused: true, lastActive: ISSUE } }
      ),
      measure('promote', 'refine', ({ attempt, scope, issueBody }) =>
        collectEarlyPromoteReadiness({
          issue: ISSUE,
          fromState: 'refine',
          body: issueBody,
          attempt,
          ports: {
            scope,
            cfg: { repo: REPOSITORY },
            projectDir: process.cwd(),
            runGuards: readyGuards,
          },
        })
      ),
      measure('test', 'test', ({ attempt, scope, issueBody }) =>
        collectTestReadiness({
          issue: ISSUE,
          fromState: 'test',
          body: issueBody,
          head: HEAD,
          attempt,
          ports: { scope, cfg: { repo: REPOSITORY }, projectDir: process.cwd() },
        })
      ),
      measure('review', 'test', ({ attempt, scope, issueBody }) =>
        collectReviewReadiness({
          issue: ISSUE,
          fromState: 'test',
          body: issueBody,
          head: HEAD,
          attempt,
          ports: { scope, projectDir: process.cwd(), runGuards: readyGuards },
        })
      ),
      measure(
        'deliver',
        'review',
        ({ attempt, scope, issueBody }) =>
          collectDeliveryReadiness({ issue: ISSUE, attempt, ports: { scope, head: HEAD } }),
        ({ issueBody }) => ({
          delivery: {
            preflightInput: {
              issue: {
                number: ISSUE,
                state: 'OPEN',
                projectState: 'Review',
                body: issueBody,
                assignees: ['operator'],
                agentReviewPassed: true,
                reviewAuthorization: { mode: 'full-auto', standing: true, source: 'fixture' },
              },
              binding: { issueNumber: ISSUE, branch: 'feature/epic/1558', timerState: 'running' },
              lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
              pullRequests: [
                {
                  number: 99,
                  state: 'OPEN',
                  isDraft: false,
                  baseRefName: 'trunk',
                  headRefName: 'feature/epic/1558',
                  headRefOid: HEAD,
                  mergeable: 'MERGEABLE',
                },
              ],
              localHeadSha: HEAD,
              testReceiptSha: HEAD,
              acceptedReviewSha: HEAD,
              checks: {
                readable: true,
                required: [
                  { name: 'ci', headSha: HEAD, status: 'COMPLETED', conclusion: 'SUCCESS' },
                ],
              },
              dirtyPaths: [],
              config: {
                repo: REPOSITORY,
                assignee: 'operator',
                trunkRef: 'origin/trunk',
                repositoryMergeMethods: ['squash'],
                fullAutoMerge: { mechanism: 'provider-action', mergeMethod: 'squash' },
              },
              commitSubjects: ['[#1670] Authority cost'],
            },
            providerActionAvailable: true,
            manualReviewDecision: { status: 'authorized' },
            comments: [],
          },
        })
      ),
      measure(
        'close',
        'review',
        ({ attempt, scope, issueBody }) =>
          collectCloseReadiness({
            issue: ISSUE,
            attempt,
            ports: {
              scope,
              cfg: { repo: REPOSITORY },
              projectDir: process.cwd(),
              head: HEAD,
              runGuards: readyGuards,
            },
          }),
        ({ issueBody }) => ({
          'evidence:1670:1': {
            mode: 'ordinary',
            gateInput: {
              issueNumber: ISSUE,
              repository: REPOSITORY,
              body: issueBody,
              branch: 'feature/1670',
              acceptedSha: HEAD,
              lineage: { parentIssueNumber: 1558, deliveryTarget: 'feature/epic/1558' },
            },
          },
          'evidence:1670:2': {
            status: 'attributed',
            tip: {
              status: 'observed',
              remote: 'origin',
              ref: 'refs/heads/feature/epic/1558',
              sha: HEAD,
              objectComplete: true,
              shallow: false,
            },
          },
          'evidence:1670:3': { complete: true, children: [] },
        })
      ),
    ]),
  });
}
