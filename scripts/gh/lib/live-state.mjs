import { gql, splitRepo } from './github-projects.mjs';

export async function fetchLiveKanbanState({ repo, projectId, issueNumber }) {
  if (process.env.TT_SKIP_NETWORK === '1') return '';
  try {
    const { owner, repoName } = splitRepo(repo);
    const data = await gql(`
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
    const node = nodes.find(n => n?.project?.id === projectId);
    return String(node?.fieldValueByName?.name || '').toLowerCase();
  } catch {
    return '';
  }
}
