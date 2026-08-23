import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stripKnownPrefix } from '../../gh/lib/kind-prefix.mjs';
import { projectScratchDir } from './scratch-dir.mjs';
import { stampEntryMarker } from './stage-entry-markers.mjs';

const NO_RESPONSE_RE = /^_?no response_?$/i;
const CANONICAL_RE = /<!--\s*aitm-body-version\b/;

function clean(value) {
  const text = String(value ?? '').trim();
  return NO_RESPONSE_RE.test(text) ? '' : text;
}

export function parseIssueFormSections(body) {
  const sections = new Map();
  const source = String(body ?? '');
  const heading = /^###\s+(.+?)\s*$\n+([\s\S]*?)(?=^###\s+|\s*$)/gm;
  for (const match of source.matchAll(heading)) {
    sections.set(match[1].trim().toLowerCase(), clean(match[2]));
  }
  return sections;
}

function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map((label) => String(label).toLowerCase());
}

function first(sections, names) {
  for (const name of names) {
    const value = sections.get(name);
    if (value) return value;
  }
  return '';
}

function scalar(value, pattern) {
  return clean(value).match(pattern)?.[1] ?? '';
}

function writeFragment(dir, name, value) {
  const target = path.join(dir, name);
  writeFileSync(target, `${value.trim()}\n`, 'utf8');
  return target;
}

function normalizeWebAcceptanceCriteria(value) {
  return String(value || '')
    .split('\n')
    .map((line) => {
      if (/^\s*- \[[ x]\]/.test(line)) return line;
      const numbered = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (numbered) return `${numbered[1]}- [ ] ${numbered[2]}`;
      const bullet = line.match(/^(\s*)-\s+(?!\[)(.+)$/);
      return bullet ? `${bullet[1]}- [ ] ${bullet[2]}` : line;
    })
    .join('\n');
}

function defaultRenderDefect(input) {
  const dir = mkdtempSync(path.join(projectScratchDir('gh', input.projectDir), 'web-defect-'));
  try {
    const files = {
      story: writeFragment(dir, 'user-story.md', input.userStory),
      scope: writeFragment(dir, 'scope.md', input.scope),
      ac: writeFragment(dir, 'acs.md', input.acceptanceCriteria),
      origin: writeFragment(dir, 'story-origin.md', input.storyOrigin),
      plan: writeFragment(dir, 'plan-metadata.md', input.planMetadata),
      reproduction: writeFragment(dir, 'reproduction.md', input.reproduction),
      rootCause: writeFragment(dir, 'root-cause.md', input.rootCause),
      fixDirection: writeFragment(dir, 'fix-direction.md', input.fixDirection),
      outOfScope: writeFragment(dir, 'out-of-scope.md', input.outOfScope),
    };
    const argv = [
      path.join(input.projectDir, 'scripts/task-tracker/preflight-issue.mjs'),
      '--shape',
      'defect',
      '--title',
      input.title,
      '--user-story-file',
      files.story,
      '--scope-file',
      files.scope,
      '--ac-file',
      files.ac,
      '--story-origin-file',
      files.origin,
      '--plan-metadata-file',
      files.plan,
      '--reproduction-file',
      files.reproduction,
      '--root-cause-file',
      files.rootCause,
      '--fix-direction-file',
      files.fixDirection,
      '--out-of-scope-file',
      files.outOfScope,
    ];
    for (const [flag, value] of [
      ['priority', input.priority],
      ['size', input.size],
      ['estimate', input.estimate],
      ['rank', input.rank],
    ]) {
      if (value) argv.push(`--${flag}`, value);
    }
    return execFileSync(process.execPath, argv, {
      cwd: input.projectDir,
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function normalizeWebDefectIssue({ issue, projectDir, renderDefect } = {}) {
  const labels = labelNames(issue?.labels);
  if (!labels.includes('bug')) return Object.freeze({ status: 'skip', reason: 'not-bug' });
  if (labels.includes('beta-defect')) {
    return Object.freeze({ status: 'skip', reason: 'external-beta-report' });
  }
  const body = String(issue?.body ?? '');
  if (CANONICAL_RE.test(body)) return Object.freeze({ status: 'skip', reason: 'canonical' });
  const sections = parseIssueFormSections(body);
  const scope = first(sections, ['what happened?', 'what happened', 'description']);
  if (!scope) return Object.freeze({ status: 'skip', reason: 'unrecognized-form' });
  const createdAt = String(issue?.created_at ?? '');
  if (!Number.isFinite(Date.parse(createdAt)))
    throw new Error('defect-web-intake: invalid created_at');

  const title = stripKnownPrefix(issue?.title).trim();
  const reproduction =
    first(sections, ['steps to reproduce', 'reproduction']) ||
    'Reproduce the confirmed behavior described in Scope before implementing the fix.';
  const acceptanceCriteria = normalizeWebAcceptanceCriteria(
    first(sections, ['acceptance criteria']) ||
      '- [ ] The confirmed defect no longer reproduces and targeted regression coverage passes.'
  );
  const input = {
    projectDir,
    title,
    userStory:
      'As an AITM operator affected by a confirmed defect\n' +
      'I want the confirmed defect corrected\n' +
      'So that the expected behavior is restored with regression protection',
    scope,
    reproduction,
    acceptanceCriteria,
    rootCause: 'Confirm the code-level cause during the mandatory deep dive.',
    fixDirection: 'Implement the smallest regression-protected correction that satisfies the ACs.',
    outOfScope: 'Unrelated refactors and historical data rewrites are excluded.',
    storyOrigin: '- kind: code\n- source: github-web-form',
    planMetadata: '- Type: defect\n- Source: GitHub web form',
    priority: scalar(first(sections, ['priority']), /\b(P[0-3])\b/i).toUpperCase(),
    size: scalar(first(sections, ['size']), /\b(XS|XL|S|M|L)\b/i).toUpperCase(),
    estimate: scalar(first(sections, ['estimate']), /\b(\d+(?:\.\d+)?)\b/),
    rank: scalar(first(sections, ['rank']), /\b(\d+)\b/),
  };
  const render = renderDefect ?? defaultRenderDefect;
  const rendered = await render(input);
  const normalized = stampEntryMarker(String(rendered), 'backlog', createdAt);
  return Object.freeze({ status: 'normalized', body: normalized });
}
