import { fetchConfiguredProjectIssue } from './github-projects.mjs';
import { normalizeStateId } from '../../task-tracker/lib/lifecycle-policy/index.mjs';

export async function fetchLiveKanbanState({ repo, projectId, issueNumber }) {
  if (process.env.TT_SKIP_NETWORK === '1') return '';
  try {
    const snapshot = await fetchConfiguredProjectIssue({ repo, projectId, issueNumber });
    const node = snapshot.projectItem;
    // Normalize the live board display name at the ingress boundary. Current
    // `Assigned` and the historical multi-word `On Deck` spelling both project
    // onto the canonical `assigned` state.
    return normalizeStateId(node?.fieldValueByName?.name) || '';
  } catch {
    return '';
  }
}
