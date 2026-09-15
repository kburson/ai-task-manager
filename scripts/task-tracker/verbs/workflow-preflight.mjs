// @story #1627
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { listIssueCommentsSince } from '../lib/github-records/github-comment-store.mjs';
import { normalizeStateId } from '../lib/lifecycle-policy/index.mjs';
import { RUNTIME_REL } from '../paths.mjs';
import { loadState } from '../state.mjs';
import { WORKFLOW_POLICY_CAPABILITY } from '../lib/workflow-policy/catalog.mjs';
import {
  evaluateWorkflowPreflight,
  formatWorkflowPreflightReport,
  indeterminateWorkflowPreflightReport,
} from '../lib/workflow-policy/preflight.mjs';
import {
  buildWorkflowPreflightSnapshot,
  WORKFLOW_STATES,
} from '../lib/workflow-policy/snapshot.mjs';

function fail(category) {
  throw new TypeError(`workflow-preflight:${category}`);
}

export function parseWorkflowPreflightArgs(argv = []) {
  const args = [...argv];
  let issue = null;
  let target = null;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index]);
    if (token === '--json') {
      if (json) fail('usage');
      json = true;
      continue;
    }
    if (token === '--target') {
      if (target !== null || typeof args[index + 1] !== 'string') fail('usage');
      target = String(args[++index]).toLowerCase();
      continue;
    }
    const match = token.match(/^#?(\d+)$/);
    if (!match || issue !== null) fail('usage');
    issue = Number(match[1]);
  }
  if (!Number.isSafeInteger(issue) || issue <= 0 || target === null) fail('usage');
  if (!WORKFLOW_STATES.includes(target)) fail('target');
  return Object.freeze({ issue, target, json });
}

function normalizeRecord(record) {
  return Object.freeze({
    commentNodeId: record.commentNodeId,
    envelope: record.envelope,
    body: record.body,
    authorLogin: record.authorLogin,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function parseFields(body) {
  const match = /<!--\s*aitm-fields:\s*(\{[^\n]*\})\s*-->/i.exec(String(body || ''));
  if (!match) return {};
  try {
    return JSON.parse(match[1]).values || {};
  } catch {
    return {};
  }
}

function stateFromBody(body) {
  const match = /<!--\s*aitm-last-known-state\s+state="([^"]+)"/i.exec(String(body || ''));
  return normalizeStateId(match?.[1]);
}

export function createWorkflowPreflightRuntime(ctx, deps = {}) {
  const graphql = deps.graphql || ((query, variables) => gql(query, variables));
  const run = deps.run || ctx.pexec;
  const readState = deps.readState || (() => loadState(ctx.statePath));
  const { owner, repoName } = splitRepo(ctx.cfg.repo);
  let issuePromise = null;
  const readIssueNode = async (issue) => {
    if (issuePromise === null) {
      issuePromise = graphql(
        `
          query WorkflowPreflightIssue($owner: String!, $repo: String!, $issue: Int!) {
            repository(owner: $owner, name: $repo) {
              issue(number: $issue) {
                number
                body
                assignees(first: 20) {
                  nodes {
                    login
                  }
                }
                projectItems(first: 20) {
                  nodes {
                    project {
                      id
                    }
                    fieldValueByName(name: "Status") {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        { owner, repo: repoName, issue }
      ).then((data) => data?.repository?.issue ?? null);
    }
    return issuePromise;
  };
  return Object.freeze({
    async readIssue(issue) {
      const node = await readIssueNode(issue);
      if (node?.number !== issue || typeof node.body !== 'string') fail('issue-read');
      const projectItem = (node.projectItems?.nodes || []).find(
        (item) => item.project?.id === ctx.cfg.projectId
      );
      const liveState = normalizeStateId(projectItem?.fieldValueByName?.name);
      const recordedState = stateFromBody(node.body);
      const conflicts = [];
      if (liveState && recordedState && liveState !== recordedState) {
        conflicts.push({
          code: 'state-drift',
          detail: `${recordedState}->${liveState}`,
          remediation: `run /task reconcile ${issue} accept-live or revert-to-recorded`,
        });
      }
      const evidence = {};
      if ((node.assignees?.nodes || []).some(({ login }) => typeof login === 'string')) {
        evidence['delivery.ownership'] = {
          state: 'satisfied',
          reference: `github://${ctx.cfg.repo}/issues/${issue}/assignees`,
        };
      }
      if (readState()?.active === `#${issue}`) {
        evidence['delivery.issue-binding'] = {
          state: 'satisfied',
          reference: 'session-state://active-binding',
        };
      }
      if (liveState && recordedState && liveState === recordedState) {
        evidence['delivery.state-contiguity'] = {
          state: 'satisfied',
          reference: 'issue-body://aitm-last-known-state',
        };
      }
      return {
        number: node.number,
        body: node.body,
        currentState: liveState || recordedState,
        projectFields: { status: projectItem?.fieldValueByName?.name || null },
        evidence,
        conflicts,
      };
    },
    async listRecords(issue) {
      return (
        await listIssueCommentsSince({
          repository: ctx.cfg.repo,
          issue,
          since: '1970-01-01T00:00:00.000Z',
          graphql: ({ query, variables }) => graphql(query, variables).then((data) => ({ data })),
        })
      ).map(normalizeRecord);
    },
    async readRepository() {
      const [{ stdout: head }, { stdout: status }] = await Promise.all([
        run('git', ['rev-parse', 'HEAD'], { cwd: ctx.projectDir, encoding: 'utf8' }),
        run('git', ['status', '--porcelain'], { cwd: ctx.projectDir, encoding: 'utf8' }),
      ]);
      return {
        headSha: String(head).trim(),
        clean: String(status).trim() === '',
        evidence: {},
        externalProtection: {
          state: 'unknown',
          reference: `github://${ctx.cfg.repo}/branch-protection`,
        },
      };
    },
    async readDependencies(issue) {
      const node = await readIssueNode(issue);
      const blockedBy = parseFields(node?.body).blockedBy;
      if (Array.isArray(blockedBy)) return blockedBy.map((value) => ({ issue: Number(value) }));
      if (typeof blockedBy === 'string' && blockedBy.trim()) {
        return blockedBy
          .split(',')
          .map((value) => Number(value.replace(/\D/g, '')))
          .filter(Number.isSafeInteger)
          .map((value) => ({ issue: value }));
      }
      return [];
    },
    async readSessionPolicy() {
      return {
        gateAnalysisToDevelopment: ctx.cfg.gateAnalysisToDevelopment !== false,
        gateReviewToDone: ctx.cfg.gateReviewToDone !== false,
        fullAutoMerge: ctx.cfg.fullAutoMerge || null,
        source: RUNTIME_REL.config,
      };
    },
    async readRuntimeCapability() {
      return WORKFLOW_POLICY_CAPABILITY;
    },
  });
}

export async function runWorkflowPreflight({
  repository,
  issue,
  target,
  now = new Date().toISOString(),
  runtime,
} = {}) {
  try {
    const snapshot = await buildWorkflowPreflightSnapshot({
      repository,
      issue,
      targetState: target,
      now,
      runtime,
    });
    return evaluateWorkflowPreflight(snapshot);
  } catch (error) {
    return indeterminateWorkflowPreflightReport({
      repository,
      issue,
      targetState: target,
      inspectedAt: now,
      error,
    });
  }
}

export { formatWorkflowPreflightReport };

export async function verbWorkflowPreflight(ctx) {
  let parsed;
  try {
    parsed = parseWorkflowPreflightArgs(ctx.rest);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.stderr.write('Usage: /task workflow-preflight #N --target <state> [--json]\n');
    process.exitCode = 2;
    return;
  }
  const report = await runWorkflowPreflight({
    repository: ctx.cfg.repo,
    issue: parsed.issue,
    target: parsed.target,
    runtime: createWorkflowPreflightRuntime(ctx),
  });
  process.stdout.write(`${formatWorkflowPreflightReport(report, { json: parsed.json })}\n`);
  if (report.status === 'blocked') process.exitCode = 6;
  else if (report.status === 'indeterminate') process.exitCode = 7;
}
