// @story #1011
// Aggregate normalized command catalog. Existing manifest/help exports remain
// compatibility facades until #1012 completes consumer convergence.

import { COMMAND_MANIFEST } from '../../command-manifest.mjs';
import { COMMON_EXIT_CODES, VERB_REFERENCE } from '../../verbs/help-data.mjs';
import { SELF_DOC } from '../../../lib/self-doc.mjs';
import { EXECUTABLE_ENTRYPOINTS } from './entrypoints.mjs';
import { normalizeHelpRecord, validateHelpRecord } from './schema.mjs';

const entrypointByCommand = new Map(
  EXECUTABLE_ENTRYPOINTS.filter((entry) => entry.command).map((entry) => [entry.command, entry])
);
const entrypointByPath = new Map(EXECUTABLE_ENTRYPOINTS.map((entry) => [entry.path, entry]));

function mergedExitCodes(extra = []) {
  const byCode = new Map(COMMON_EXIT_CODES.map((entry) => [entry.code, entry]));
  for (const entry of extra) byCode.set(entry.code, entry);
  return [...byCode.values()].sort((left, right) => left.code - right.code);
}

function verbPath(entry) {
  if (!entry || entry.dispatch === 'inline') {
    return 'scripts/task-tracker/task-tracker.mjs';
  }
  return `scripts/task-tracker/${entry.dispatch}`;
}

const manifestByVerb = new Map(COMMAND_MANIFEST.map((entry) => [entry.verb, entry]));
const coveredReferenceKeys = new Set();
const verbRecords = COMMAND_MANIFEST.map((manifest) => {
  const reference = VERB_REFERENCE[manifest.verb];
  if (!reference) throw new Error(`command catalog: missing verb reference for ${manifest.verb}`);
  coveredReferenceKeys.add(manifest.verb);
  for (const alias of manifest.aliases) coveredReferenceKeys.add(alias);
  const path = verbPath(manifest);
  const classified = entrypointByCommand.get(manifest.verb) || entrypointByPath.get(path);
  return normalizeHelpRecord({
    name: manifest.verb,
    aliases: manifest.aliases,
    classification: classified?.classification || 'agent-callable-verb',
    agentCallable: true,
    purpose: reference.summary,
    usage: reference.usage,
    flags: reference.flags,
    exitCodes: mergedExitCodes(reference.exitCodes),
    examples: reference.examples,
    relatedCommands: manifest.aliases.length ? ['help', ...manifest.aliases] : ['help'],
    path,
    routing: manifest.dispatch,
    group: reference.topic || manifest.category,
  });
});

const supplementalVerbRecords = Object.entries(VERB_REFERENCE)
  .filter(([name]) => !coveredReferenceKeys.has(name))
  .map(([name, reference]) =>
    normalizeHelpRecord({
      name,
      aliases: reference.aliases || [],
      classification: 'agent-callable-verb',
      agentCallable: true,
      purpose: reference.summary,
      usage: reference.usage,
      flags: reference.flags,
      exitCodes: mergedExitCodes(reference.exitCodes),
      examples: reference.examples,
      relatedCommands: ['help'],
      path: 'scripts/task-tracker/task-tracker.mjs',
      routing: 'inline',
      group: reference.topic,
    })
  );

const selfDocRecords = Object.entries(SELF_DOC).map(([name, doc]) => {
  const classified = entrypointByCommand.get(name) || entrypointByPath.get(doc.path);
  return normalizeHelpRecord({
    name,
    aliases: doc.aliases || [],
    classification: classified?.classification || doc.classification,
    agentCallable: doc.agentCallable ?? doc.routable !== false,
    purpose: doc.synopsis,
    usage: doc.usage,
    arguments: doc.arguments,
    preconditions: doc.preconditions,
    effects: doc.effects,
    output: doc.output,
    exitCodes: doc.exitCodes,
    examples: doc.examples || [`npx ${doc.usage}`],
    relatedCommands: doc.relatedCommands,
    path: doc.path,
    routing: doc.routable === false ? 'direct-only' : 'standalone',
    group: doc.group,
  });
});

const byName = new Map();
for (const record of [...verbRecords, ...supplementalVerbRecords, ...selfDocRecords]) {
  if (byName.has(record.name)) continue;
  byName.set(record.name, record);
}

export const COMMAND_CATALOG = Object.freeze([...byName.values()]);

const lookup = new Map();
for (const record of COMMAND_CATALOG) {
  for (const name of [record.name, ...record.aliases]) {
    if (lookup.has(name)) {
      throw new Error(`command catalog: duplicate command or alias ${name}`);
    }
    lookup.set(name, record);
  }
  const errors = validateHelpRecord(record);
  if (errors.length) {
    throw new Error(`command catalog: invalid ${record.name}: ${errors.join('; ')}`);
  }
}

export function commandByName(name) {
  return lookup.get(String(name)) || null;
}

export function agentCommandCatalog() {
  return COMMAND_CATALOG.filter((record) => record.agentCallable);
}

export function manifestEntryForCommand(name) {
  const record = commandByName(name);
  return record ? manifestByVerb.get(record.name) || null : null;
}
