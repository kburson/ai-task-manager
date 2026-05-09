import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fieldIdFor } from '../../task-tracker/project-fields.mjs';

const pexec = promisify(execFile);

export async function gh(args, options = {}) {
  const { input, ...rest } = options;
  if (input === undefined) {
    const { stdout } = await pexec('gh', args, { timeout: 15000, ...rest });
    return stdout;
  }
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { timeout: 15000, ...rest });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
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
  if (parsed.errors) throw new Error(parsed.errors.map(e => e.message).join('; '));
  return parsed.data;
}

export function splitRepo(repo) {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) throw new Error(`invalid repo: ${repo}`);
  return { owner, repoName };
}

export async function projectItemForIssue({ repo, projectId, issueNumber }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(`
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
  const issue = data.repository.issue;
  const existing = issue.projectItems.nodes.find(n => n.project?.id === projectId);
  return { issueId: issue.id, itemId: existing?.id || '' };
}

export async function addIssueToProject(projectId, issueId) {
  const data = await gql(`
    mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }`,
    { project: projectId, content: issueId }
  );
  return data.addProjectV2ItemById.item.id;
}

export async function fieldOptionMap(projectId) {
  const data = await gql(`
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
    map[field.id] = Object.fromEntries(field.options.map(o => [o.name, o.id]));
  }
  return map;
}

export async function projectValuesForIssue({ cfg, fieldDefs, issueNumber }) {
  if (!cfg?.repo || !cfg.projectId) return {};
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(`
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
  const item = data.repository.issue.projectItems.nodes.find(n => n.project?.id === cfg.projectId);
  if (!item) return {};
  const values = {};
  for (const def of fieldDefs) {
    const fieldId = fieldIdFor(cfg, def.key);
    if (!fieldId) continue;
    const node = item.fieldValues.nodes.find(v => v.field?.id === fieldId);
    if (!node) continue;
    if (node.number !== undefined && node.number !== null) values[def.key] = node.number;
    else if (node.date) values[def.key] = node.date;
    else if (node.text) values[def.key] = node.text;
    else if (node.name) values[def.key] = node.name;
  }
  return values;
}

export async function writeProjectFieldValue({ projectId, itemId, fieldId, value, optionMap = {} }) {
  if (value.number !== undefined) {
    await gql(`
      mutation($project: ID!, $item: ID!, $field: ID!, $val: Float!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { number: $val } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, val: value.number }
    );
  } else if (value.date !== undefined) {
    await gql(`
      mutation($project: ID!, $item: ID!, $field: ID!, $val: Date!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { date: $val } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, val: value.date }
    );
  } else if (value.text !== undefined) {
    await gql(`
      mutation($project: ID!, $item: ID!, $field: ID!, $val: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { text: $val } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, val: value.text }
    );
  } else if (value.singleSelectOptionName !== undefined) {
    const optionId = optionMap[fieldId]?.[value.singleSelectOptionName];
    if (!optionId) return false;
    await gql(`
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
      }`,
      { project: projectId, item: itemId, field: fieldId, option: optionId }
    );
  }
  return true;
}

