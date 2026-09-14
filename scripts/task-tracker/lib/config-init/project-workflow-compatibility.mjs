const ERROR_PREFIX = 'project-workflow-compatibility:';

export const INCOMPATIBLE_PROJECT_WORKFLOW_NAMES = Object.freeze(
  new Set(['auto-close issue', 'pull request linked to issue', 'pull request merged'])
);

function fail(message) {
  throw new Error(`${ERROR_PREFIX} ${message}`);
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function validateWorkflow(workflow, index) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    fail(`workflow at index ${index} must be an object`);
  }
  if (typeof workflow.name !== 'string' || workflow.name.trim() === '') {
    fail(`workflow at index ${index} must have a non-empty name`);
  }
  if (!Number.isInteger(workflow.number) || workflow.number <= 0) {
    fail(`workflow at index ${index} must have a positive integer number`);
  }
  if (typeof workflow.enabled !== 'boolean') {
    fail(`workflow at index ${index} must have a boolean enabled value`);
  }
}

export function inspectProjectWorkflows(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('input must be an object');
  }
  if (input.complete !== true) {
    fail('inventory must be explicitly complete');
  }
  if (!Array.isArray(input.workflows)) {
    fail('workflows must be an array');
  }

  const byNumber = new Map();
  input.workflows.forEach((workflow, index) => {
    validateWorkflow(workflow, index);
    const previous = byNumber.get(workflow.number);
    if (previous) {
      if (previous.name !== workflow.name || previous.enabled !== workflow.enabled) {
        fail(`conflicting entries for workflow number ${workflow.number}`);
      }
      return;
    }
    byNumber.set(workflow.number, {
      name: workflow.name,
      number: workflow.number,
      enabled: workflow.enabled,
    });
  });

  const workflows = [...byNumber.values()].sort(
    (left, right) => left.number - right.number || left.name.localeCompare(right.name)
  );
  const incompatible = workflows.filter(
    (workflow) =>
      workflow.enabled && INCOMPATIBLE_PROJECT_WORKFLOW_NAMES.has(normalizeName(workflow.name))
  );

  return { workflows, incompatible };
}
