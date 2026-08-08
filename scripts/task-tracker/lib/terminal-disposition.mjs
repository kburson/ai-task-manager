import {
  fieldOptionMap,
  projectItemForIssue,
  projectValuesForIssue,
  writeProjectFieldValue,
} from '../../gh/lib/github-projects.mjs';
import { fieldIdFor } from '../project-fields.mjs';

export const TERMINAL_DISPOSITIONS = Object.freeze([
  'Delivered',
  'Replaced',
  'Discarded',
  'Duplicate',
]);

function assertTerminalConfig(cfg, issueNumber) {
  if (!cfg?.repo || !cfg.projectId) {
    throw new Error(`terminal disposition for #${issueNumber} requires cfg.repo and cfg.projectId`);
  }
}

async function resolveItem({ cfg, issueNumber, deps }) {
  const getItem = deps.projectItemForIssue || projectItemForIssue;
  const { itemId } = await getItem({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
  });
  if (!itemId) {
    throw new Error(
      `terminal disposition for #${issueNumber} requires a project item on ${cfg.projectId}`
    );
  }
  return itemId;
}

export async function writeTerminalDisposition({ cfg, issueNumber, disposition, deps = {} } = {}) {
  assertTerminalConfig(cfg, issueNumber);
  if (!TERMINAL_DISPOSITIONS.includes(disposition)) {
    throw new Error(
      `terminal disposition for #${issueNumber} must be one of ${TERMINAL_DISPOSITIONS.join(', ')}`
    );
  }
  const fieldId = fieldIdFor(cfg, 'disposition');
  if (!fieldId) {
    throw new Error(
      `terminal disposition for #${issueNumber} requires cfg.fieldDisposition or cfg.fieldIds.disposition; run init-repair`
    );
  }
  const itemId = await resolveItem({ cfg, issueNumber, deps });
  const getOptions = deps.fieldOptionMap || fieldOptionMap;
  const optionMap = await getOptions(cfg.projectId);
  if (!optionMap[fieldId]?.[disposition]) {
    throw new Error(
      `terminal disposition field ${fieldId} has no "${disposition}" option; run init-repair`
    );
  }
  const write = deps.writeProjectFieldValue || writeProjectFieldValue;
  const written = await write({
    projectId: cfg.projectId,
    itemId,
    fieldId,
    value: { singleSelectOptionName: disposition },
    optionMap,
  });
  if (!written) {
    throw new Error(
      `terminal disposition write for #${issueNumber} did not resolve "${disposition}"`
    );
  }
  return { issueNumber, disposition, fieldId, itemId };
}

export async function writeTerminalStatusDone({ cfg, issueNumber, deps = {} } = {}) {
  assertTerminalConfig(cfg, issueNumber);
  if (!cfg.kanbanFieldId || !cfg.kanbanOptionDone) {
    throw new Error(
      `terminal status for #${issueNumber} requires cfg.kanbanFieldId and cfg.kanbanOptionDone`
    );
  }
  const itemId = await resolveItem({ cfg, issueNumber, deps });
  const optionMap = { [cfg.kanbanFieldId]: { Done: cfg.kanbanOptionDone } };
  const write = deps.writeProjectFieldValue || writeProjectFieldValue;
  const written = await write({
    projectId: cfg.projectId,
    itemId,
    fieldId: cfg.kanbanFieldId,
    value: { singleSelectOptionName: 'Done' },
    optionMap,
  });
  if (!written) {
    throw new Error(`terminal status write for #${issueNumber} did not resolve Done`);
  }
  return { issueNumber, status: 'Done', itemId };
}

export async function readTerminalDisposition({ cfg, issueNumber, deps = {} } = {}) {
  assertTerminalConfig(cfg, issueNumber);
  const readValues = deps.projectValuesForIssue || projectValuesForIssue;
  const values = await readValues({
    cfg,
    fieldDefs: [{ key: 'disposition', type: 'single_select' }],
    issueNumber,
  });
  return values.disposition || '';
}
