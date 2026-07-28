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

const CLASSIFICATIONS = new Set([
  'agent-callable-verb',
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
]);
const ROUTINGS = /^(?:inline|standalone|direct-only|verbs\/[a-z0-9-]+\.mjs)$/;
const GROUPS = new Set([
  'lifecycle',
  'board',
  'evidence',
  'discovery',
  'meta',
  'CLI',
  'Epic Branching',
  'GitHub',
  'Maintenance',
  'Package lifecycle',
  'Parallel',
  'Reports',
  'Workflow',
]);

function freezeArray(items) {
  if (!Array.isArray(items)) return items;
  return Object.freeze(
    items.map((item) => (item && typeof item === 'object' ? Object.freeze({ ...item }) : item))
  );
}

export function normalizeHelpRecord(record) {
  const normalized = {
    name: record.name,
    aliases: freezeArray(record.aliases),
    classification: record.classification,
    agentCallable: record.agentCallable,
    purpose: record.purpose ?? record.summary ?? record.synopsis,
    usage: record.usage,
    arguments: freezeArray(
      record.arguments ??
        (Array.isArray(record.flags)
          ? record.flags.map((flag) => ({
              name: flag.flag,
              description: flag.desc,
              ...(flag.default ? { default: flag.default } : {}),
            }))
          : undefined)
    ),
    preconditions: freezeArray(record.preconditions),
    effects: freezeArray(record.effects),
    output: freezeArray(record.output),
    exitCodes: freezeArray(record.exitCodes),
    examples: freezeArray(record.examples),
    relatedCommands: freezeArray(record.relatedCommands),
    path: record.path,
    routing: record.routing,
    group: record.group ?? record.topic,
  };
  return Object.freeze(normalized);
}

export function validateHelpRecord(record) {
  const errors = [];
  for (const field of REQUIRED_HELP_FIELDS) {
    if (!Object.hasOwn(record, field)) errors.push(`missing ${field}`);
  }
  for (const field of ['name', 'classification', 'purpose', 'usage', 'path', 'routing', 'group']) {
    if (
      typeof record[field] !== 'string' ||
      !record[field].trim() ||
      /^(?:undefined|null|tbd|todo)$/i.test(record[field].trim())
    ) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (typeof record.classification === 'string' && !CLASSIFICATIONS.has(record.classification)) {
    errors.push(`classification is not recognized: ${record.classification}`);
  }
  if (typeof record.routing === 'string' && !ROUTINGS.test(record.routing)) {
    errors.push(`routing is not recognized: ${record.routing}`);
  }
  if (typeof record.group === 'string' && !GROUPS.has(record.group)) {
    errors.push(`group is not recognized: ${record.group}`);
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
  if (typeof record.usage === 'string' && /\s\[options\]\s*$/i.test(record.usage)) {
    errors.push('usage must enumerate supported arguments instead of [options]');
  }
  for (const field of ['preconditions', 'effects', 'output', 'relatedCommands']) {
    if (!Array.isArray(record[field]) || record[field].length === 0) {
      errors.push(`${field} must not be empty`);
    }
  }
  if (Array.isArray(record.arguments)) {
    for (const argument of record.arguments) {
      if (
        !argument ||
        typeof argument !== 'object' ||
        typeof argument.name !== 'string' ||
        !argument.name.trim() ||
        /^(?:undefined|null|tbd|todo)$/i.test(argument.name.trim()) ||
        typeof argument.description !== 'string' ||
        !argument.description.trim() ||
        /^(?:undefined|null|tbd|todo)$/i.test(argument.description.trim())
      ) {
        errors.push('arguments entries require non-empty name and description');
      }
      if (
        argument &&
        typeof argument === 'object' &&
        Object.hasOwn(argument, 'default') &&
        (typeof argument.default !== 'string' ||
          !argument.default.trim() ||
          /^(?:undefined|null|tbd|todo)$/i.test(argument.default.trim()))
      ) {
        errors.push('arguments default must be a meaningful non-placeholder string when present');
      }
    }
  }
  for (const field of [
    'aliases',
    'preconditions',
    'effects',
    'output',
    'examples',
    'relatedCommands',
  ]) {
    if (!Array.isArray(record[field])) continue;
    for (const value of record[field]) {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        /^(?:undefined|null|tbd|todo)$/i.test(value.trim())
      ) {
        errors.push(`${field} entries must be non-empty strings`);
      }
    }
  }
  if (Array.isArray(record.exitCodes)) {
    const seenCodes = new Set();
    for (const exitCode of record.exitCodes) {
      if (
        !exitCode ||
        typeof exitCode !== 'object' ||
        !Number.isInteger(exitCode.code) ||
        typeof exitCode.meaning !== 'string' ||
        !exitCode.meaning.trim() ||
        /^(?:undefined|null|tbd|todo)$/i.test(exitCode.meaning.trim())
      ) {
        errors.push('exitCodes entries require an integer code and non-empty meaning');
        continue;
      }
      if (seenCodes.has(exitCode.code)) errors.push(`duplicate exit code ${exitCode.code}`);
      seenCodes.add(exitCode.code);
    }
  }
  return errors;
}
