// #218 follow-up — seed the per-session `kanbanState` derived cache from the
// bound issue's body marker. Called on bind paths (start, switch, resume) so
// the activity-guard hook has a synchronous, near-current view of kanban state
// without a network round-trip on every tool call.
//
// #273: was previously best-effort with a swallowing try/catch — a transient
// GraphQL blip or a body missing the `aitm-last-known-state` marker silently
// left the cache absent, and the next bash/edit hit the guard's
// `no-recorded-kanban-state` block with no diagnostic. Now:
//
//   1. The GraphQL fetch is wrapped in one bounded retry (500ms backoff) to
//      absorb the common-case registry blip.
//   2. Distinct failure modes raise tagged Error subclasses so callers can
//      surface specific repair instructions instead of a generic "best effort
//      failed" hand-wave.
//   3. The function STILL returns null on legitimate skip conditions (sid /
//      issue missing, or the body has no kanban marker yet because the issue
//      hasn't entered the verb chain). Only network/parse failures throw.

import { gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { setSessionKanbanState } from '../session-state.mjs';

const RETRY_BACKOFF_MS = 500;

export class SeederGraphQLError extends Error {
  constructor(message, cause) {
    super(`SeederGraphQLError: ${message}`);
    this.name = 'SeederGraphQLError';
    if (cause) this.cause = cause;
  }
}

export class SeederMarkerMissingError extends Error {
  constructor(issueNumber) {
    super(
      `SeederMarkerMissingError: issue #${issueNumber} body has no \`aitm-last-known-state\` marker — run \`/task reconcile accept-live ${issueNumber}\` to stamp it`
    );
    this.name = 'SeederMarkerMissingError';
    this.issueNumber = issueNumber;
  }
}

async function fetchBodyWithRetry({ owner, repoName, issueNumber }) {
  const query = `query($owner: String!, $repo: String!, $issue: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issue) { body }
    }
  }`;
  try {
    return await gql(query, { owner, repo: repoName, issue: issueNumber });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    try {
      return await gql(query, { owner, repo: repoName, issue: issueNumber });
    } catch (err2) {
      throw new SeederGraphQLError(
        `failed to fetch body for #${issueNumber} after one retry: ${err2.message}`,
        err2
      );
    }
  }
}

export async function seedSessionKanbanFromBody({ sid, issue, projDir, repo }) {
  if (!sid || !issue) return null;
  const m = String(issue).match(/^#?(\d+)$/);
  if (!m) return null;
  const issueNumber = Number(m[1]);
  const { owner, repoName } = splitRepo(repo);
  const data = await fetchBodyWithRetry({ owner, repoName, issueNumber });
  const body = data?.repository?.issue?.body ?? '';
  const state = readLastKnownState(body).state;
  if (!state) throw new SeederMarkerMissingError(issueNumber);
  return setSessionKanbanState(sid, state, projDir);
}
