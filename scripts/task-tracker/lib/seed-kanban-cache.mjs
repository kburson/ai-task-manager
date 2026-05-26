// #218 follow-up — seed the per-session `kanbanState` derived cache from the
// bound issue's body marker. Called on bind paths (start, switch) so the
// activity-guard hook has a synchronous, near-current view of kanban state
// without a network round-trip on every tool call.
//
// Best-effort: network or parse failures are swallowed; the cache remains
// absent and the guard falls back to its no-state policy. The single
// state-mutator (move-state.mjs) and reconcile will refresh on the next
// transition.

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { setSessionKanbanState } from '../session-state.mjs';

export async function seedSessionKanbanFromBody({ sid, issue, projDir, repo }) {
  if (!sid || !issue) return null;
  const m = String(issue).match(/^#?(\d+)$/);
  if (!m) return null;
  const issueNumber = Number(m[1]);
  try {
    const { owner, repoName } = splitRepo(repo);
    const data = await gql(
      `query($owner: String!, $repo: String!, $issue: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issue) { body }
        }
      }`,
      { owner, repo: repoName, issue: issueNumber }
    );
    const body = data?.repository?.issue?.body ?? '';
    const state = readLastKnownState(body).state;
    if (!state) return null;
    return setSessionKanbanState(sid, state, projDir);
  } catch {
    return null;
  }
}
