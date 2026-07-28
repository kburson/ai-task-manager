// @story #1011
// Normalized public command-help schema shared by verbs, standalone scripts,
// package lifecycle entry points, and live maintenance/migrations.

export const REQUIRED_HELP_FIELDS = Object.freeze([
  'name',
  'aliases',
  'classification',
  'agentCallable',
  'purpose',
  'usage',
  'arguments',
  'preconditions',
  'effects',
  'output',
  'exitCodes',
  'examples',
  'relatedCommands',
  'path',
  'routing',
  'group',
]);

function freezeArray(items) {
  return Object.freeze(
    items.map((item) =>
      item && typeof item === 'object' ? Object.freeze({ ...item }) : String(item)
    )
  );
}

export function normalizeHelpRecord(record) {
  const normalized = {
    name: String(record.name),
    aliases: freezeArray(record.aliases || []),
    classification: String(record.classification),
    agentCallable: record.agentCallable === true,
    purpose: String(record.purpose || record.summary || record.synopsis),
    usage: String(record.usage),
    arguments: freezeArray(
      record.arguments ||
        (record.flags || []).map((flag) => ({
          name: flag.flag,
          description: flag.desc,
          ...(flag.default ? { default: flag.default } : {}),
        }))
    ),
    preconditions: freezeArray(
      record.preconditions || ['See command usage and runtime gate diagnostics.']
    ),
    effects: freezeArray(
      record.effects || [
        'Help mode is side-effect-free; normal execution performs the documented command action.',
      ]
    ),
    output: freezeArray(
      record.output || ['Writes command results to stdout and actionable diagnostics to stderr.']
    ),
    exitCodes: freezeArray(
      record.exitCodes || [
        { code: 0, meaning: 'success (or idempotent no-op)' },
        { code: 1, meaning: 'runtime error (message on stderr)' },
        { code: 2, meaning: 'usage error / unknown command' },
      ]
    ),
    examples: freezeArray(record.examples),
    relatedCommands: freezeArray(record.relatedCommands || ['help']),
    path: String(record.path),
    routing: String(record.routing),
    group: String(record.group || record.topic || 'meta'),
  };
  return Object.freeze(normalized);
}

export function validateHelpRecord(record) {
  const errors = [];
  for (const field of REQUIRED_HELP_FIELDS) {
    if (!Object.hasOwn(record, field)) errors.push(`missing ${field}`);
  }
  for (const field of ['name', 'classification', 'purpose', 'usage', 'path', 'routing', 'group']) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  for (const field of [
    'aliases',
    'arguments',
    'preconditions',
    'effects',
    'output',
    'exitCodes',
    'examples',
    'relatedCommands',
  ]) {
    if (!Array.isArray(record[field])) errors.push(`${field} must be an array`);
  }
  if (!Array.isArray(record.examples) || record.examples.length === 0) {
    errors.push('examples must not be empty');
  }
  if (!Array.isArray(record.exitCodes) || record.exitCodes.length === 0) {
    errors.push('exitCodes must not be empty');
  }
  if (typeof record.agentCallable !== 'boolean') {
    errors.push('agentCallable must be boolean');
  }
  return errors;
}
