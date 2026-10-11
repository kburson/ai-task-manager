import { fetchIssueProjectMembership } from './project-membership.mjs';
import { normalizeStateId } from '../../task-tracker/lib/lifecycle-policy/index.mjs';

export async function fetchLiveKanbanState({ repo, projectId, issueNumber }) {
  if (process.env.TT_SKIP_NETWORK === '1') return '';
  try {
    const { item } = await fetchIssueProjectMembership({ repo, projectId, issueNumber });
    // Normalize the live board display name at the ingress boundary. Current
    // Historical `Assigned` and `On Deck` spellings both project onto the
    // canonical `ready-for-plan` state without rewriting the board value.
    return normalizeStateId(item?.fieldValueByName?.name) || '';
  } catch {
    return '';
  }
}
