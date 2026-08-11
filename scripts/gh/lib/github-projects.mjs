import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fieldIdFor } from '../../task-tracker/project-fields.mjs';
import { GH_API_TIMEOUT_MS } from '../../task-tracker/lib/process-timeouts.mjs';

// Injectable child_process seam (#645): production wiring defaults to the real
// node:child_process bindings; tests override `deps.execFile`/`deps.spawn` to
// exercise gh()/gql() and every caller offline without touching the network or
// the live GitHub project board. Behaviour-preserving — the default path is
// byte-identical to a direct execFile/spawn call.
export const deps = { execFile, spawn };

export async function gh(args, options = {}) {
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
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else {
        const err = new Error(`gh exited ${code}: ${stderr}`);
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      }
    });
    child.stdin.end(input);
  });
}

export async function gql(query, variables = {}, options = {}) {
  const payload = JSON.stringify({ query, variables });
  const out = await gh(['api', 'graphql', '--input', '-'], { ...options, input: payload });
  const parsed = JSON.parse(out);
  if (parsed.errors) throw new Error(parsed.errors.map((e) => e.message).join('; '));
  return parsed.data;
}

export function splitRepo(repo) {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) throw new Error(`invalid repo: ${repo}`);
  return { owner, repoName };
}

const CONFIGURED_MEMBERSHIP_PAGE_SIZE = 100;
const CONFIGURED_MEMBERSHIP_MAX_PAGES = 100;

/**
 * Read one issue's membership in the configured ProjectV2 without assuming it
 * appears on the first connection page.  Assignees are selected in the same
 * GraphQL response as each membership page so callers that find the configured
 * item also receive an authoritative cross-resource snapshot.
 */
export async function fetchConfiguredProjectIssue({
  repo,
  projectId,
  issueNumber,
  gqlFn = gql,
  maxPages = CONFIGURED_MEMBERSHIP_MAX_PAGES,
} = {}) {
  if (!projectId) throw new Error('configured project id is required');
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error('issue number must be a positive integer');
  }
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error('configured-project pagination maxPages must be a positive integer');
  }

  const { owner, repoName } = splitRepo(repo);
  let cursor = null;
  let issueId = '';
  let assignees = [];
  const seenCursors = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await gqlFn(
      `
      query($owner: String!, $repo: String!, $issue: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) {
            id
            assignees(first: 100) { nodes { login } }
            projectItems(first: ${CONFIGURED_MEMBERSHIP_PAGE_SIZE}, after: $cursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                project { id title url }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name optionId }
                }
                fieldValues(first: 100) {
                  nodes {
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field { ... on ProjectV2FieldCommon { id name } }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field { ... on ProjectV2FieldCommon { id name } }
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field { ... on ProjectV2FieldCommon { id name } }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { id name } }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      { owner, repo: repoName, issue: Number(issueNumber), cursor }
    );

    const issue = data?.repository?.issue;
    if (!issue) throw new Error(`issue #${issueNumber} not found in ${repo}`);
    const connection = issue.projectItems;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error('configured project items payload is invalid');
    }
    const assigneeNodes = issue.assignees?.nodes;
    if (!Array.isArray(assigneeNodes)) {
      throw new Error('configured project issue assignee payload is invalid');
    }
    issueId = issue.id || issueId;
    assignees = assigneeNodes.map((entry) => {
      if (!entry || typeof entry.login !== 'string' || !entry.login.trim()) {
        throw new Error('configured project issue assignee payload is invalid');
      }
      return entry.login;
    });

    const projectItem = connection.nodes.find((entry) => entry?.project?.id === projectId);
    if (projectItem) return { issueId, projectItem, assignees };

    if (!connection.pageInfo.hasNextPage) {
      return { issueId, projectItem: null, assignees };
    }
    const nextCursor = connection.pageInfo.endCursor;
    if (typeof nextCursor !== 'string' || !nextCursor) {
      throw new Error('configured-project pagination hasNextPage but endCursor is missing');
    }
    if (nextCursor === cursor || seenCursors.has(nextCursor)) {
      throw new Error(`configured-project pagination cursor did not progress: ${nextCursor}`);
    }
    if (page === maxPages) {
      throw new Error(
        `configured-project pagination safety limit (${maxPages} pages) reached; partial scan refused`
      );
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error('configured-project pagination ended without an exhaustive result');
}

export async function projectItemForIssue({ repo, projectId, issueNumber }) {
  const snapshot = await fetchConfiguredProjectIssue({ repo, projectId, issueNumber });
  return { issueId: snapshot.issueId, itemId: snapshot.projectItem?.id || '' };
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
  const snapshot = await fetchConfiguredProjectIssue({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
  });
  const item = snapshot.projectItem;
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
