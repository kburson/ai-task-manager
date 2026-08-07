import { gql, splitRepo } from './github-projects.mjs';
import { ensureParentEpicTitle } from './epic-retitle.mjs';
import { stateConfigKey, stateIds } from '../../task-tracker/lib/lifecycle-policy/index.mjs';
import { ceilEstimateHours } from '../../task-tracker/lib/estimation/estimate-granularity.mjs';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_MS = 1500;

export const STATUS_CONFIG_KEYS = Object.freeze(
  Object.fromEntries(stateIds().map((state) => [state, stateConfigKey(state)]))
);

const PRIORITY_CONFIG_KEYS = {
  P0: 'priorityOptionP0',
  P1: 'priorityOptionP1',
  P2: 'priorityOptionP2',
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultRunGql(query, variables) {
  return gql(query, variables);
}

function normalizePriority(priority) {
  return priority ? String(priority).toUpperCase() : '';
}

function normalizeSize(size) {
  return size ? String(size).toUpperCase() : '';
}

function issueSideProjectItems(issue, projectId) {
  return (issue?.projectItems?.nodes || []).filter((item) => item.project?.id === projectId);
}

async function fetchIssue({ cfg, issueNumber, runGql }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await runGql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        id
        issue(number: $issue) {
          id
          number
          title
          url
          projectItems(first: 50) {
            nodes {
              id
              project { id title url }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const repository = data.repository;
  if (!repository?.issue) throw new Error(`issue #${issueNumber} not found in ${cfg.repo}`);
  return { repositoryId: repository.id, issue: repository.issue };
}

async function ensureProjectLinked({ cfg, repositoryId, runGql }) {
  if (!cfg.projectId || !repositoryId) return;
  try {
    await runGql(
      `
      mutation($project: ID!, $repo: ID!) {
        linkProjectV2ToRepository(input: { projectId: $project, repositoryId: $repo }) {
          repository { nameWithOwner }
        }
      }`,
      { project: cfg.projectId, repo: repositoryId }
    );
  } catch {
    // GitHub errors when the project is already linked or linkage is unavailable
    // for the token; project item verification below is the authoritative gate.
  }
}

async function projectItemForIssue({ cfg, issueNumber, runGql }) {
  let after = null;
  let projectInfo = null;
  do {
    const data = await runGql(
      `
      query($project: ID!, $after: String) {
        node(id: $project) {
          ... on ProjectV2 {
            title
            url
            items(first: 100, after: $after) {
              totalCount
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                isArchived
                content {
                  ... on Issue {
                    number
                    title
                    url
                  }
                }
              }
            }
          }
        }
      }`,
      { project: cfg.projectId, after }
    );
    const project = data.node;
    projectInfo = project;
    const item = (project?.items?.nodes || []).find(
      (node) => !node.isArchived && Number(node.content?.number) === Number(issueNumber)
    );
    if (item) return { project, item };
    after = project?.items?.pageInfo?.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (after);
  return { project: projectInfo, item: null };
}

async function addIssueToProject({ cfg, issueId, runGql }) {
  const data = await runGql(
    `
    mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }`,
    { project: cfg.projectId, content: issueId }
  );
  return data.addProjectV2ItemById.item.id;
}

async function linkSubIssue({
  parentId,
  parentIssueNumber,
  childId,
  repo,
  runGql,
  reconcileEpicMetadata,
}) {
  await runGql(
    `
    mutation($parent: ID!, $child: ID!) {
      addSubIssue(input: { issueId: $parent, subIssueId: $child }) {
        issue { id }
        subIssue { id }
      }
    }`,
    { parent: parentId, child: childId }
  );
  // #545/#1130 — the parent now has a child: converge all Epic metadata.
  await ensureParentEpicTitle({
    parentId,
    issueNumber: parentIssueNumber,
    repo,
    runGql,
    reconcileEpicMetadata,
  });
}

async function writeField({ cfg, itemId, fieldId, value, runGql }) {
  if (!fieldId) return;
  if (value?.singleSelectOptionId) {
    await runGql(
      `
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
          projectV2Item { id }
        }
      }`,
      { project: cfg.projectId, item: itemId, field: fieldId, option: value.singleSelectOptionId }
    );
  } else if (value?.number !== undefined) {
    await runGql(
      `
      mutation($project: ID!, $item: ID!, $field: ID!, $val: Float!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { number: $val } }) {
          projectV2Item { id }
        }
      }`,
      { project: cfg.projectId, item: itemId, field: fieldId, val: value.number }
    );
  }
}

async function writeFields({ cfg, itemId, status, priority, size, estimate, rank, runGql }) {
  const statusKey = STATUS_CONFIG_KEYS[String(status || '').toLowerCase()];
  if (statusKey) {
    await writeField({
      cfg,
      itemId,
      fieldId: cfg.kanbanFieldId,
      value: { singleSelectOptionId: cfg[statusKey] },
      runGql,
    });
  }

  const priorityKey = PRIORITY_CONFIG_KEYS[normalizePriority(priority)];
  if (priorityKey) {
    await writeField({
      cfg,
      itemId,
      fieldId: cfg.priorityFieldId,
      value: { singleSelectOptionId: cfg[priorityKey] },
      runGql,
    });
  }

  const sizeValue = normalizeSize(size);
  if (sizeValue) {
    if (!cfg.sizeFieldId) {
      throw new Error(
        `Size field is not configured (sizeFieldId missing); cannot write Size ${sizeValue}`
      );
    }
    const sizeOptionId =
      cfg.sizeOptions?.[sizeValue] ||
      cfg.sizeOptionMap?.[sizeValue] ||
      cfg.sizeOptionMap?.[cfg.sizeFieldId]?.[sizeValue];
    if (!sizeOptionId) {
      throw new Error(`Size option ${sizeValue} not found for field ${cfg.sizeFieldId}`);
    }
    await writeField({
      cfg,
      itemId,
      fieldId: cfg.sizeFieldId,
      value: { singleSelectOptionId: sizeOptionId },
      runGql,
    });
  }

  if (estimate !== undefined) {
    await writeField({
      cfg,
      itemId,
      fieldId: cfg.fieldEstimate || cfg.fieldIds?.estimate,
      value: { number: ceilEstimateHours(Number(estimate)) },
      runGql,
    });
  }

  if (rank !== undefined) {
    const rankFieldId =
      cfg.fieldRank ||
      cfg.rankFieldId ||
      cfg.fieldIds?.rank ||
      cfg.fieldSequence ||
      cfg.sequenceFieldId ||
      cfg.fieldIds?.sequence;
    if (!rankFieldId) {
      // #222 — surface the silent-failure case where --rank was passed but
      // no Rank field id is configured.
      process.stderr.write(
        `[project-tether] WARN: rank=${rank} supplied but no Rank field id configured ` +
          `(checked cfg.fieldRank, cfg.rankFieldId, cfg.fieldIds.rank). Skipping write.\n`
      );
    } else {
      await writeField({
        cfg,
        itemId,
        fieldId: rankFieldId,
        value: { number: Number(rank) },
        runGql,
      });
    }
  }
}

function failureMessage({ cfg, issueNumber, project }) {
  const projectRef = project?.url
    ? `${project.title || cfg.projectId} (${project.url})`
    : cfg.projectId;
  return [
    `Unable to tether issue #${issueNumber} to project ${projectRef}.`,
    `Neither repository.issue.projectItems (authoritative reverse lookup) nor ProjectV2.items`,
    `pagination contained the issue after retries.`,
    `Manual remediation: add #${issueNumber} to the project in GitHub UI, then rerun project-tether.`,
  ].join(' ');
}

// Backlog is for unvetted ideas; sized + estimated work belongs in the Refine column.
// Returns the warning string when the rule is violated, otherwise null. Pure helper.
export function backlogSizingWarning({ status, size, estimate } = {}) {
  if (status !== 'backlog') return null;
  if (!size) return null;
  if (estimate === undefined || estimate === null || estimate === '' || estimate === true)
    return null;
  return (
    '⚠ warning: tethering a sized + estimated issue to Backlog. ' +
    'Backlog is for unvetted ideas; sized work belongs in the Refine column. ' +
    'Use --status refine instead, or override.'
  );
}

// Same rule for move-state: warn when moving a body-with-sized-fields issue to Backlog.
// Takes the parsed fields object from parseIssueFieldDb. Returns warning string or null.
export function backlogMoveWarning({ targetState, fieldValues } = {}) {
  if (targetState !== 'backlog') return null;
  if (!fieldValues) return null;
  if (fieldValues.size == null) return null;
  if (typeof fieldValues.estimate !== 'number') return null;
  return (
    '⚠ warning: moving a sized + estimated issue to Backlog. ' +
    'Backlog is for unvetted ideas; sized work belongs in the Refine column.'
  );
}

export async function tetherIssueToProject({
  cfg,
  issueNumber,
  parentIssueNumber,
  status,
  priority,
  size,
  estimate,
  rank,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  runGql = defaultRunGql,
  reconcileEpicMetadata,
  sleep: sleepFn = sleep,
} = {}) {
  if (!cfg?.repo) throw new Error('repo not configured');
  if (!cfg.projectId) throw new Error('projectId not configured');
  if (!issueNumber) throw new Error('issueNumber is required');

  const initial = await fetchIssue({ cfg, issueNumber, runGql });
  const repositoryId = initial.repositoryId;
  let issue = initial.issue;
  await ensureProjectLinked({ cfg, repositoryId, runGql });

  let lastProject = null;
  let added = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Re-fetch the issue node each retry so the reverse lookup reflects the
    // live link state (an add we just performed, or an eventual-consistency
    // lag that has since resolved). The first attempt reuses the initial fetch.
    if (attempt > 1) {
      issue = (await fetchIssue({ cfg, issueNumber, runGql })).issue;
    }

    // PRIMARY, authoritative lookup: `repository.issue(N).projectItems` is
    // returned from the issue node itself, so it cannot miss an item that is
    // genuinely linked. Use it directly — never delete it as a "phantom".
    const sideItems = issueSideProjectItems(issue, cfg.projectId);
    if (sideItems.length > 0) {
      const item = sideItems[0];
      lastProject = item.project || lastProject;
      await writeFields({
        cfg,
        itemId: item.id,
        status,
        priority,
        size,
        estimate,
        rank,
        runGql,
      });
      if (parentIssueNumber) {
        const parent = await fetchIssue({ cfg, issueNumber: parentIssueNumber, runGql });
        await linkSubIssue({
          parentId: parent.issue.id,
          parentIssueNumber,
          childId: issue.id,
          repo: cfg.repo,
          runGql,
          reconcileEpicMetadata,
        });
      }
      return {
        issueId: issue.id,
        itemId: item.id,
        projectTitle: item.project?.title || '',
        projectUrl: item.project?.url || '',
      };
    }

    // FALLBACK: the reverse lookup is empty (issue may genuinely not be linked
    // yet). Scan `ProjectV2.items` forward pagination as a secondary check.
    const verified = await projectItemForIssue({ cfg, issueNumber, runGql });
    lastProject = verified.project || lastProject;
    if (verified.item?.id) {
      await writeFields({
        cfg,
        itemId: verified.item.id,
        status,
        priority,
        size,
        estimate,
        rank,
        runGql,
      });
      if (parentIssueNumber) {
        const parent = await fetchIssue({ cfg, issueNumber: parentIssueNumber, runGql });
        await linkSubIssue({
          parentId: parent.issue.id,
          parentIssueNumber,
          childId: issue.id,
          repo: cfg.repo,
          runGql,
          reconcileEpicMetadata,
        });
      }
      return {
        issueId: issue.id,
        itemId: verified.item.id,
        projectTitle: verified.project?.title || '',
        projectUrl: verified.project?.url || '',
      };
    }

    // Neither lookup found the item: add the issue to the project once, then
    // retry. The next attempt re-fetches the issue node and the authoritative
    // reverse lookup should then surface the newly-added item.
    if (!added) {
      await addIssueToProject({ cfg, issueId: issue.id, runGql });
      added = true;
    }
    if (attempt < maxAttempts) await sleepFn(retryDelayMs);
  }

  throw new Error(failureMessage({ cfg, issueNumber, project: lastProject }));
}
