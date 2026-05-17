// Refine → Plan exit gate (#147).
//
// Layered on top of the existing `planRefinementEstimate` gate (which already
// checks Size + Estimate + Priority + AC items + rationale marker). This gate
// adds the Refine-EXIT signals required before an issue can advance to Plan:
//
//   - Sequence set on the project board
//   - Labels set on the issue (≥ 1)
//   - Start Time set on the project board (auto-stamped at backlog→refine)
//   - If the issue is an epic (has sub-issues), every child is at least at
//     `refine` — backlog children block the parent's refine→plan move.
//
// Returns `{ ok, blockers, projectValues, labels, children }`. All I/O is
// injectable; the production wiring uses `projectValuesForIssue`,
// `fetchEpicChildren`, and a GraphQL labels query.

import { projectValuesForIssue, splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { fetchEpicChildren } from './epic-children-gate.mjs';

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
  const fetchChildren = deps.fetchEpicChildren || fetchEpicChildren;

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

  let children = [];
  try {
    children = await fetchChildren({ cfg, parentEpicNumber: issueNumber, deps });
  } catch (err) {
    return { ok: false, blockers: [`refine-exit-children-fetch-failed: ${err.message}`] };
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

  if (Array.isArray(children) && children.length > 0) {
    const forcePromote = process.env.TASK_TRACKER_FORCE_PROMOTE === '1';
    const offenders = children.filter((c) => String(c.state || '').toLowerCase() !== 'refine');
    if (offenders.length && !forcePromote) {
      const lines = offenders.map((c) => `#${c.number} (state=${c.state || 'unknown'})`);
      blockers.push(
        `refine-exit-children-not-at-refine: every epic child must be at refine (children must not lead the parent): ${lines.join(', ')}. Heal-forward override: TASK_TRACKER_FORCE_PROMOTE=1`
      );
    }
  }

  return { ok: blockers.length === 0, blockers, projectValues, labels, children };
}
