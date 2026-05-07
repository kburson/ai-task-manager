// GH timing comment — locate/create/append.
// GH I/O uses `gh` CLI via execFile with timeout.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export const TIMING_HEADING = '⏱ Timing Log';

const TABLE_HEADER = [
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
].join('\n');

function fmtTs(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${offset}`;
}
function fmtNum(n)  { return n == null ? '—' : Number(n).toLocaleString('en-US'); }

export function buildRow({ ts, event, activeMin, idleMin, deltaWords, wordMarker, description = '' }) {
  return `| ${fmtTs(ts)} | ${event} | ${fmtNum(activeMin)} | ${fmtNum(idleMin)} | ${fmtNum(deltaWords)} | ${fmtNum(wordMarker)} | ${description} |`;
}

export function buildInitialComment() {
  return [TIMING_HEADING, '', TABLE_HEADER].join('\n');
}

export function appendRow(body, row) {
  const lines = body.split('\n');
  let lastTableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('| ') && !lines[i].startsWith('| Timestamp') && !lines[i].startsWith('|---')) {
      lastTableIdx = i;
    }
  }
  if (lastTableIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|---')) { lastTableIdx = i; break; }
    }
  }
  lines.splice(lastTableIdx + 1, 0, row);
  return lines.join('\n').replace(/\n+$/, '') + '\n';
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
  issueNumber, repo, row, timeoutMs = 2000,
}) {
  const existing = await findTimingComment(issueNumber, repo, { timeoutMs });
  if (existing) {
    const updated = appendRow(existing.body, row);
    await updateTimingComment(existing.id, repo, updated, { timeoutMs });
  } else {
    const initial = appendRow(buildInitialComment(), row);
    await createTimingComment(issueNumber, repo, initial, { timeoutMs });
  }
}
