// #704 — `dod-stamp`/`ac-stamp` executed declared verifier commands keyed only
// on local session state (`s.active`), with no check against the issue's live
// lifecycle state. That let `dod-stamp tests` run `npm run test:all` directly
// during Develop, bypassing the Develop-Phase Verification Contract
// (CLAUDE.md: full regression runs exclusively at the Test stage, via the
// sandboxed `promote` run).
//
// This module gates any verifier command matching a restricted pattern —
// the full-suite `npm run test:all` and the slow lane `npm run test:slow`
// (#934) — to issues whose live state is `test` or later. The slow lane is
// restricted because the two-lane Functional-DoD `tests` command declares
// `npm test` + `npm run test:slow`; gating the slow lane keeps the whole
// `tests` stamp barred before Test (you cannot stamp without both lanes),
// preserving the Develop-Phase Verification Contract without also restricting
// the fast lane's targeted use.

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { normalizeStateSlug, STATES } from '../state-machine.mjs';

const RESTRICTED_COMMAND_RE = /\bnpm\s+run\s+test:(all|slow)\b/;
const MIN_STATE = 'test';

export function isRestrictedVerifierCommand(cmd) {
  return RESTRICTED_COMMAND_RE.test(String(cmd || ''));
}

export async function defaultGetLiveState({ issueNumber, cfg }) {
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

export async function assertVerifierStateAllowed({ issueNumber, cfg, commands, deps = {} }) {
  const restricted = (commands || []).filter(isRestrictedVerifierCommand);
  if (!restricted.length) return { allowed: true };

  const getLiveState = deps.getLiveState || defaultGetLiveState;
  const live = await getLiveState({ issueNumber, cfg });
  const liveIdx = STATES.indexOf(live);
  const minIdx = STATES.indexOf(MIN_STATE);

  if (liveIdx === -1 || liveIdx < minIdx) {
    return {
      allowed: false,
      live,
      message:
        `restricted verifier command(s) [${restricted.join(', ')}] require #${issueNumber} to be in ` +
        `\`${MIN_STATE}\` or later (current: \`${live ?? 'unknown'}\`). Run \`/task promote\` to reach ` +
        `\`${MIN_STATE}\`, where a sandboxed suite run is the sanctioned path.`,
    };
  }
  return { allowed: true };
}
