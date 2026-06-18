// `pull-next` verb (#135) — JIT child-promotion for an epic in Develop.
//
// Usage: `/task pull-next <epic#>`
//
// Behavior:
// 1. Verify the epic is in `develop` (the orchestrator must be active).
// 2. Fetch the epic's children and pick the first-in-rank whose state is
//    `refine`.
// 3. Promote that child refine→plan via `verbPromote`. The agent then performs
//    the JIT deep-dive in Plan, appends the planned-estimate, and runs promote
//    again for plan→develop.
//
// If no refine-state child exists, the verb is a no-op success (idempotent).
// If the epic is not in `develop`, the verb errors.

import { loadConfig } from '../config.mjs';
import {
  fetchEpicChildren,
  findNextEligibleChild,
  enrichChildrenWithBlockedBy,
} from '../lib/epic-children-gate.mjs';
import { splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { normalizeStateSlug } from '../state-machine.mjs';
import { verbPromote } from './promote.mjs';

async function defaultGetLiveState({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 10) {
            nodes {
              project { id }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const nodes = data?.repository?.issue?.projectItems?.nodes ?? [];
  const node = nodes.find((n) => n.project?.id === cfg.projectId) ?? nodes[0];
  return normalizeStateSlug(node?.fieldValueByName?.name);
}

export async function runPullNext({ epicNumber, cfg, deps = {} } = {}) {
  if (!epicNumber) throw new Error('runPullNext: epicNumber is required');
  if (!cfg) throw new Error('runPullNext: cfg is required');
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const promote = deps.promote || verbPromote;

  const liveState = await getLiveState({ issueNumber: epicNumber, cfg });
  if (liveState !== 'develop') {
    return {
      status: 'epic-not-in-develop',
      message: `Refusing to pull-next on #${epicNumber}: epic state is "${liveState || 'unknown'}", expected "develop".`,
    };
  }

  let children;
  try {
    children = await fetchEpicChildren({
      cfg,
      parentEpicNumber: epicNumber,
      deps: deps.epicChildren,
    });
  } catch (err) {
    return {
      status: 'fetch-failed',
      message: `Failed to fetch children of #${epicNumber}: ${err.message}`,
    };
  }

  if (!children.length) {
    return {
      status: 'no-children',
      message: `#${epicNumber} has no sub-issues — nothing to pull.`,
    };
  }

  // Attach each child's `aitm-blocked-by` blockers so selection can skip
  // children with unmet dependencies and prefer blockers (#248).
  const enriched = await enrichChildrenWithBlockedBy({
    children,
    cfg,
    deps: deps.enrich,
  });

  const next = findNextEligibleChild(enriched);
  if (!next) {
    const counts = children.reduce((acc, c) => {
      const s = String(c.state || 'unknown').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return {
      status: 'no-eligible',
      message: `No refine-state children eligible for JIT pull on #${epicNumber}. States: ${JSON.stringify(counts)}`,
      counts,
    };
  }

  const promoteResult = await promote([String(next.number)], cfg);
  return {
    status: 'pulled',
    childNumber: next.number,
    childRank: next.rank,
    promoteResult,
    message: `Pulled #${next.number} (rank=${next.rank}) refine→plan. Perform deep-dive + planned-estimate, then run /task promote ${next.number}.`,
  };
}

export async function verbPullNext(rest = [], cfgArg = null) {
  const epicNumber = rest[0] ? Number(rest[0]) : null;
  if (!epicNumber || Number.isNaN(epicNumber)) {
    console.error('Usage: /task pull-next <epic#>');
    return 2;
  }
  const cfg = cfgArg || (await loadConfig());
  const result = await runPullNext({ epicNumber, cfg });
  if (result.status === 'pulled') {
    console.log(`✓ ${result.message}`);
    return 0;
  }
  if (result.status === 'no-eligible' || result.status === 'no-children') {
    console.log(result.message);
    return 0;
  }
  console.error(`⛔ ${result.message}`);
  return 1;
}
