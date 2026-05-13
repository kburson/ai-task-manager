// Shared helper: list every issue in a repo (open + closed), paginated,
// excluding pull requests. Returns [{ number, title, state }, ...].

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

export async function listAllIssues(repo, { perPage = 100, timeoutMs = 30000 } = {}) {
  const issues = [];
  let page = 1;
  while (true) {
    const { stdout } = await pexec(
      'gh',
      [
        'api',
        `repos/${repo}/issues?state=all&per_page=${perPage}&page=${page}`,
        '--jq',
        '[.[] | select(.pull_request | not) | {number, title, state}]',
      ],
      { timeout: timeoutMs }
    );
    const batch = JSON.parse(stdout || '[]');
    if (batch.length === 0) break;
    issues.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return issues;
}
