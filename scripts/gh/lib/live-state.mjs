import { gql, splitRepo } from './github-projects.mjs';
import { normalizeStateId } from '../../task-tracker/lib/lifecycle-policy/index.mjs';

export async function fetchLiveKanbanState({ repo, projectId, issueNumber }) {
  if (process.env.TT_SKIP_NETWORK === '1') return '';
  try {
    const { owner, repoName } = splitRepo(repo);
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
    const nodes = data?.repository?.issue?.projectItems?.nodes || [];
    const node = nodes.find((n) => n?.project?.id === projectId);
    // Normalize the live board display name at the ingress boundary. Current
    // `Assigned` and the historical multi-word `On Deck` spelling both project
    // onto the canonical `assigned` state.
    return normalizeStateId(node?.fieldValueByName?.name) || '';
  } catch {
    return '';
  }
}
