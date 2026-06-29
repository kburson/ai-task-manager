// `/task plan` — dedicated refine→plan promoter (#299 Item 2).
//
// Before #299 this verb was a deprecated alias for `/task discover`. That
// shape collided with the kanban-state rename Analyze→Plan: `/task plan #N`
// would start a discovery bucket instead of entering the Sprint-Planning
// state. This verb mirrors the `/task refine`, `/task test`, `/task review`
// pattern — a thin wrapper around `verbPromote` for its target state — with
// a live-state pre-check that refuses anything but a refine→plan transition.
//
// Discovery (backlog-item generation / pre-issue ideation) lives in
// `verbs/discover.mjs` and is the only home for that workflow.
//
// CLI:
//   /task plan <issue#>
//
// Exit codes:
//   0  success
//   1  wrong-state / promote failure
//   2  usage error

import { verbPromote } from './promote.mjs';
import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { normalizeStateSlug } from '../state-machine.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';

function parseArgs(rest = []) {
  for (const a of rest) {
    const m = String(a).match(/^#?(\d+)$/);
    if (m) return { issueNumber: Number(m[1]) };
  }
  return { issueNumber: null };
}

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

export async function runPlan({ issueNumber, cfg, deps = {} } = {}) {
  if (!cfg) throw new Error('plan: cfg is required');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('plan: issue# must be a positive integer');
  }
  const assertBound = deps.assertBound ?? assertBoundToIssue;
  assertBound(issueNumber);
  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const promote = deps.verbPromote || verbPromote;

  const current = await getLiveState({ issueNumber, cfg });
  if (current !== 'refine') {
    return {
      status: 'wrong-state',
      issueNumber,
      current,
      message:
        `plan: refuses to run on #${issueNumber} — current state is \`${current ?? 'unknown'}\`, expected \`refine\`. ` +
        `\`/task plan\` only enters Sprint-Planning from Refine. ` +
        `For backlog item generation use \`/task discover\`; for other transitions use \`/task promote\`.`,
    };
  }

  await promote([String(issueNumber)], cfg);
  return { status: 'promoted', issueNumber, from: 'refine', to: 'plan' };
}

export async function verbPlan(ctx) {
  const { cfg, rest, deps } = ctx;
  const { issueNumber } = parseArgs(rest);
  if (!issueNumber) {
    process.stderr.write('Usage: /task plan <issue#>\n');
    process.stderr.write(
      '  Promotes <issue#> from Refine to Plan (Sprint-Planning entry). For backlog item generation use `/task discover`.\n'
    );
    process.exit(2);
  }
  let result;
  try {
    result = await runPlan({ issueNumber, cfg, deps });
  } catch (err) {
    process.stderr.write(`plan: ${err.message}\n`);
    process.exit(1);
  }
  if (result.status === 'wrong-state') {
    process.stderr.write(`⛔ ${result.message}\n`);
    process.exit(1);
  }
}
