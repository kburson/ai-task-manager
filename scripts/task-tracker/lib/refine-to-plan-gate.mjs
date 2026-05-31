// Refine → Plan exit gate (#147).
//
// Layered on top of the existing `planRefinementEstimate` gate (which already
// checks Size + Estimate + Priority + AC items + rationale marker). This gate
// adds the Refine-EXIT signals required before an issue can advance to Plan:
//
//   - Sequence set on the project board
//   - Labels set on the issue (≥ 1)
//   - Start Time set on the project board (auto-stamped at backlog→refine)
//
// Returns `{ ok, blockers, projectValues, labels }`. All I/O is injectable;
// the production wiring uses `projectValuesForIssue` and a GraphQL labels
// query.

import { projectValuesForIssue, splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { lintChecklistCommands } from './checklist-command-lint.mjs';

async function defaultFetchBody({ cfg, issueNumber }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

async function defaultFetchLabels({ cfg, issueNumber }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          labels(first: 50) { nodes { name } }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const nodes = data?.repository?.issue?.labels?.nodes ?? [];
  return nodes.map((n) => n.name).filter(Boolean);
}

export async function gateRefineToPlan({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('gateRefineToPlan: cfg is required');
  if (!issueNumber) throw new Error('gateRefineToPlan: issueNumber is required');

  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const fetchLabels = deps.fetchLabels || defaultFetchLabels;
  const fetchBody = deps.fetchBody || defaultFetchBody;

  const fieldDefs = fieldDefsLoader();

  let projectValues = {};
  try {
    projectValues = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
  } catch (err) {
    return { ok: false, blockers: [`refine-exit-board-fetch-failed: ${err.message}`] };
  }

  let labels = [];
  try {
    labels = await fetchLabels({ cfg, issueNumber });
  } catch (err) {
    return { ok: false, blockers: [`refine-exit-labels-fetch-failed: ${err.message}`] };
  }

  const blockers = [];

  if (projectValues.sequence == null || projectValues.sequence === '') {
    blockers.push(
      'refine-exit-missing: Sequence is not set on the project board — set it before promoting to Plan'
    );
  }
  if (!Array.isArray(labels) || labels.length === 0) {
    blockers.push(
      'refine-exit-missing: issue has no labels — add at least one label before promoting to Plan'
    );
  }
  if (!projectValues.startTime || String(projectValues.startTime).trim() === '') {
    blockers.push(
      'refine-exit-missing: Start time is not set on the project board — re-enter Refine or backfill before promoting to Plan'
    );
  }

  // #236 — reject compound CLI commands in AC evidence markers / VC section.
  try {
    const body = await fetchBody({ cfg, issueNumber });
    const lint = lintChecklistCommands(body);
    for (const v of lint.violations) {
      if (v.severity !== 'error') continue;
      blockers.push(
        `refine-exit-forbidden-command: ${v.section}:${v.lineIndex + 1}: \`${v.command}\` — forbidden ${v.rule}. Split into separate backtick-quoted commands.`
      );
    }
  } catch (err) {
    blockers.push(`refine-exit-body-fetch-failed: ${err.message}`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    projectValues,
    labels,
  };
}
