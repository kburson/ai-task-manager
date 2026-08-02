import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  fieldOptionMap,
  gh,
  gql,
  projectItemForIssue,
  writeProjectFieldValue,
} from '../../../gh/lib/github-projects.mjs';
import {
  defaultFieldValues,
  formatIssueFieldDb,
  parseIssueFieldDb,
  stripIssueFieldDb,
} from '../../issue-field-db.mjs';
import { loadProjectFieldDefs, fieldIdFor, valueForProjectField } from '../../project-fields.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';
import { upsertPlannedEstimate } from '../refine-estimate-comment.mjs';
import { readTimingCommentBody, bodyOf } from '../../gh-timing-comment.mjs';
import { readEstimationStageTiming } from '../timing-row-reader.mjs';
import { parseVerificationReceipts } from '../verification-receipt.mjs';
import {
  listIssueCommentsSince,
  parsePreloadedIssueComments,
} from '../github-records/github-comment-store.mjs';
import { createAitmRecordEnvelope } from '../github-records/record-envelope.mjs';
import { buildEstimationForecast } from './forecast-model.mjs';
import { buildEstimationOutcome } from './outcome-builder.mjs';
import { ensureEstimationOutcome } from './outcome-writer.mjs';
import {
  applyPlanEstimateAuthority,
  upsertForecastReadyMarker,
} from './plan-estimate-authority.mjs';
import { writeEstimationRecord } from './renderers.mjs';
import { loadOrRefreshRubric } from './rubric-refresh.mjs';

const pexec = promisify(execFile);
const SINCE_EPOCH = '1970-01-01T00:00:00.000Z';
const PROJECT_RECORDS_QUERY = `
  query AitmEstimationCorpus($project: ID!, $after: String) {
    node(id: $project) {
      ... on ProjectV2 {
        items(first: 100, after: $after) {
          nodes {
            content {
              ... on Issue {
                number
                comments(first: 100) {
                  nodes {
                    __typename id body updatedAt
                    issue { number repository { nameWithOwner } }
                  }
                  pageInfo { hasNextPage }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const ISSUE_PROJECTION_QUERY = `
  query AitmEstimationProjection($owner: String!, $name: String!, $issue: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        body
        comments(first: 100) {
          nodes {
            __typename id databaseId body updatedAt
            issue { number repository { nameWithOwner } }
          }
          pageInfo { hasNextPage }
        }
        projectItems(first: 20) {
          nodes {
            id
            project { id }
            fieldValues(first: 100) {
              nodes {
                ... on ProjectV2ItemFieldNumberValue {
                  number
                  field { ... on ProjectV2FieldCommon { id } }
                }
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2FieldCommon { id } }
                }
              }
            }
          }
        }
      }
    }
  }
`;
const CHILD_OUTCOMES_QUERY = `
  query AitmEstimationChildOutcomes($owner: String!, $name: String!, $issue: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        subIssues(first: 100) {
          nodes {
            number
            comments(first: 100) {
              nodes {
                __typename id body updatedAt
                issue { number repository { nameWithOwner } }
              }
              pageInfo { hasNextPage }
            }
          }
          pageInfo { hasNextPage }
        }
      }
    }
  }
`;

function fail(category) {
  throw new Error(`estimation-runtime:${category}`);
}

function splitRepository(repository) {
  const [owner, name] = String(repository).split('/');
  if (!owner || !name) fail('repository');
  return { owner, name };
}

function defaultGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

async function defaultCreateIssueComment({ repository, issue, body }) {
  const output = await gh(
    ['api', `repos/${repository}/issues/${issue}/comments`, '--method', 'POST', '--input', '-'],
    { input: JSON.stringify({ body }) }
  );
  return JSON.parse(output);
}

function plannedAppendix(nodes, issueNumber) {
  const marker = new RegExp(`<!--\\s*aitm-refined-estimate:\\s*${issueNumber}\\s*-->`);
  const body = nodes.find((node) => marker.test(node.body))?.body ?? '';
  const size = body.match(/^\|\s*Size\s*\|\s*([^|]+)\|\s*([^|]+)\|/m);
  const estimate = body.match(/^\|\s*Estimate \(h\)\s*\|\s*([^|]+)\|\s*([^|]+)\|/m);
  if (!size || !estimate) return null;
  const refineHours = Number(estimate[1].trim());
  const planHours = Number(estimate[2].trim());
  if (!Number.isFinite(refineHours) || !Number.isFinite(planHours)) return null;
  return {
    refine: { size: size[1].trim(), humanHours: refineHours },
    plan: { size: size[2].trim(), humanHours: planHours },
  };
}

function recordsForProjection(records) {
  const forecasts = records.filter(
    (record) => record.envelope.recordType === 'estimation-forecast'
  );
  const successorById = new Map();
  for (const record of forecasts) {
    if (record.envelope.supersedes !== null) {
      successorById.set(record.envelope.supersedes, record.envelope.recordId);
    }
  }
  return forecasts.map((record) => ({
    recordId: record.envelope.recordId,
    payloadHash: record.envelope.payloadHash,
    commentNodeId: record.commentNodeId,
    supersededBy: successorById.get(record.envelope.recordId) ?? null,
  }));
}

export function createGitHubEstimationRecordIo({ graphql = defaultGraphql, rest } = {}) {
  const resolvedRest = rest ?? { createIssueComment: defaultCreateIssueComment };
  return {
    graphql,
    rest: resolvedRest,
    async listIssueRecords({ repository, issue }) {
      return listIssueCommentsSince({
        since: SINCE_EPOCH,
        repository,
        issue,
        graphql,
      });
    },
    async write({ envelope }) {
      return writeEstimationRecord({
        envelope,
        repository: envelope.repository,
        issue: envelope.issue,
        graphql,
        rest: resolvedRest,
      });
    },
  };
}

export async function loadProjectEstimationCorpus({ cfg, io, graphql = io?.graphql } = {}) {
  if (!cfg?.projectId || !cfg?.repo || typeof graphql !== 'function') fail('corpus-input');
  const records = [];
  let after = null;
  const cursors = new Set();
  for (let page = 0; page < 1000; page += 1) {
    const response = await graphql({
      query: PROJECT_RECORDS_QUERY,
      variables: { project: cfg.projectId, after },
    });
    if (Array.isArray(response?.errors) && response.errors.length > 0) fail('corpus-response');
    const connection = response?.data?.node?.items;
    if (!Array.isArray(connection?.nodes)) fail('corpus-response');
    for (const item of connection.nodes) {
      const issue = item.content;
      if (!Number.isInteger(issue?.number)) continue;
      const comments = issue.comments;
      if (!Array.isArray(comments?.nodes)) fail('corpus-response');
      const parsed = comments.pageInfo?.hasNextPage
        ? await io.listIssueRecords({ repository: cfg.repo, issue: issue.number })
        : parsePreloadedIssueComments({
            nodes: comments.nodes,
            repository: cfg.repo,
            issue: issue.number,
          });
      records.push(...parsed);
    }
    if (connection.pageInfo?.hasNextPage !== true) return records;
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== 'string' || cursor === '' || cursors.has(cursor))
      fail('corpus-pagination');
    cursors.add(cursor);
    after = cursor;
  }
  fail('corpus-pagination');
}

export function createAdaptivePlanRuntime({ cfg, deps = {} } = {}) {
  if (!cfg?.repo || !cfg?.projectId) fail('plan-config');
  if (!Number.isInteger(cfg.estimationRubricIssue) || cfg.estimationRubricIssue <= 0) {
    fail('rubric-issue-unconfigured');
  }
  const io = deps.recordIo ?? createGitHubEstimationRecordIo(deps);
  const graphql = deps.graphql ?? io.graphql;
  const fieldDefs = (deps.loadProjectFieldDefs ?? loadProjectFieldDefs)();
  const { owner, name } = splitRepository(cfg.repo);
  let lastItemId = null;
  let supersededForecastRecordId = null;
  let corpusPromise = null;
  const corpus = () =>
    (corpusPromise ??= (deps.loadProjectEstimationCorpus ?? loadProjectEstimationCorpus)({
      cfg,
      io,
      graphql,
    }));

  const readProjection = async (issueNumber) => {
    const response = await graphql({
      query: ISSUE_PROJECTION_QUERY,
      variables: { owner, name, issue: issueNumber },
    });
    const issue = response?.data?.repository?.issue;
    if (!issue || issue.comments?.pageInfo?.hasNextPage === true) fail('projection-response');
    const item = issue.projectItems?.nodes?.find((node) => node.project?.id === cfg.projectId);
    if (!item) fail('project-item');
    lastItemId = item.id;
    const byFieldId = new Map(
      (item.fieldValues?.nodes ?? []).map((node) => [node.field?.id, node.number ?? node.name])
    );
    const board = {
      size: byFieldId.get(fieldIdFor(cfg, 'size')) ?? null,
      estimate: byFieldId.get(fieldIdFor(cfg, 'estimate')) ?? null,
    };
    const status = byFieldId.get(fieldIdFor(cfg, 'status') || cfg.kanbanFieldId);
    const parsedFields = parseIssueFieldDb(issue.body);
    const records = parsePreloadedIssueComments({
      nodes: issue.comments.nodes,
      repository: cfg.repo,
      issue: issueNumber,
    });
    return {
      lifecycleState: String(status ?? '').toLowerCase(),
      refineAppendix: plannedAppendix(issue.comments.nodes, issueNumber),
      board,
      bodyFields: {
        size: parsedFields.ok ? (parsedFields.values.size ?? null) : null,
        estimate: parsedFields.ok ? (parsedFields.values.estimate ?? null) : null,
      },
      forecasts: recordsForProjection(records),
      readyForecastRecordId:
        issue.body.match(
          /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i
        )?.[1] ?? null,
      frozenForecastRecordId:
        String(status ?? '').toLowerCase() === 'plan'
          ? null
          : (issue.body.match(
              /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i
            )?.[1] ?? null),
    };
  };

  const writeBoard = async (key, value) => {
    if (!lastItemId) {
      lastItemId = (
        await (deps.projectItemForIssue ?? projectItemForIssue)({
          repo: cfg.repo,
          projectId: cfg.projectId,
          issueNumber: value.issueNumber,
        })
      ).itemId;
    }
    const definition = fieldDefs.find((entry) => entry.key === key);
    const fieldId = fieldIdFor(cfg, key);
    if (!lastItemId || !definition || !fieldId) fail(`board-${key}`);
    const optionMap =
      key === 'size' ? await (deps.fieldOptionMap ?? fieldOptionMap)(cfg.projectId) : {};
    const wrapped = valueForProjectField(value.value, definition.type);
    if (!wrapped) fail(`board-${key}`);
    const ok = await (deps.writeProjectFieldValue ?? writeProjectFieldValue)({
      projectId: cfg.projectId,
      itemId: lastItemId,
      fieldId,
      value: wrapped,
      optionMap,
    });
    if (!ok) fail(`board-${key}`);
  };

  return {
    readRefineEstimate: async ({ issueNumber }) => {
      const projection = await readProjection(issueNumber);
      if (!projection.board.size || typeof projection.board.estimate !== 'number') {
        fail('refine-estimate');
      }
      supersededForecastRecordId =
        projection.forecasts.find((forecast) => forecast.supersededBy == null)?.recordId ?? null;
      return { size: projection.board.size, humanHours: projection.board.estimate };
    },
    loadRubric: async () => {
      const allRecords = await corpus();
      const result = await loadOrRefreshRubric({
        cfg,
        deps: {
          listRubricRecords: async () => [
            ...allRecords.filter(
              (record) =>
                record.envelope.issue === cfg.estimationRubricIssue &&
                record.envelope.recordType === 'estimation-rubric'
            ),
            ...(
              await io.listIssueRecords({
                repository: cfg.repo,
                issue: cfg.estimationRubricIssue,
              })
            ).filter(
              (record) =>
                record.envelope.recordType === 'estimation-rubric' &&
                !allRecords.some(
                  (existing) => existing.envelope.recordId === record.envelope.recordId
                )
            ),
          ],
          listEligibleOutcomes: async () =>
            allRecords
              .filter((record) => record.envelope.recordType === 'estimation-outcome')
              .map((record) => ({
                recordId: record.envelope.recordId,
                createdAt: record.envelope.createdAt,
                payload: record.envelope.payload,
              })),
          writeRubric: async ({ issue, payload, predecessorRecordId }) =>
            io.write({
              envelope: createAitmRecordEnvelope({
                recordType: 'estimation-rubric',
                repository: cfg.repo,
                issue,
                payload,
                actor: 'aitm/rubric-refresh',
                predecessor: predecessorRecordId,
                supersedes: predecessorRecordId,
              }),
            }),
        },
      });
      return { recordId: result.recordId, payload: result.rubric };
    },
    listComparableOutcomes: async ({ planInput }) => {
      const allowed = new Set(planInput.comparableIssueIds ?? []);
      return (await corpus())
        .filter(
          (record) =>
            record.envelope.recordType === 'estimation-outcome' &&
            (allowed.size === 0 || allowed.has(record.envelope.issue))
        )
        .map((record) => ({
          recordId: record.envelope.recordId,
          payload: record.envelope.payload,
        }));
    },
    buildForecast: buildEstimationForecast,
    createForecastEnvelope: ({ repository, issue, payload }) => {
      const versionedPayload = {
        ...payload,
        supersedesForecastRecordId: supersededForecastRecordId,
      };
      return createAitmRecordEnvelope({
        recordType: 'estimation-forecast',
        repository,
        issue,
        payload: versionedPayload,
        actor: 'aitm/plan-estimate',
        predecessor: supersededForecastRecordId,
        supersedes: supersededForecastRecordId,
      });
    },
    applyAuthority: ({ issueNumber, refine, forecastEnvelope }) =>
      applyPlanEstimateAuthority({
        issueNumber,
        refine,
        forecastEnvelope,
        deps: {
          readProjection: () => readProjection(issueNumber),
          writeRefineAppendix: ({ refine: previous, plan }) =>
            (deps.upsertPlannedEstimate ?? upsertPlannedEstimate)({
              cfg,
              issueNumber,
              refine: { size: previous.size, estimate: previous.humanHours },
              plan: { size: plan.size, estimate: plan.humanHours },
              rationale: plan.rationale,
            }),
          writeBoardEstimate: ({ estimate }) =>
            writeBoard('estimate', { issueNumber, value: estimate }),
          writeBoardSize: ({ size }) => writeBoard('size', { issueNumber, value: size }),
          writeBodyFields: ({ estimate, size }) =>
            (deps.mutateIssueBody ?? mutateIssueBody)({
              issueNumber,
              repo: cfg.repo,
              deps: { pexec },
              mutate: (base) => {
                const parsed = parseIssueFieldDb(base);
                const existing = parsed.ok ? parsed.values : defaultFieldValues(fieldDefs);
                return `${stripIssueFieldDb(base)}\n\n${formatIssueFieldDb({
                  ...existing,
                  size,
                  estimate,
                })}\n`;
              },
            }),
          writeForecast: ({ envelope }) => io.write({ envelope }),
          writeForecastReadyMarker: ({ recordId }) =>
            (deps.mutateIssueBody ?? mutateIssueBody)({
              issueNumber,
              repo: cfg.repo,
              deps: { pexec },
              mutate: (base) => upsertForecastReadyMarker(base, recordId),
            }),
        },
      }),
  };
}

function verificationEvidence(body) {
  const groups = new Map();
  for (const receipt of parseVerificationReceipts(body)) {
    for (const command of receipt.commands ?? []) {
      if (!groups.has(command.classification)) groups.set(command.classification, []);
      groups.get(command.classification).push(command);
    }
  }
  return [...groups.entries()].map(([classification, commands]) => {
    const executions = commands.filter((command) => command.reusedFrom === undefined);
    const actual = executions.length > 0 ? executions : [commands[0]];
    return {
      classification,
      durationMs: actual.reduce((sum, command) => sum + Number(command.durationMs ?? 0), 0),
      attempts: actual.length,
    };
  });
}

function costEvidence(verification) {
  const repeated = verification.filter((command) => command.attempts > 1);
  const avoidableProcessWasteHours = Number(
    repeated
      .reduce(
        (sum, command) =>
          sum + (command.durationMs * (command.attempts - 1)) / command.attempts / 3_600_000,
        0
      )
      .toFixed(4)
  );
  return {
    avoidableProcessWasteHours,
    drivers: repeated.map((command) => ({
      kind: `repeated-${command.classification}`,
      hours: Number(
        ((command.durationMs * (command.attempts - 1)) / command.attempts / 3_600_000).toFixed(4)
      ),
    })),
  };
}

async function defaultDiffEvidence({ projectDir, trunk = 'origin/trunk' }) {
  const { stdout } = await pexec('git', ['diff', '--name-only', `${trunk}...HEAD`], {
    cwd: projectDir,
  });
  const files = stdout
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
  const modules = [...new Set(files.map((file) => file.split('/').slice(0, 2).join('/')))].sort();
  const lanes = [
    ['unit', /(?:^|\/)unit(?:\/|$)|\.unit\./],
    ['integration', /(?:^|\/)integration(?:\/|$)|\.integration\./],
    ['slow', /(?:^|\/)slow(?:\/|$)|\.slow\./],
  ]
    .filter(([, pattern]) => files.some((file) => pattern.test(file)))
    .map(([lane]) => lane);
  return {
    filesChanged: files.length,
    modules,
    lanes,
    dependencyBreadth: new Set(files.map((file) => file.split('/')[0])).size,
  };
}

export function createEstimationOutcomeRuntime({ cfg, projectDir, deps = {} } = {}) {
  if (!cfg?.repo || !projectDir) fail('outcome-config');
  const io = deps.recordIo ?? createGitHubEstimationRecordIo(deps);
  const graphql = deps.graphql ?? io.graphql;
  const { owner, name } = splitRepository(cfg.repo);

  const childOutcomeRecordIds = async (issueNumber) => {
    const response = await graphql({
      query: CHILD_OUTCOMES_QUERY,
      variables: { owner, name, issue: issueNumber },
    });
    const children = response?.data?.repository?.issue?.subIssues;
    if (!children || children.pageInfo?.hasNextPage === true) fail('child-outcomes');
    const ids = [];
    for (const child of children.nodes ?? []) {
      if (child.comments?.pageInfo?.hasNextPage === true) fail('child-outcomes');
      const outcomes = parsePreloadedIssueComments({
        nodes: child.comments?.nodes ?? [],
        repository: cfg.repo,
        issue: child.number,
      })
        .filter((record) => record.envelope.recordType === 'estimation-outcome')
        .toSorted((left, right) => right.envelope.createdAt.localeCompare(left.envelope.createdAt));
      if (outcomes.length === 0) fail('child-outcomes');
      ids.push(outcomes[0].envelope.recordId);
    }
    return ids;
  };

  return {
    async ensure({ issueNumber, forecastRecordId, body }) {
      const records = await io.listIssueRecords({ repository: cfg.repo, issue: issueNumber });
      const forecastRecord = records.find(
        (record) =>
          record.envelope.recordType === 'estimation-forecast' &&
          record.envelope.recordId === forecastRecordId
      );
      if (!forecastRecord) fail('forecast');
      const timingResult = await (deps.readTimingCommentBody ?? readTimingCommentBody)({
        issueNumber,
        repo: cfg.repo,
      });
      if (timingResult?.status === 'error') fail('timing');
      const timingBody = bodyOf(timingResult);
      const verification = verificationEvidence(body);
      const children = await (deps.childOutcomeRecordIds ?? childOutcomeRecordIds)(issueNumber);
      const outcomePayload = buildEstimationOutcome({
        issue: issueNumber,
        forecast: forecastRecord.envelope,
        timing: readEstimationStageTiming(timingBody.split('\n')),
        verification,
        diff: await (deps.readDiffEvidence ?? defaultDiffEvidence)({
          projectDir,
          trunk: cfg.trunkRef ?? 'origin/trunk',
        }),
        review: {
          fixCycles: timingBody.split('\n').filter((line) => /\|\s*review:failed\s*\|/i.test(line))
            .length,
        },
        cost: costEvidence(verification),
        kind: children.length > 0 ? 'epic' : 'story',
        childOutcomeRecordIds: children,
      });
      return ensureEstimationOutcome({
        issue: issueNumber,
        forecast: forecastRecord.envelope,
        outcomePayload,
        deps: {
          listOutcomeRecords: async () =>
            records.filter((record) => record.envelope.recordType === 'estimation-outcome'),
          createOutcomeEnvelope: ({ issue, payload }) =>
            createAitmRecordEnvelope({
              recordType: 'estimation-outcome',
              repository: cfg.repo,
              issue,
              payload,
              actor: 'aitm/close',
            }),
          writeOutcome: ({ envelope }) => io.write({ envelope }),
        },
      });
    },
  };
}
