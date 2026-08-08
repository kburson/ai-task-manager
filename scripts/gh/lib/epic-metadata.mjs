// #1130 — one authority for Epic issue metadata convergence.

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { EPIC_PREFIX, ensureEpicPrefix } from './kind-prefix.mjs';
import { mutateIssueBody as defaultMutateIssueBody } from '../../task-tracker/lib/issue-body-mutate.mjs';
import { reconcileDodForKind } from '../../task-tracker/lib/dod-kind-filter.mjs';
import {
  auditEvidenceMarkers,
  parseEvidenceChecklist,
} from '../../task-tracker/lib/evidence-markers.mjs';
import { setIssueKindMarker, parseIssueKind } from '../../task-tracker/lib/issue-kind.mjs';
import { locateFunctionalSection } from '../../task-tracker/lib/lifecycle-dod.mjs';
import { appendVcCommands } from '../../task-tracker/lib/vc-emit.mjs';
import { dodPath } from '../../task-tracker/paths.mjs';

const pexec = promisify(execFile);

export const EPIC_LABEL = 'epic';

function labelNames(labels = []) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter((label) => typeof label === 'string' && label.trim() !== '');
}

export function planEpicMetadata({ title, labels = [], body = '', forceEpic = false } = {}) {
  const currentLabels = labelNames(labels);
  const lower = new Set(currentLabels.map((label) => label.toLowerCase()));
  const isEpic = Boolean(forceEpic) || parseIssueKind(body) === 'epic' || lower.has(EPIC_LABEL);
  const currentTitle = String(title ?? '');
  if (!isEpic) {
    return {
      isEpic: false,
      desiredTitle: currentTitle,
      titleChanged: false,
      labelsToAdd: [],
    };
  }
  const desiredTitle = ensureEpicPrefix(currentTitle);
  return {
    isEpic: true,
    desiredTitle,
    titleChanged: desiredTitle !== currentTitle,
    labelsToAdd: lower.has(EPIC_LABEL) ? [] : [EPIC_LABEL],
  };
}

export function reconcileEpicBody(body, templateDodText) {
  const marked = setIssueKindMarker(String(body || ''), 'epic');
  const functional = locateFunctionalSection(marked);
  if (!functional) return marked;
  const reconciled = reconcileDodForKind(functional.section, templateDodText, 'epic');
  const kindReconciled =
    reconciled === functional.section ? marked : functional.before + reconciled + functional.after;
  const functionalCommands = new Set(
    parseEvidenceChecklist(kindReconciled).functionalDodItems.flatMap(
      ({ evidenceCommands }) => evidenceCommands
    )
  );
  const missingFunctionalCommands = auditEvidenceMarkers(
    kindReconciled
  ).missingVerificationCommands.filter((command) => functionalCommands.has(command));
  return missingFunctionalCommands.length
    ? appendVcCommands(kindReconciled, missingFunctionalCommands)
    : kindReconciled;
}

async function readIssue({ issueNumber, repo, run = pexec }) {
  const { stdout } = await run(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'title,body,labels'],
    { timeout: 15000, maxBuffer: 16 * 1024 * 1024 }
  );
  const issue = JSON.parse(stdout || '{}');
  return { title: issue.title, body: issue.body, labels: labelNames(issue.labels) };
}

async function writeVisible({ issueNumber, repo, title, labelsToAdd, run = pexec }) {
  const args = ['issue', 'edit', String(issueNumber), '-R', repo];
  for (const label of labelsToAdd) args.push('--add-label', label);
  if (title != null) args.push('--title', title);
  if (args.length === 5) return;
  await run('gh', args, { timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
}

export async function reconcileEpicMetadata({
  issueNumber,
  repo,
  forceEpic = false,
  deps = {},
} = {}) {
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error('reconcileEpicMetadata: issueNumber is required');
  }
  if (!repo) throw new Error('reconcileEpicMetadata: repo is required');

  const run = deps.pexec || pexec;
  const read = deps.readIssue || ((input) => readIssue({ ...input, run }));
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const write = deps.writeVisible || ((input) => writeVisible({ ...input, run }));
  const readDodTemplate = deps.readDodTemplate || (() => readFileSync(dodPath(), 'utf8'));
  const templateDodText = readDodTemplate();
  const target = { issueNumber: Number(issueNumber), repo };
  const before = await read(target);
  const plan = planEpicMetadata({ ...before, forceEpic });
  if (!plan.isEpic) return { status: 'not-epic', ...target };

  const desiredBody = reconcileEpicBody(before.body, templateDodText);
  const bodyChanged = desiredBody !== before.body;
  if (bodyChanged) {
    await mutateBody({
      ...target,
      deps: { pexec: run },
      mutate: (liveBody) => reconcileEpicBody(liveBody, templateDodText),
    });
  }
  if (plan.titleChanged || plan.labelsToAdd.length > 0) {
    await write({
      ...target,
      title: plan.titleChanged ? plan.desiredTitle : null,
      labelsToAdd: plan.labelsToAdd,
    });
  }

  const after = await read(target);
  const readback = planEpicMetadata({ ...after, forceEpic });
  const bodyConverged = reconcileEpicBody(after.body, templateDodText) === after.body;
  if (readback.labelsToAdd.length > 0 || readback.titleChanged || !bodyConverged) {
    throw new Error(`reconcileEpicMetadata: readback incomplete for #${issueNumber}`);
  }

  const changed = bodyChanged || plan.titleChanged || plan.labelsToAdd.length > 0;
  return { status: changed ? 'reconciled' : 'already-converged', ...target };
}

export { EPIC_PREFIX };
