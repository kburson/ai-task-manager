// Refine -> Ready for Planning snapshot gate (#1213).

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { fieldIdFor } from '../project-fields.mjs';
import { verifyRefinementSnapshot } from './refinement-snapshot.mjs';

export const GUARD_ID = 'refine-exit-current-snapshot';

async function defaultFetchLabels({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          labels(first: 100) {
            nodes { name }
            pageInfo { hasNextPage }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const labels = data?.repository?.issue?.labels;
  if (!labels || labels.pageInfo?.hasNextPage) {
    throw new Error('refinement-snapshot: labels unreadable or exceed one page');
  }
  return (labels.nodes || []).map(({ name }) => name);
}

export async function fetchRefinementBoardSnapshot({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 100) {
            nodes {
              project { id }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                }
                pageInfo { hasNextPage }
              }
            }
            pageInfo { hasNextPage }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const items = data?.repository?.issue?.projectItems;
  if (!items || items.pageInfo?.hasNextPage) {
    throw new Error('refinement-snapshot: project membership unreadable or exceeds one page');
  }
  const item = (items.nodes || []).find((node) => node.project?.id === cfg.projectId);
  if (!item) throw new Error('refinement-snapshot: configured project membership missing');
  if (item.fieldValues?.pageInfo?.hasNextPage) {
    throw new Error('refinement-snapshot: project field values exceed one page');
  }
  const nodes = item.fieldValues?.nodes || [];
  const read = (key) => {
    const fieldId = fieldIdFor(cfg, key);
    if (!fieldId) throw new Error(`refinement-snapshot: ${key} field is not configured`);
    const node = nodes.find((value) => value.field?.id === fieldId);
    return node?.number ?? node?.name ?? null;
  };
  return {
    state: item.fieldValueByName?.name || null,
    fields: {
      priority: read('priority'),
      size: read('size'),
      estimate: read('estimate'),
      rank: read('rank'),
    },
  };
}

export async function fetchRefinementBoardFields(args) {
  return (await fetchRefinementBoardSnapshot(args)).fields;
}

export function numericBoardFieldMatches(actual, expected) {
  if (actual === null || actual === undefined || String(actual).trim() === '') return false;
  const numeric = Number(actual);
  return Number.isFinite(numeric) && numeric === Number(expected);
}

function boardFieldsMatch(snapshot, board) {
  const expected = snapshot.fields;
  return (
    String(board?.priority || '').toUpperCase() === String(expected.priority).toUpperCase() &&
    String(board?.size || '').toUpperCase() === String(expected.size).toUpperCase() &&
    numericBoardFieldMatches(board?.estimate, expected.estimate) &&
    numericBoardFieldMatches(board?.rank, expected.rank)
  );
}

export const refinementSnapshotGuard = Object.freeze({
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx || (ctx.toState && ctx.toState !== 'ready-for-plan')) return { ok: true };
    const fetchLabels =
      ctx.deps?.refinementSnapshot?.fetchLabels || ctx.deps?.fetchLabels || defaultFetchLabels;
    let labels;
    try {
      labels = await fetchLabels({ issueNumber: ctx.issueNumber, cfg: ctx.cfg });
    } catch (error) {
      return {
        ok: false,
        reason: `refinement snapshot labels unreadable: ${error.message}`,
        blockers: [`refinement snapshot labels unreadable: ${error.message}`],
      };
    }
    const verified = verifyRefinementSnapshot(ctx.body, { labels });
    if (!verified.ok) {
      const reason = `${verified.reason}; run \`/task refine\` to refresh refinement evidence`;
      return { ok: false, reason, blockers: [reason] };
    }
    const fetchBoardFields =
      ctx.deps?.refinementSnapshot?.fetchBoardFields || fetchRefinementBoardFields;
    let boardFields;
    try {
      boardFields = await fetchBoardFields({ issueNumber: ctx.issueNumber, cfg: ctx.cfg });
    } catch (error) {
      const reason = `refinement snapshot board fields unreadable: ${error.message}`;
      return { ok: false, reason, blockers: [reason] };
    }
    if (!boardFieldsMatch(verified.snapshot, boardFields)) {
      const reason =
        'live board fields disagree with refinement snapshot; run `/task refine` to converge refinement evidence';
      return { ok: false, reason, blockers: [reason] };
    }
    return { ok: true };
  },
});
