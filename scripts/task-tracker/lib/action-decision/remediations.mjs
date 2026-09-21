const POSITIVE_INTEGER = Object.freeze({ type: 'positive-integer' });
const HEAD = Object.freeze({ type: 'head' });
const FULL_HEAD = /^[a-f0-9]{40,64}$/;

const REMEDIATIONS = Object.freeze([
  Object.freeze({
    id: 'record-plan-approval',
    actionId: 'promote',
    verb: 'plan-approve',
    argumentSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['issue']),
      properties: Object.freeze({ issue: POSITIVE_INTEGER }),
    }),
    humanRequired: true,
    providerAction: false,
    destructive: false,
    fullAutoAllowed: true,
    guidanceId: 'transition.plan-to-develop',
  }),
  Object.freeze({
    id: 'request-review-approval',
    actionId: 'deliver',
    verb: 'approve',
    argumentSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze(['issue', 'head']),
      properties: Object.freeze({ issue: POSITIVE_INTEGER, head: HEAD }),
    }),
    humanRequired: true,
    providerAction: false,
    destructive: false,
    fullAutoAllowed: true,
    guidanceId: 'transition.review-approval',
  }),
]);

const BY_ID = new Map(REMEDIATIONS.map((entry) => [entry.id, entry]));

function fail(message) {
  throw new TypeError(`action-remediation:${message}`);
}

function validateArgs(args, schema) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) fail('args');
  const actual = Object.keys(args).sort();
  const expected = [...schema.required].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('args');
  }
  for (const [key, definition] of Object.entries(schema.properties)) {
    const value = args[key];
    if (definition.type === 'positive-integer' && (!Number.isInteger(value) || value <= 0)) {
      fail(`args.${key}`);
    }
    if (definition.type === 'head' && !FULL_HEAD.test(value)) fail(`args.${key}`);
  }
}

export function listRemediations() {
  return [...REMEDIATIONS];
}

export function remediationDefinitionFor(id) {
  return BY_ID.get(id) ?? null;
}

export function validateRemediation(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('object');
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'args' || keys[1] !== 'id') fail('keys');
  const definition = BY_ID.get(value.id);
  if (!definition) fail(`unknown remediation ${String(value.id)}`);
  validateArgs(value.args, definition.argumentSchema);
  return structuredClone(value);
}
