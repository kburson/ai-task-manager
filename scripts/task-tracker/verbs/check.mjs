import path from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { loadState } from '../state.mjs';
import { projectTmpDir } from '../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Toggle a single checklist line whose text exactly matches `label`.
// Matching is line-anchored so a label that is a prefix of a longer checklist
// row never matches the longer row.
//
// Returns one of:
//   { status: 'not-found' }
//   { status: 'toggled', body: <new>, alreadyChecked: <bool> }
export function toggleChecklistLine(body, label) {
  const esc = escapeRegex(label);
  const checked = new RegExp(`^- \\[x\\] ${esc}\\s*$`, 'm');
  const unchecked = new RegExp(`^- \\[ \\] ${esc}\\s*$`, 'm');
  const alreadyChecked = checked.test(body);
  if (!alreadyChecked && !unchecked.test(body)) {
    return { status: 'not-found' };
  }
  const next = alreadyChecked
    ? body.replace(checked, `- [ ] ${label}`)
    : body.replace(unchecked, `- [x] ${label}`);
  return { status: 'toggled', body: next, alreadyChecked };
}

export async function verbCheck(ctx) {
  const { cfg, statePath, projectDir, rest, pexec } = ctx;
  const s = loadState(statePath);
  if (!s.active || s.active === 'discover') {
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

  const result = toggleChecklistLine(body, label);
  if (result.status === 'not-found') {
    const found = [...body.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => `  "${m[1]}"`);
    const list = found.length
      ? `\nCheckboxes found:\n${found.join('\n')}`
      : '\n(no checkboxes found in issue body)';
    console.error(`[task-tracker] checkbox "${label}" not found in ${s.active}${list}`);
    process.exit(1);
  }
  const { body: updated, alreadyChecked } = result;
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
