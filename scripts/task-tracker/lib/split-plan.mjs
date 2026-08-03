import { mkdirSync } from 'node:fs';
import { writeFile as writeFileDefault } from 'node:fs/promises';
import path from 'node:path';

import { extractPlanTasks } from './decomposition-policy.mjs';

function taskLabel(task) {
  const kind = task.kind === 'milestone' ? 'Milestone' : 'Task';
  return `${kind} ${task.number}: ${String(task.title).trim()}`;
}

export function validateSplitTasks(tasks) {
  const errors = [];
  const seen = new Set();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const number = Number(task?.number);
    if (!Number.isInteger(number) || number <= 0) {
      errors.push(`invalid task number: ${String(task?.number ?? '')}`);
    } else if (seen.has(number)) {
      errors.push(`duplicate task number: ${number}`);
    } else {
      seen.add(number);
    }
    if (!String(task?.title || '').trim()) {
      errors.push(`task ${Number.isInteger(number) ? number : '?'} has an empty title`);
    }
    if (!Array.isArray(task?.commands) || task.commands.length === 0) {
      errors.push(`task ${Number.isInteger(number) ? number : '?'} has no executable verifier`);
    }
  }
  if (!Array.isArray(tasks) || tasks.length === 0) errors.push('plan has no numbered tasks');
  return { ok: errors.length === 0, errors };
}

function renderScope(input, task) {
  return [
    `Deliver ${taskLabel(task)} from \`${input.planPath}\`.`,
    '',
    `Bounded source section (${taskLabel(task)}):`,
    '',
    String(task.body || '').trim(),
  ]
    .join('\n')
    .trim();
}

function renderAcceptanceCriteria(task) {
  const refs = task.commands.map((_, index) => `vc:${index + 1}`).join(' ');
  return `- [ ] Deliver ${JSON.stringify(task.heading)} exactly as specified in the pinned source plan. <!-- aitm-verified vc-list="${refs}" -->`;
}

function renderStoryOrigin(input, task) {
  return [
    '- **kind**: code',
    `- **discovered-during**: #${input.sourceIssue}`,
    `- **source-plan-section**: ${task.heading}`,
  ].join('\n');
}

function renderPlanMetadata(input, task) {
  return [
    `- **Parent-epic**: #${input.outerParent ?? input.sourceIssue}`,
    `- **Nested-epic**: #${input.sourceIssue}`,
    `- **Governing-spec**: ${input.governingSpec}`,
    `- **Source-plan**: ${input.planPath}`,
    `- **Source-plan-commit**: ${input.planCommit}`,
    `- **Source-plan-section**: ${task.heading}`,
    '- **Generated-by**: `npx aitm split-plan`',
  ].join('\n');
}

function baseCreatorArgs(input, task) {
  return [
    'create-issue',
    '--shape',
    'sub-issue',
    '--parent',
    String(input.sourceIssue),
    '--title',
    String(task.title).trim(),
  ];
}

export function buildSplitProposals(input = {}) {
  if (!Number.isInteger(Number(input.sourceIssue)) || Number(input.sourceIssue) <= 0) {
    throw new Error('split-plan: sourceIssue must be a positive integer');
  }
  for (const key of ['planPath', 'planCommit', 'governingSpec']) {
    if (!String(input[key] || '').trim()) throw new Error(`split-plan: ${key} is required`);
  }
  const tasks = extractPlanTasks(input.planText || '');
  const validation = validateSplitTasks(tasks);
  if (!validation.ok) throw new Error(`split-plan: ${validation.errors.join('; ')}`);
  return tasks.map((task) => ({
    title: String(task.title).trim(),
    task: {
      number: task.number,
      kind: task.kind,
      heading: task.heading,
    },
    scope: renderScope(input, task),
    acceptanceCriteria: renderAcceptanceCriteria(task),
    storyOrigin: renderStoryOrigin(input, task),
    planMetadata: renderPlanMetadata(input, task),
    verificationCommands: [...task.commands],
    creatorArgs: baseCreatorArgs(input, task),
  }));
}

function withFinalNewline(value) {
  return `${String(value).replace(/\n+$/u, '')}\n`;
}

export async function writeProposalFragments({
  proposal,
  scratchDir,
  writeFile = writeFileDefault,
} = {}) {
  if (!proposal?.task?.number) throw new Error('split-plan: proposal task identity is required');
  if (!scratchDir) throw new Error('split-plan: scratchDir is required');
  const taskDir = path.join(scratchDir, `task-${String(proposal.task.number).padStart(3, '0')}`);
  mkdirSync(taskDir, { recursive: true });
  const paths = {
    scope: path.join(taskDir, 'scope.md'),
    ac: path.join(taskDir, 'acs.md'),
    storyOrigin: path.join(taskDir, 'story-origin.md'),
    planMetadata: path.join(taskDir, 'plan-meta.md'),
  };
  await Promise.all([
    writeFile(paths.scope, withFinalNewline(proposal.scope), 'utf8'),
    writeFile(paths.ac, withFinalNewline(proposal.acceptanceCriteria), 'utf8'),
    writeFile(paths.storyOrigin, withFinalNewline(proposal.storyOrigin), 'utf8'),
    writeFile(paths.planMetadata, withFinalNewline(proposal.planMetadata), 'utf8'),
  ]);
  return {
    ...paths,
    creatorArgs: [
      ...proposal.creatorArgs,
      '--scope-file',
      paths.scope,
      '--ac-file',
      paths.ac,
      '--story-origin-file',
      paths.storyOrigin,
      '--plan-metadata-file',
      paths.planMetadata,
    ],
  };
}
