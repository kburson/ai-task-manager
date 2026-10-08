import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import { prepareGraphqlQuery } from '../../task-tracker/lib/graphql-usage/identity.mjs';
import { usageEnabled } from '../../task-tracker/lib/graphql-usage/collection.mjs';
import { promisify } from 'node:util';
import { ghClient } from './gh-client.mjs';
import { fieldIdFor } from '../../task-tracker/project-fields.mjs';
import { GH_API_TIMEOUT_MS } from '../../task-tracker/lib/process-timeouts.mjs';
import {
  assertRevisionStageHostEffect,
  isMemoryStageEffectScope,
} from '../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';

// Injectable child_process seam (#645): production wiring defaults to the real
// node:child_process bindings; tests override `deps.execFile`/`deps.spawn` to
// exercise gh()/gql() and every caller offline without touching the network or
// the live GitHub project board. Behaviour-preserving — the default path is
// byte-identical to a direct execFile/spawn call.
export const deps = ghClient;

export async function gh(args, options = {}) {
  if (isMemoryStageEffectScope()) {
    const core = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
    return core.writeNativeStageBoardRequest(args, options);
  }
  assertRevisionStageHostEffect();
  const { input, ...rest } = options;
  if (input === undefined) {
    const { stdout } = await promisify(deps.execFile)('gh', args, {
      timeout: GH_API_TIMEOUT_MS,
      ...rest,
    });
    return stdout;
  }
  return new Promise((resolve, reject) => {
    const child = deps.spawn('gh', args, { timeout: GH_API_TIMEOUT_MS, ...rest });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.stdin.on('error', (error) => {
      // Node 24 can report EPIPE when gh exits before consuming the complete
      // payload. The child close event remains authoritative; every other
      // stdin failure is unexpected and must fail the request.
      if (error?.code !== 'EPIPE') reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else {
        reject(ghCloseError(code, stdout, stderr));
      }
    });
    child.stdin.end(input);
  });
}

export async function gql(query, variables = {}, options = {}) {
  assertRevisionStageHostEffect();
  const env = options.env || process.env;
  const prepared = usageEnabled(env)
    ? prepareGraphqlQuery(query, { selectedOperation: options.operationName })
    : { query, alias: null };
  const payload = JSON.stringify({
    query: prepared.query,
    variables,
    ...(options.operationName ? { operationName: options.operationName } : {}),
  });
  const { operationName: _operationName, ...transportOptions } = options;
  if (prepared.alias)
    transportOptions.env = {
      ...env,
      AITM_GRAPHQL_USAGE_PRIVATE: JSON.stringify({ alias: prepared.alias }),
    };
  const out = await gh(['api', 'graphql', '--input', '-'], { ...transportOptions, input: payload });
  return parseGraphqlOutput(out, prepared.alias);
}

function ghCloseError(code, stdout, stderr) {
  const err = new Error(`gh exited ${code}: ${stderr}`);
  err.code = code;
  err.stderr = stderr;
  err.stdout = stdout;
  return err;
}
function parseGraphqlOutput(stdout, alias) {
  const parsed = JSON.parse(stdout);
  if (parsed.errors) throw new Error(parsed.errors.map((e) => e.message).join('; '));
  if (alias && parsed.data) delete parsed.data[alias];
  return parsed.data;
}

// Closed response DATA only. No transport, source selection or current-read
// custody is established by parsing bytes. Ordinary wrappers share both cores.
export function parseNativeStageStatusResponse(input) {
  try {
    canonicalRecordJson(input);
    if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'response')) throw new TypeError();
    const response = input.response;
    if (
      !response ||
      Object.keys(response).sort().join(',') !== 'exitCode,stderr,stdout' ||
      typeof response.stdout !== 'string' ||
      typeof response.stderr !== 'string' ||
      !(response.exitCode === null || Number.isSafeInteger(response.exitCode))
    )
      throw new TypeError();
  } catch {
    throw new TypeError('native-stage-status-response');
  }
  const { stdout, stderr, exitCode } = input.response;
  if (exitCode !== 0) throw ghCloseError(exitCode, stdout, stderr);
  return parseGraphqlOutput(stdout, null);
}

export function splitRepo(repo) {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) throw new Error(`invalid repo: ${repo}`);
  return { owner, repoName };
}

export async function projectItemForIssue(input) {
  if (isMemoryStageEffectScope()) {
    const core = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
    const data = await core.readNativeStageBoardItem(input);
    return projectItemFromData(data, input.projectId);
  }
  assertRevisionStageHostEffect();
  const { repo, projectId, issueNumber } = input;
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          id
          projectItems(first: 20) { nodes { id project { id } } }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return projectItemFromData(data, projectId);
}

// Native parse DATA only; original read/transport selection stays above.
export function projectItemFromData(data, projectId) {
  const issue = data.repository.issue;
  const existing = issue.projectItems.nodes.find((n) => n.project?.id === projectId);
  return { issueId: issue.id, itemId: existing?.id || '' };
}

export async function addIssueToProject(projectId, issueId) {
  const data = await gql(
    `
    mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }`,
    { project: projectId, content: issueId }
  );
  return data.addProjectV2ItemById.item.id;
}

// #761 — un-track (remove) an issue's item from a ProjectV2 board. The write-
// side counterpart to `addIssueToProject`; used by the `close --as` disposition
// lane so a duplicate/not-planned issue leaves the board entirely instead of
// landing in Done. Returns the deleted item id (or '' when GitHub reports none).
export async function deleteProjectV2Item({ projectId, itemId }) {
  const data = await gql(
    `
    mutation($project: ID!, $item: ID!) {
      deleteProjectV2Item(input: { projectId: $project, itemId: $item }) {
        deletedItemId
      }
    }`,
    { project: projectId, item: itemId }
  );
  return data.deleteProjectV2Item?.deletedItemId || '';
}

export async function fieldOptionMap(projectId) {
  const data = await gql(
    `
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                options { id name }
              }
            }
          }
        }
      }
    }`,
    { project: projectId }
  );
  const map = {};
  for (const field of data.node.fields.nodes || []) {
    if (!field?.id || !field.options) continue;
    map[field.id] = Object.fromEntries(field.options.map((o) => [o.name, o.id]));
  }
  return map;
}

export async function projectValuesForIssue({ cfg, fieldDefs, issueNumber }) {
  if (!cfg?.repo || !cfg.projectId) return {};
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 20) {
            nodes {
              project { id }
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
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
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return projectValuesFromGraphql({ data, cfg, fieldDefs });
}

// Pure extraction shared by native transport reads and retained fixture data.
// This does not validate current authority or issue a read capability.
export function projectValuesFromGraphql({ data, cfg, fieldDefs }) {
  const item = data.repository.issue.projectItems.nodes.find(
    (n) => n.project?.id === cfg.projectId
  );
  if (!item) return {};
  const values = {};
  for (const def of fieldDefs) {
    const fieldId = fieldIdFor(cfg, def.key);
    if (!fieldId) continue;
    const node = item.fieldValues.nodes.find((v) => v.field?.id === fieldId);
    if (!node) continue;
    if (node.number !== undefined && node.number !== null) values[def.key] = node.number;
    else if (node.date) values[def.key] = node.date;
    else if (node.text) values[def.key] = node.text;
    else if (node.name) values[def.key] = node.name;
  }
  return values;
}

export async function writeProjectFieldValue({
  projectId,
  itemId,
  fieldId,
  value,
  optionMap = {},
}) {
  if (value.number !== undefined) {
    await gql(
      `
      mutation($project: ID!, $item: ID!, $field: ID!, $val: Float!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { number: $val } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, val: value.number }
    );
  } else if (value.date !== undefined) {
    await gql(
      `
      mutation($project: ID!, $item: ID!, $field: ID!, $val: Date!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { date: $val } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, val: value.date }
    );
  } else if (value.text !== undefined) {
    await gql(
      `
      mutation($project: ID!, $item: ID!, $field: ID!, $val: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { text: $val } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, val: value.text }
    );
  } else if (value.singleSelectOptionName !== undefined) {
    const optionId = optionMap[fieldId]?.[value.singleSelectOptionName];
    if (!optionId) return false;
    await gql(
      `
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, option: optionId }
    );
  }
  return true;
}

export async function clearProjectFieldValue({ projectId, itemId, fieldId }) {
  await gql(
    `
    mutation($project: ID!, $item: ID!, $field: ID!) {
      clearProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field }) {
        projectV2Item { id }
      }
    }`,
    { project: projectId, item: itemId, field: fieldId }
  );
  return true;
}
