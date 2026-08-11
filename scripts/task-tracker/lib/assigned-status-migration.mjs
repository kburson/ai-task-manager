// #1206 — explicit GitHub Project Status option rename.
//
// The operation is read-only unless `apply: true` is supplied. It updates the
// existing single-select field with every existing option id, changing only
// the legacy option's display name. Project item values reference that stable
// option id, so no item-field mutation is needed or permitted.

function migrationError(message) {
  const error = new Error(`Assigned status migration: ${message}`);
  error.name = 'AssignedStatusMigrationError';
  return error;
}

async function fetchStatusField({ projectId, kanbanFieldId, gql }) {
  const data = await gql(
    `
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 100) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name color description }
              }
            }
          }
        }
      }
    }`,
    { project: projectId }
  );
  const fields = data?.node?.fields?.nodes || [];
  const field = fields.find((candidate) => candidate?.id === kanbanFieldId);
  if (!field) throw migrationError(`configured Status field ${kanbanFieldId} was not found`);
  if (!Array.isArray(field.options)) {
    throw migrationError(`configured field ${kanbanFieldId} is not a single-select field`);
  }
  return field;
}

function optionInput(option, targetId) {
  if (!option?.id) throw migrationError(`option "${option?.name || '(unnamed)'}" has no id`);
  return {
    id: option.id,
    name: option.id === targetId ? 'Assigned' : option.name,
    color: option.color,
    description: option.description ?? '',
  };
}

function inspectField(field, configuredOptionId) {
  const legacy = field.options.filter((option) => option?.name === 'On Deck');
  const assigned = field.options.filter((option) => option?.name === 'Assigned');
  if (legacy.length > 0 && assigned.length > 0) {
    throw migrationError('Status field contains both On Deck and Assigned options');
  }
  if (legacy.length > 1 || assigned.length > 1) {
    throw migrationError('Status field contains duplicate Assigned-state options');
  }
  const target = legacy[0] || assigned[0];
  if (!target) throw migrationError('Status field contains neither On Deck nor Assigned');
  if (configuredOptionId && configuredOptionId !== target.id) {
    throw migrationError(
      `configured option id ${configuredOptionId} does not match live option id ${target.id}`
    );
  }
  return { target, changed: legacy.length === 1 };
}

function verifyAppliedField({ before, after, optionId }) {
  const beforeIds = before.options.map(({ id }) => id);
  const afterIds = new Set(after.options.map(({ id }) => id));
  if (after.id !== before.id) throw migrationError('Status field id changed after apply');
  if (beforeIds.some((id) => !afterIds.has(id)) || afterIds.size !== beforeIds.length) {
    throw migrationError('one or more Status option ids changed after apply');
  }
  const renamed = after.options.find(({ id }) => id === optionId);
  if (renamed?.name !== 'Assigned') {
    throw migrationError(`option ${optionId} did not verify as Assigned after apply`);
  }
  if (after.options.some(({ name }) => name === 'On Deck')) {
    throw migrationError('legacy On Deck option still exists after apply');
  }
}

export async function runAssignedStatusMigration({
  projectId,
  kanbanFieldId,
  configuredOptionId = '',
  apply = false,
  gql,
} = {}) {
  if (!projectId) throw migrationError('projectId is required');
  if (!kanbanFieldId) throw migrationError('kanbanFieldId is required');
  if (typeof gql !== 'function') throw migrationError('gql function is required');

  const before = await fetchStatusField({ projectId, kanbanFieldId, gql });
  const { target, changed } = inspectField(before, configuredOptionId);
  if (!changed) {
    return {
      changed: false,
      applied: false,
      verified: true,
      fieldId: before.id,
      optionId: target.id,
      options: before.options,
      itemRetention: 'preserved-by-option-id',
    };
  }

  const options = before.options.map((option) => optionInput(option, target.id));
  const plan = {
    changed: true,
    applied: false,
    verified: false,
    fieldId: before.id,
    optionId: target.id,
    beforeName: 'On Deck',
    afterName: 'Assigned',
    options,
    itemRetention: 'preserved-by-option-id',
  };
  if (!apply) return plan;

  await gql(
    `
    mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      updateProjectV2Field(input: { fieldId: $field, singleSelectOptions: $options }) {
        projectV2Field { ... on ProjectV2SingleSelectField { id } }
      }
    }`,
    { field: before.id, options }
  );

  const after = await fetchStatusField({ projectId, kanbanFieldId, gql });
  verifyAppliedField({ before, after, optionId: target.id });
  return { ...plan, applied: true, verified: true };
}
