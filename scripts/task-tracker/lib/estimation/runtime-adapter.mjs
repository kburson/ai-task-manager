import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  fieldOptionMap,
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
import { parseValidatedVerificationReceipts } from '../verification-receipt.mjs';
import {
  listIssueCommentsSince,
  parsePreloadedIssueComments,
} from '../github-records/github-comment-store.mjs';
import { createAitmRecordEnvelope, hashRecordPayload } from '../github-records/record-envelope.mjs';
import { buildEstimationForecast } from './forecast-model.mjs';
import { buildEstimationOutcome } from './outcome-builder.mjs';
import { ensureEstimationOutcome } from './outcome-writer.mjs';
import {
  adoptLegacyPlanForecast,
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
            id
            content {
              ... on Issue {
                id
                number
              }
            }
            fieldValues(first: 100) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2FieldCommon { id } }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const PROJECT_ITEM_FIELD_VALUES_QUERY = `
  query AitmEstimationCorpusFieldValues($item: ID!, $after: String!) {
    node(id: $item) {
      ... on ProjectV2Item {
        id
        fieldValues(first: 100, after: $after) {
          nodes {
            ... on ProjectV2ItemFieldSingleSelectValue {
              name
              field { ... on ProjectV2FieldCommon { id } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const DONE_ISSUE_RECORDS_QUERY = `
  query AitmEstimationDoneRecords($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Issue {
        id
        number
        comments(first: 100) {
          nodes {
            __typename id body updatedAt
            issue { number repository { nameWithOwner } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const ISSUE_PROJECTION_COMMENTS_QUERY = `
  query AitmEstimationProjectionComments(
    $owner: String!
    $name: String!
    $issue: Int!
    $after: String!
  ) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        number
        repository { nameWithOwner }
        comments(first: 100, after: $after) {
          nodes {
            __typename id databaseId body updatedAt
            issue { number repository { nameWithOwner } }
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
          pageInfo { hasNextPage endCursor }
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
  query AitmEstimationChildOutcomes(
    $owner: String!
    $name: String!
    $issue: Int!
    $after: String
  ) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        number
        repository { nameWithOwner }
        subIssues(first: 100, after: $after) {
          nodes { number }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;
const ISSUE_NODE_QUERY = `
  query AitmEstimationIssueNode($owner: String!, $name: String!, $issue: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $issue) { id }
    }
  }
`;
const ADD_COMMENT_MUTATION = `
  mutation AitmEstimationAddComment($subjectId: ID!, $body: String!) {
    addComment(input: { subjectId: $subjectId, body: $body }) {
      commentEdge { node { id } }
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

function createGraphqlIssueComment(graphql) {
  return async ({ repository, issue, body }) => {
    const { owner, name } = splitRepository(repository);
    const issueResponse = await graphql({
      query: ISSUE_NODE_QUERY,
      variables: { owner, name, issue },
    });
    if (Array.isArray(issueResponse?.errors) && issueResponse.errors.length > 0)
      fail('comment-issue');
    const subjectId = issueResponse?.data?.repository?.issue?.id;
    if (typeof subjectId !== 'string' || subjectId === '') fail('comment-issue');
    const mutationResponse = await graphql({
      query: ADD_COMMENT_MUTATION,
      variables: { subjectId, body },
    });
    if (Array.isArray(mutationResponse?.errors) && mutationResponse.errors.length > 0)
      fail('comment-write');
    const nodeId = mutationResponse?.data?.addComment?.commentEdge?.node?.id;
    if (typeof nodeId !== 'string' || nodeId === '') fail('comment-write');
    return { node_id: nodeId };
  };
}

function plannedAppendix(nodes, issueNumber) {
  const marker = new RegExp(`<!--\\s*aitm-refined-estimate:\\s*${issueNumber}\\s*-->`);
  const body = nodes.find((node) => marker.test(node.body))?.body ?? '';
  const appendixStart = body.search(/^###\s+Planned Estimate\s*$/m);
  if (appendixStart < 0) return null;
  const appendix = body.slice(appendixStart);
  const size = appendix.match(/^\|\s*Size\s*\|\s*([^|]+)\|\s*([^|]+)\|/m);
  const estimate = appendix.match(/^\|\s*Estimate \(h\)\s*\|\s*([^|]+)\|\s*([^|]+)\|/m);
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
    payload: record.envelope.payload,
    envelope: record.envelope,
    commentNodeId: record.commentNodeId,
    supersededBy: successorById.get(record.envelope.recordId) ?? null,
  }));
}

export function estimationOutcomeSamples(records) {
  if (!Array.isArray(records)) fail('rubric-records');
  const forecastsById = new Map(
    records
      .filter((record) => record.envelope.recordType === 'estimation-forecast')
      .map((record) => [record.envelope.recordId, record.envelope])
  );
  return records
    .filter(
      (record) =>
        record.envelope.recordType === 'estimation-outcome' &&
        record.envelope.payload.kind === 'story'
    )
    .map((record) => {
      const forecast = forecastsById.get(record.envelope.payload.forecastRecordId);
      if (!forecast || forecast.issue !== record.envelope.issue) {
        fail('rubric-outcome-forecast');
      }
      return {
        recordId: record.envelope.recordId,
        createdAt: record.envelope.createdAt,
        payload: record.envelope.payload,
        forecastPayload: forecast.payload,
      };
    });
}

async function loadProjectionComments({ graphql, owner, name, issueNumber, connection }) {
  if (!Array.isArray(connection?.nodes)) fail('projection-response');
  if (typeof connection.pageInfo?.hasNextPage !== 'boolean') fail('projection-pagination');
  const comments = [...connection.nodes];
  const seenIds = new Set();
  for (const comment of comments) {
    if (typeof comment?.id !== 'string' || seenIds.has(comment.id)) fail('projection-pagination');
    seenIds.add(comment.id);
  }
  const seenCursors = new Set();
  let pageInfo = connection.pageInfo;
  for (let page = 0; page < 1000 && pageInfo?.hasNextPage === true; page += 1) {
    const after = pageInfo.endCursor;
    if (typeof after !== 'string' || after === '' || seenCursors.has(after)) {
      fail('projection-pagination');
    }
    seenCursors.add(after);
    const response = await graphql({
      query: ISSUE_PROJECTION_COMMENTS_QUERY,
      variables: { owner, name, issue: issueNumber, after },
    });
    if (Array.isArray(response?.errors) && response.errors.length > 0) fail('projection-response');
    const responseIssue = response?.data?.repository?.issue;
    if (
      responseIssue?.number !== issueNumber ||
      responseIssue?.repository?.nameWithOwner !== `${owner}/${name}` ||
      !Array.isArray(responseIssue.comments?.nodes)
    ) {
      fail('projection-response');
    }
    if (typeof responseIssue.comments.pageInfo?.hasNextPage !== 'boolean')
      fail('projection-pagination');
    if (responseIssue.comments.pageInfo.hasNextPage && responseIssue.comments.nodes.length === 0) {
      fail('projection-pagination');
    }
    for (const comment of responseIssue.comments.nodes) {
      if (typeof comment?.id !== 'string' || seenIds.has(comment.id)) fail('projection-pagination');
      seenIds.add(comment.id);
      comments.push(comment);
    }
    pageInfo = responseIssue.comments.pageInfo;
  }
  if (pageInfo?.hasNextPage === true) fail('projection-pagination');
  return comments;
}

function forecastGenerationHash(payload) {
  const { supersedesForecastRecordId: _supersedes, ...generation } = payload;
  return hashRecordPayload(generation);
}

export function createGitHubEstimationRecordIo({ graphql = defaultGraphql, rest } = {}) {
  const resolvedRest = rest ?? { createIssueComment: createGraphqlIssueComment(graphql) };
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

export async function loadForecastProjection({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg?.repo || !cfg?.projectId || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    fail('projection-input');
  }
  const io = deps.recordIo ?? createGitHubEstimationRecordIo(deps);
  const graphql = deps.graphql ?? io.graphql;
  const { owner, name } = splitRepository(cfg.repo);
  const response = await graphql({
    query: ISSUE_PROJECTION_QUERY,
    variables: { owner, name, issue: issueNumber },
  });
  if (Array.isArray(response?.errors) && response.errors.length > 0) fail('projection-response');
  const issue = response?.data?.repository?.issue;
  if (!issue) fail('projection-response');
  const item = issue.projectItems?.nodes?.find((node) => node.project?.id === cfg.projectId);
  if (!item) fail('project-item');
  const byFieldId = new Map(
    (item.fieldValues?.nodes ?? []).map((node) => [node.field?.id, node.number ?? node.name])
  );
  const comments = await loadProjectionComments({
    graphql,
    owner,
    name,
    issueNumber,
    connection: issue.comments,
  });
  const records = parsePreloadedIssueComments({
    nodes: comments,
    repository: cfg.repo,
    issue: issueNumber,
  });
  const forecasts = recordsForProjection(records);
  const activeForecastRecordIds = forecasts
    .filter((record) => record.supersededBy === null)
    .map((record) => record.recordId);
  const readyForecastRecordId =
    String(issue.body ?? '').match(
      /<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->/i
    )?.[1] ?? null;
  const parsedFields = parseIssueFieldDb(issue.body);
  return {
    forecast: forecasts.find((record) => record.recordId === readyForecastRecordId) ?? null,
    activeForecastRecordIds,
    board: {
      size: byFieldId.get(fieldIdFor(cfg, 'size')) ?? null,
      estimate: byFieldId.get(fieldIdFor(cfg, 'estimate')) ?? null,
    },
    bodyFields: {
      size: parsedFields.ok ? (parsedFields.values.size ?? null) : null,
      estimate: parsedFields.ok ? (parsedFields.values.estimate ?? null) : null,
    },
  };
}

export function refineEstimateFromProjection(projection) {
  const source = projection?.refineAppendix?.refine ?? {
    size: projection?.board?.size,
    humanHours: projection?.board?.estimate,
  };
  if (
    typeof source.size !== 'string' ||
    source.size === '' ||
    typeof source.humanHours !== 'number' ||
    !Number.isFinite(source.humanHours) ||
    source.humanHours < 0
  ) {
    fail('refine-estimate');
  }
  return { size: source.size, humanHours: source.humanHours };
}

export async function loadProjectEstimationCorpus({ cfg, io, graphql = io?.graphql } = {}) {
  if (!cfg?.projectId || !cfg?.repo || typeof graphql !== 'function') fail('corpus-input');
  const records = [];
  const candidates = new Map();
  const statusFieldId = fieldIdFor(cfg, 'status') || cfg.kanbanFieldId;
  let after = null;
  const cursors = new Set();
  let projectComplete = false;
  for (let page = 0; page < 1000; page += 1) {
    const response = await graphql({
      query: PROJECT_RECORDS_QUERY,
      variables: { project: cfg.projectId, after },
    });
    if (Array.isArray(response?.errors) && response.errors.length > 0) fail('corpus-response');
    const connection = response?.data?.node?.items;
    if (!Array.isArray(connection?.nodes)) fail('corpus-response');
    if (typeof connection.pageInfo?.hasNextPage !== 'boolean') fail('corpus-pagination');
    for (const item of connection.nodes) {
      const issue = item.content;
      if (!Number.isInteger(issue?.number) || typeof issue.id !== 'string') continue;
      if (typeof item.id !== 'string' || !Array.isArray(item.fieldValues?.nodes))
        fail('corpus-response');
      if (typeof item.fieldValues.pageInfo?.hasNextPage !== 'boolean') fail('corpus-pagination');
      const fieldValues = [...item.fieldValues.nodes];
      let fieldsPageInfo = item.fieldValues.pageInfo;
      let fieldsAfter = fieldsPageInfo.endCursor;
      const fieldCursors = new Set();
      for (let fieldPage = 0; fieldsPageInfo.hasNextPage && fieldPage < 1000; fieldPage++) {
        if (
          typeof fieldsAfter !== 'string' ||
          fieldsAfter === '' ||
          fieldCursors.has(fieldsAfter)
        ) {
          fail('corpus-pagination');
        }
        fieldCursors.add(fieldsAfter);
        const fieldsResponse = await graphql({
          query: PROJECT_ITEM_FIELD_VALUES_QUERY,
          variables: { item: item.id, after: fieldsAfter },
        });
        if (Array.isArray(fieldsResponse?.errors) && fieldsResponse.errors.length > 0)
          fail('corpus-response');
        const fieldsNode = fieldsResponse?.data?.node;
        const fieldsConnection = fieldsNode?.fieldValues;
        if (
          fieldsNode?.id !== item.id ||
          !Array.isArray(fieldsConnection?.nodes) ||
          typeof fieldsConnection.pageInfo?.hasNextPage !== 'boolean'
        ) {
          fail('corpus-pagination');
        }
        fieldValues.push(...fieldsConnection.nodes);
        fieldsPageInfo = fieldsConnection.pageInfo;
        fieldsAfter = fieldsPageInfo.endCursor;
      }
      if (fieldsPageInfo.hasNextPage) fail('corpus-pagination');
      const status = fieldValues.find((node) => node.field?.id === statusFieldId)?.name;
      if (String(status ?? '').toLowerCase() === 'done') candidates.set(issue.id, issue.number);
    }
    if (connection.pageInfo?.hasNextPage !== true) {
      projectComplete = true;
      break;
    }
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== 'string' || cursor === '' || cursors.has(cursor))
      fail('corpus-pagination');
    cursors.add(cursor);
    after = cursor;
  }
  if (!projectComplete) fail('corpus-pagination');
  const ids = [...candidates.keys()];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50);
    const response = await graphql({ query: DONE_ISSUE_RECORDS_QUERY, variables: { ids: chunk } });
    if (Array.isArray(response?.errors) && response.errors.length > 0) fail('corpus-response');
    if (!Array.isArray(response?.data?.nodes)) fail('corpus-response');
    if (response.data.nodes.length !== chunk.length) fail('corpus-response');
    const requestedIds = new Set(chunk);
    const returnedIds = new Set();
    for (const issue of response.data.nodes) {
      if (
        !Number.isInteger(issue?.number) ||
        !requestedIds.has(issue.id) ||
        candidates.get(issue.id) !== issue.number ||
        returnedIds.has(issue.id)
      ) {
        fail('corpus-response');
      }
      returnedIds.add(issue.id);
      const comments = issue.comments;
      if (!Array.isArray(comments?.nodes)) fail('corpus-response');
      if (typeof comments.pageInfo?.hasNextPage !== 'boolean') fail('corpus-pagination');
      const parsed = comments.pageInfo.hasNextPage
        ? typeof io?.listIssueRecords === 'function'
          ? await io.listIssueRecords({ repository: cfg.repo, issue: issue.number })
          : fail('corpus-pagination')
        : parsePreloadedIssueComments({
            nodes: comments.nodes,
            repository: cfg.repo,
            issue: issue.number,
          });
      if (!Array.isArray(parsed)) fail('corpus-response');
      records.push(...parsed);
    }
  }
  return records;
}

export function createAdaptivePlanRuntime({ cfg, deps = {}, adoptLegacyBaseline = false } = {}) {
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
  let activeForecast = null;
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
    if (!issue) fail('projection-response');
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
    const comments = await loadProjectionComments({
      graphql,
      owner,
      name,
      issueNumber,
      connection: issue.comments,
    });
    const records = parsePreloadedIssueComments({
      nodes: comments,
      repository: cfg.repo,
      issue: issueNumber,
    });
    return {
      lifecycleState: String(status ?? '').toLowerCase(),
      refineAppendix: plannedAppendix(comments, issueNumber),
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
      const active = projection.forecasts.filter((forecast) => forecast.supersededBy == null);
      if (active.length > 1) fail('forecast-lineage');
      activeForecast = active[0] ?? null;
      supersededForecastRecordId = activeForecast?.recordId ?? null;
      return refineEstimateFromProjection(projection);
    },
    loadRubric: async () => {
      const allRecords = await corpus();
      const corpusRubrics = allRecords.filter(
        (record) =>
          record.envelope.issue === cfg.estimationRubricIssue &&
          record.envelope.recordType === 'estimation-rubric'
      );
      const result = await loadOrRefreshRubric({
        cfg,
        deps: {
          listRubricRecords: async () => [
            ...corpusRubrics,
            ...(corpusRubrics.length > 0
              ? []
              : (
                  await io.listIssueRecords({
                    repository: cfg.repo,
                    issue: cfg.estimationRubricIssue,
                  })
                ).filter((record) => record.envelope.recordType === 'estimation-rubric')),
          ],
          listEligibleOutcomes: async () => estimationOutcomeSamples(allRecords),
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
            record.envelope.payload.kind === 'story' &&
            (allowed.size === 0 || allowed.has(record.envelope.issue))
        )
        .map((record) => ({
          recordId: record.envelope.recordId,
          payload: record.envelope.payload,
        }));
    },
    buildForecast: buildEstimationForecast,
    createForecastEnvelope: ({ repository, issue, payload }) => {
      if (
        activeForecast &&
        forecastGenerationHash(activeForecast.payload) === forecastGenerationHash(payload)
      ) {
        return activeForecast.envelope;
      }
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
      (adoptLegacyBaseline ? adoptLegacyPlanForecast : applyPlanEstimateAuthority)({
        issueNumber,
        ...(adoptLegacyBaseline ? {} : { refine }),
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

export function verificationEvidence(body, { expectedIssue, expectedFinalSha } = {}) {
  const groups = new Map();
  const receipts = parseValidatedVerificationReceipts(body, { expectedIssue });
  if (
    expectedFinalSha !== undefined &&
    !receipts.some(
      (receipt) =>
        receipt.commitSha === expectedFinalSha &&
        receipt.commands.some((command) => command.exitCode === 0)
    )
  ) {
    throw new TypeError('verification-receipt: exact final SHA evidence is missing');
  }
  for (const receipt of receipts) {
    for (const command of receipt.commands ?? []) {
      if (!groups.has(command.classification)) groups.set(command.classification, []);
      groups.get(command.classification).push({
        receiptId: receipt.receiptId,
        stage: receipt.stage,
        commitSha: receipt.commitSha,
        command: command.command,
        args: command.args,
        exitCode: command.exitCode,
        durationMs: command.durationMs,
        reusedFrom: command.reusedFrom ?? null,
      });
    }
  }
  return [...groups.entries()].map(([classification, decisions]) => {
    const executions = decisions.filter((decision) => decision.reusedFrom === null);
    return {
      classification,
      durationMs: executions.reduce((sum, execution) => sum + Number(execution.durationMs ?? 0), 0),
      attempts: executions.length,
      executions: decisions,
    };
  });
}

export function costEvidence(verification) {
  const drivers = [];
  let avoidableMs = 0;
  for (const command of verification) {
    const seenExecutions = new Set();
    let repeatedMs = 0;
    for (const execution of command.executions ?? []) {
      if (execution.reusedFrom !== null) continue;
      const identity = JSON.stringify([
        execution.commitSha,
        execution.command,
        execution.args ?? [],
      ]);
      if (seenExecutions.has(identity)) repeatedMs += execution.durationMs;
      else seenExecutions.add(identity);
    }
    if (repeatedMs === 0) continue;
    avoidableMs += repeatedMs;
    drivers.push({
      kind: `repeated-${command.classification}-same-sha`,
      hours: Number((repeatedMs / 3_600_000).toFixed(4)),
    });
  }
  const avoidableProcessWasteHours = Number((avoidableMs / 3_600_000).toFixed(4));
  return {
    avoidableProcessWasteHours,
    drivers,
  };
}

async function defaultDiffEvidence({ projectDir, trunk = 'origin/trunk' }) {
  const { stdout: head } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
  const commitSha = head.trim();
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
  // Test is stage-owned and always executes in the repository's isolated
  // sandbox. Keep that execution signal explicit rather than trying to infer
  // it from which source paths happened to change.
  lanes.push('sandbox');
  return {
    commitSha,
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
    const childNumbers = [];
    const seenChildren = new Set();
    const seenCursors = new Set();
    let after = null;
    let complete = false;
    for (let page = 0; page < 1000; page += 1) {
      const response = await graphql({
        query: CHILD_OUTCOMES_QUERY,
        variables: { owner, name, issue: issueNumber, after },
      });
      if (Array.isArray(response?.errors) && response.errors.length > 0) fail('child-outcomes');
      const responseIssue = response?.data?.repository?.issue;
      if (
        responseIssue?.number !== issueNumber ||
        responseIssue?.repository?.nameWithOwner !== cfg.repo ||
        !Array.isArray(responseIssue.subIssues?.nodes) ||
        typeof responseIssue.subIssues.pageInfo?.hasNextPage !== 'boolean'
      ) {
        fail('child-outcomes');
      }
      for (const child of responseIssue.subIssues.nodes) {
        if (
          !Number.isInteger(child?.number) ||
          child.number <= 0 ||
          seenChildren.has(child.number)
        ) {
          fail('child-outcomes');
        }
        seenChildren.add(child.number);
        childNumbers.push(child.number);
      }
      if (!responseIssue.subIssues.pageInfo.hasNextPage) {
        complete = true;
        break;
      }
      const cursor = responseIssue.subIssues.pageInfo.endCursor;
      if (typeof cursor !== 'string' || cursor === '' || seenCursors.has(cursor)) {
        fail('child-outcomes');
      }
      seenCursors.add(cursor);
      after = cursor;
    }
    if (!complete) fail('child-outcomes');
    const ids = [];
    for (const childNumber of childNumbers) {
      const childRecords = await io.listIssueRecords({ repository: cfg.repo, issue: childNumber });
      if (!Array.isArray(childRecords)) fail('child-outcomes');
      const outcomes = childRecords
        .filter((record) => record.envelope.recordType === 'estimation-outcome')
        .toSorted((left, right) => right.envelope.createdAt.localeCompare(left.envelope.createdAt));
      if (outcomes.length === 0) {
        // A child with no adaptive forecast belongs to the pre-rollout legacy
        // cohort. It remains valid delivery history but cannot be referenced by
        // a v1 outcome record. A forecasted child without an outcome is instead
        // incomplete adaptive evidence and must fail closed.
        if (childRecords.some((record) => record.envelope.recordType === 'estimation-forecast'))
          fail('child-outcomes');
        continue;
      }
      ids.push(outcomes[0].envelope.recordId);
    }
    return { childCount: childNumbers.length, recordIds: ids };
  };

  return {
    async ensure({ issueNumber, forecastRecordId, body }) {
      const records = await io.listIssueRecords({ repository: cfg.repo, issue: issueNumber });
      const discoveredChildren = await (deps.childOutcomeRecordIds ?? childOutcomeRecordIds)(
        issueNumber
      );
      const children = Array.isArray(discoveredChildren)
        ? discoveredChildren
        : discoveredChildren.recordIds;
      const isEpic = Array.isArray(discoveredChildren)
        ? children.length > 0
        : discoveredChildren.childCount > 0;
      const forecasts = recordsForProjection(records);
      const activeForecasts = forecasts.filter((record) => record.supersededBy === null);
      if (isEpic && children.length === 0) return { status: 'legacy-no-forecast' };
      if (!isEpic && forecasts.length === 0 && forecastRecordId === null) {
        return { status: 'legacy-no-forecast' };
      }
      if (
        !isEpic &&
        (activeForecasts.length !== 1 || activeForecasts[0].recordId !== forecastRecordId)
      ) {
        fail('forecast-lineage');
      }
      const forecastRecord = records.find(
        (record) =>
          record.envelope.recordType === 'estimation-forecast' &&
          record.envelope.recordId === forecastRecordId
      );
      if (!isEpic && !forecastRecord) fail('forecast');
      const outcomeForecast = isEpic ? null : forecastRecord.envelope;
      const timingResult = await (deps.readTimingCommentBody ?? readTimingCommentBody)({
        issueNumber,
        repo: cfg.repo,
      });
      if (timingResult?.status === 'error') fail('timing');
      const timingBody = bodyOf(timingResult);
      const diff = await (deps.readDiffEvidence ?? defaultDiffEvidence)({
        projectDir,
        trunk: cfg.trunkRef ?? 'origin/trunk',
      });
      const verification = verificationEvidence(body, {
        expectedIssue: issueNumber,
        expectedFinalSha: diff.commitSha,
      });
      const outcomePayload = buildEstimationOutcome({
        issue: issueNumber,
        forecast: outcomeForecast,
        timing: readEstimationStageTiming(timingBody.split('\n')),
        verification,
        diff,
        review: {
          fixCycles: timingBody.split('\n').filter((line) => /\|\s*review:failed\s*\|/i.test(line))
            .length,
        },
        cost: costEvidence(verification),
        kind: isEpic ? 'epic-orchestration' : 'story',
        childOutcomeRecordIds: children,
      });
      return ensureEstimationOutcome({
        issue: issueNumber,
        forecast: outcomeForecast,
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
