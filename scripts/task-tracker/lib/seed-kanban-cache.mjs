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
import { formatDefectHint } from './defect-hint.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { setSessionKanbanState } from '../session-state.mjs';
import { parseEntryMarkers, STAGES } from './stage-entry-markers.mjs';

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
    // #498 — durable defect-hint the top-level catch surfaces to the AI.
    this.defectHint = formatDefectHint(
      'seed-kanban-cache',
      `issue #${issueNumber} body has no aitm-last-known-state marker`
    );
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

async function defaultFetchBody({ owner, repoName, issueNumber }) {
  const data = await fetchBodyWithRetry({ owner, repoName, issueNumber });
  return data?.repository?.issue?.body ?? '';
}

export async function seedSessionKanbanFromBody({ sid, issue, projDir, repo, deps = {} }) {
  if (!sid || !issue) return null;
  const m = String(issue).match(/^#?(\d+)$/);
  if (!m) return null;
  const issueNumber = Number(m[1]);
  const { owner, repoName } = splitRepo(repo);
  // #519 — `deps.fetchBody` is an optional injection point for tests; the
  // default is the production one-retry GraphQL fetch. It returns the raw
  // issue body string.
  const fetchBody = deps.fetchBody || defaultFetchBody;
  const body = await fetchBody({ owner, repoName, issueNumber });
  let state = readLastKnownState(body).state;
  if (!state) {
    // #519 — Backlog is the first state in the machine, so a freshly-created
    // issue that has not advanced past it legitimately has no
    // `aitm-last-known-state` marker yet (that marker is only stamped on the
    // first promote/reconcile). Default to `backlog` in that case rather than
    // throwing. Only when the body shows the issue advanced past Backlog (a
    // later `aitm-entered-<stage>` marker exists) but the marker is absent is
    // this genuine marker corruption — preserve the throw.
    const backlogIdx = STAGES.indexOf('backlog');
    const highestEnteredIdx = parseEntryMarkers(body).reduce(
      (max, { stage }) => Math.max(max, STAGES.indexOf(stage)),
      -1
    );
    if (highestEnteredIdx > backlogIdx) throw new SeederMarkerMissingError(issueNumber);
    state = 'backlog';
  }
  return setSessionKanbanState(sid, state, projDir);
}
