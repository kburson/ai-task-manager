import { mkdirSync } from 'node:fs';
import { writeFile as writeFileDefault } from 'node:fs/promises';
import path from 'node:path';

import { extractPlanTasks } from './decomposition-policy.mjs';
import { CANONICAL_USER_STORY_TEMPLATE } from './user-story-author.mjs';
import { evaluateStoryProse, renderStoryFromIntent } from './user-story-quality.mjs';

function taskLabel(task) {
  const kind = task.kind === 'milestone' ? 'Milestone' : 'Task';
  return `${kind} ${task.number}: ${String(task.title).trim()}`;
}

export function validateSplitTasks(tasks) {
  const errors = [];
  const violations = [];
  const add = (task, code, message, line = null) => {
    violations.push(taskViolation(task, { code, message, line }));
    errors.push(message);
  };
  const seen = new Set();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const number = Number(task?.number);
    if (!Number.isInteger(number) || number <= 0) {
      add(task, 'split-task-number-invalid', `invalid task number: ${String(task?.number ?? '')}`);
    } else if (seen.has(number)) {
      add(task, 'split-task-number-duplicate', `duplicate task number: ${number}`);
    } else {
      seen.add(number);
    }
    if (!String(task?.title || '').trim()) {
      add(
        task,
        'split-task-title-missing',
        `task ${Number.isInteger(number) ? number : '?'} has an empty title`
      );
    }
    if (!Array.isArray(task?.commands) || task.commands.length === 0) {
      add(
        task,
        'split-task-verifier-missing',
        `task ${Number.isInteger(number) ? number : '?'} has no executable verifier`
      );
    }
    const intentViolations = task?.storyIntentViolations?.length
      ? task.storyIntentViolations
      : !task?.storyIntent
        ? [
            {
              code: 'story-intent-missing',
              line: task?.sourceLine,
              message: 'Add one valid #### Story Intent block before splitting',
            },
          ]
        : [];
    for (const violation of intentViolations) {
      const detail = taskViolation(task, {
        ...violation,
        code:
          violation.code === 'story-intent-missing'
            ? 'split-task-story-intent-missing'
            : violation.code,
      });
      violations.push(detail);
      errors.push(formatViolation(detail));
    }
  }
  if (!Array.isArray(tasks) || tasks.length === 0)
    add(null, 'split-tasks-missing', 'plan has no numbered tasks');
  return { ok: errors.length === 0, errors, violations };
}

function taskViolation(task, violation) {
  return {
    ...violation,
    taskNumber: task?.number ?? null,
    title: String(task?.title ?? '').slice(0, 240),
    kind: task?.kind ?? 'task',
    sourceLine: task?.sourceLine ?? null,
  };
}

function formatViolation(violation) {
  return `${violation.code}: ${taskLabel({ kind: violation.kind, number: violation.taskNumber, title: violation.title })} (source line ${violation.sourceLine ?? '?'}, line ${violation.line ?? violation.sourceLine ?? '?'}): ${violation.message}`;
}

function renderScope(input, task) {
  return [
    `Deliver ${taskLabel(task)} from \`${input.planPath}\`.`,
    '',
    `Bounded source section (${taskLabel(task)}):`,
    '',
    String(task.scopeBody || '').trim(),
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
  const violations = [...validation.violations];
  const rendered = tasks.map((task) => {
    const story = task.storyIntent ? renderStoryFromIntent(task.storyIntent) : null;
    if (story !== null) {
      const quality = evaluateStoryProse(story, {
        mode: 'approval',
        canonicalTemplate: CANONICAL_USER_STORY_TEMPLATE,
      });
      violations.push(...quality.violations.map((violation) => taskViolation(task, violation)));
    }
    return { task, story };
  });
  if (violations.length) {
    const error = new Error(`split-plan: ${violations.map(formatViolation).join('; ')}`);
    error.violations = violations;
    throw error;
  }
  return rendered.map(({ task, story }) => ({
    title: String(task.title).trim(),
    task: {
      number: task.number,
      kind: task.kind,
      heading: task.heading,
    },
    userStory: story,
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
    userStory: path.join(taskDir, 'user-story.md'),
    scope: path.join(taskDir, 'scope.md'),
    ac: path.join(taskDir, 'acs.md'),
    storyOrigin: path.join(taskDir, 'story-origin.md'),
    planMetadata: path.join(taskDir, 'plan-meta.md'),
    verificationCommands: path.join(taskDir, 'verification-commands.txt'),
  };
  await Promise.all([
    writeFile(paths.userStory, withFinalNewline(proposal.userStory), 'utf8'),
    writeFile(paths.scope, withFinalNewline(proposal.scope), 'utf8'),
    writeFile(paths.ac, withFinalNewline(proposal.acceptanceCriteria), 'utf8'),
    writeFile(paths.storyOrigin, withFinalNewline(proposal.storyOrigin), 'utf8'),
    writeFile(paths.planMetadata, withFinalNewline(proposal.planMetadata), 'utf8'),
    writeFile(
      paths.verificationCommands,
      withFinalNewline(proposal.verificationCommands.join('\n')),
      'utf8'
    ),
  ]);
  return {
    ...paths,
    creatorArgs: [
      ...proposal.creatorArgs,
      '--user-story-file',
      paths.userStory,
      '--scope-file',
      paths.scope,
      '--ac-file',
      paths.ac,
      '--story-origin-file',
      paths.storyOrigin,
      '--plan-metadata-file',
      paths.planMetadata,
      '--verification-commands-file',
      paths.verificationCommands,
    ],
  };
}
