#!/usr/bin/env node
// @story #675 (AC1)
//
// `preflight-issue.mjs` is the only place that stamps `aitm-entered-backlog`,
// and only `create-issue.mjs` calls it — an issue authored through the GitHub
// web UI (or any other out-of-pipeline path) never runs it, so its body
// silently has no entry-marker chain at all. The first `/task refine` or
// `/task promote` attempt then refuses with a contiguity-hole error.
//
// Pure logic lives here (importable from the `issues: [opened]` GitHub Action
// in `.github/workflows/scaffold-web-issue.yml` via dynamic `import()`, and
// from tests); the CLI tail below is for manual/local invocation only.

import {
  stampEntryMarker,
  parseEntryMarkersFirstVisit,
} from '../task-tracker/lib/stage-entry-markers.mjs';

// True when the body has no `aitm-entered-backlog` marker at all — the
// signature of an issue that never passed through create-issue.mjs.
export function needsBacklogScaffold(body) {
  return !parseEntryMarkersFirstVisit(body || '').backlog;
}

// Stamp the missing `aitm-entered-backlog` marker at the issue's creation
// time (mirrors create-issue.mjs, which stamps at issue-creation instant).
// No-op (returns body unchanged) if the marker is already present.
export function scaffoldBody({ body, createdAt }) {
  const src = body || '';
  if (!needsBacklogScaffold(src)) return src;
  const ts = createdAt || new Date().toISOString();
  return stampEntryMarker(src, 'backlog', ts);
}

async function main() {
  const [, , issueArg] = process.argv;
  const issueNumber = Number(issueArg);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    process.stderr.write('usage: scaffold-web-issue.mjs <issue-number>\n');
    process.exit(2);
  }
  const { mutateIssueBody } = await import('../task-tracker/lib/issue-body-mutate.mjs');
  const { readFileSync } = await import('node:fs');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const pexec = promisify(execFile);
  const { repo } = JSON.parse(
    readFileSync(new URL('../../.ai-task-manager/task-tracker.json', import.meta.url), 'utf8')
  );
  const { stdout } = await pexec('gh', [
    'issue',
    'view',
    String(issueNumber),
    '--repo',
    repo,
    '--json',
    'body,createdAt',
  ]);
  const { body, createdAt } = JSON.parse(stdout);
  if (!needsBacklogScaffold(body)) {
    process.stdout.write(`#${issueNumber}: already has aitm-entered-backlog, nothing to do.\n`);
    return;
  }
  await mutateIssueBody({
    issueNumber,
    repo,
    mutate: (b) => scaffoldBody({ body: b, createdAt }),
  });
  process.stdout.write(`#${issueNumber}: scaffolded aitm-entered-backlog at ${createdAt}.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
}
