// GH timing comment — locate/create/append.
// GH I/O uses `gh` CLI via execFile with timeout.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export const TIMING_HEADING = '⏱ Timing Log';

const TABLE_HEADER = [
  '| Timestamp | Event | Δ Min | Δ Words | Cum Min | Cum Words |',
  '|---|---|---|---|---|---|',
].join('\n');

const TOTAL_RE = /\*\*Session total: .*\*\*/;

function fmtTs(iso) { return iso.slice(0, 16) + 'Z'; }           // 2026-04-24T14:02Z
function fmtNum(n)  { return n == null ? '—' : Number(n).toLocaleString('en-US'); }

export function buildRow({ ts, event, deltaMin, deltaWords, cumMin, cumWords }) {
  return `| ${fmtTs(ts)} | ${event} | ${fmtNum(deltaMin)} | ${fmtNum(deltaWords)} | ${fmtNum(cumMin)} | ${fmtNum(cumWords)} |`;
}

export function buildInitialComment() {
  return [
    TIMING_HEADING,
    '',
    TABLE_HEADER,
    '',
    '**Session total: 0 min, 0 words.** (AI active engagement)',
  ].join('\n');
}

export function appendRow(body, row, { cumMin, cumWords }) {
  // Strip existing total line
  const withoutTotal = body.replace(/\n?\*\*Session total:.*?\n?/s, '\n');
  const totalLine = `**Session total: ${fmtNum(cumMin)} min, ${fmtNum(cumWords)} words.** (AI active engagement)`;
  // Find the last table row, insert new row after it
  const lines = withoutTotal.split('\n');
  let lastTableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('| ') && !lines[i].startsWith('| Timestamp') && !lines[i].startsWith('|---')) {
      lastTableIdx = i;
    }
  }
  if (lastTableIdx === -1) {
    // First data row — insert after separator
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|---')) { lastTableIdx = i; break; }
    }
  }
  lines.splice(lastTableIdx + 1, 0, row);
  return lines.join('\n').replace(/\n+$/, '') + '\n\n' + totalLine + '\n';
}

// ---- GH shell-out helpers ----

async function ghExec(args, { timeoutMs = 2000 } = {}) {
  const { stdout } = await pexec('gh', args, { timeout: timeoutMs });
  return stdout;
}

export async function findTimingComment(issueNumber, repo, { timeoutMs } = {}) {
  const num = issueNumber.replace('#', '');
  const out = await ghExec(
    ['issue', 'view', num, '-R', repo, '--json', 'comments'],
    { timeoutMs }
  );
  const { comments } = JSON.parse(out);
  const hit = comments.find(c => c.body.includes(TIMING_HEADING));
  return hit ? { id: hit.id, url: hit.url, body: hit.body } : null;
}

export async function createTimingComment(issueNumber, repo, body, { timeoutMs } = {}) {
  const num = issueNumber.replace('#', '');
  const out = await ghExec(
    ['issue', 'comment', num, '-R', repo, '--body', body],
    { timeoutMs }
  );
  return out.trim();  // URL of new comment
}

export async function updateTimingComment(commentId, repo, body, { timeoutMs } = {}) {
  // gh doesn't have edit-comment by id for issues directly;
  // use GraphQL mutation.
  const mutation = `
    mutation($id: ID!, $body: String!) {
      updateIssueComment(input: { id: $id, body: $body }) { issueComment { id } }
    }`;
  await ghExec(
    ['api', 'graphql', '-f', `query=${mutation}`, '-f', `id=${commentId}`, '-f', `body=${body}`],
    { timeoutMs }
  );
}

export async function postTimingEvent({
  issueNumber, repo, row, cumMin, cumWords, timeoutMs = 2000,
}) {
  const existing = await findTimingComment(issueNumber, repo, { timeoutMs });
  if (!existing) {
    const initial = appendRow(buildInitialComment(), row, { cumMin, cumWords });
    await createTimingComment(issueNumber, repo, initial, { timeoutMs });
  } else {
    const updated = appendRow(existing.body, row, { cumMin, cumWords });
    await updateTimingComment(existing.id, repo, updated, { timeoutMs });
  }
}
