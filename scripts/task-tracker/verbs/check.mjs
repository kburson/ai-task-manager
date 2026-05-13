import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { loadState } from '../state.mjs';
import { projectTmpDir } from '../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

export async function verbCheck(ctx) {
  const { cfg, statePath, projectDir, rest, pexec } = ctx;
  const s = loadState(statePath);
  if (!s.active || s.active === 'plan') {
    console.error('no active task');
    process.exit(1);
  }
  const label = rest.join(' ').trim();
  if (!label) {
    console.error('Usage: /task check "<label>"');
    process.exit(1);
  }
  const issueNum = s.active.replace(/^#/, '');
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueNum, '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const body = stdout;

  if (/^deep[- ]?dive complete$/i.test(label)) {
    const { markDeepDiveComplete } = await import('../lib/markers.mjs');
    const res = await markDeepDiveComplete({ issueNumber: issueNum, cfg });
    if (!res.changed) {
      console.log(`[task-tracker] ✓ Already marked deep-dive-complete on ${s.active}`);
    } else {
      console.log(`[task-tracker] ✓ Marked deep-dive-complete on ${s.active} at ${res.ts}`);
    }
    return;
  }

  const uncheckedLine = `- [ ] ${label}`;
  const checkedLine = `- [x] ${label}`;
  const alreadyChecked = body.includes(checkedLine);
  if (!alreadyChecked && !body.includes(uncheckedLine)) {
    const found = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => `  "${m[1]}"`);
    const list = found.length
      ? `\nCheckboxes found:\n${found.join('\n')}`
      : '\n(no checkboxes found in issue body)';
    console.error(`[task-tracker] checkbox "${label}" not found in ${s.active}${list}`);
    process.exit(1);
  }
  const updated = alreadyChecked
    ? body.replace(checkedLine, uncheckedLine)
    : body.replace(uncheckedLine, checkedLine);
  const tmp = path.join(projectTmpDir(projectDir), `tt-check-${Date.now()}.md`);
  try {
    writeFileSync(tmp, updated, 'utf8');
    await pexec('gh', ['issue', 'edit', issueNum, '-R', cfg.repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
  const action = alreadyChecked ? 'Unchecked' : 'Checked';
  console.log(`[task-tracker] ✓ ${action} "${label}" on ${s.active}`);
}
