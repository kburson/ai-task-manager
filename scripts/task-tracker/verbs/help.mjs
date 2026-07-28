// `/task help` renderer (#667).
//
// Thin presentation layer over `help-data.mjs`. `verbHelp(target)`:
//   - target names a known verb/alias → print that verb's full reference
//     (usage, flags+defaults, exit codes, examples).
//   - otherwise → print the top-level listing: verbs grouped by topic, the
//     state-transition map, and the gate/evidence model.
// No runtime behavior beyond printing; the data lives in help-data.mjs so the
// drift guard can assert against it without capturing stdout.

import { TOPICS, STATE_TRANSITIONS, GATE_EVIDENCE_MODEL } from './help-data.mjs';
import { agentCommandCatalog, commandByName } from '../lib/command-surface/catalog.mjs';

// Resolve a user-typed token to a canonical VERB_REFERENCE key, following
// aliases. Returns null when the token names no known verb.
export function resolveVerb(target) {
  if (!target) return null;
  const record = commandByName(String(target).trim());
  return record?.classification === 'agent-callable-verb' ? record.name : null;
}

function renderVerb(key) {
  const e = commandByName(key);
  const lines = [];
  lines.push(`/task ${e.name} — ${e.purpose}`);
  lines.push('');
  lines.push(`  Purpose: ${e.purpose}`);
  lines.push(`  Usage:  ${e.usage}`);
  if (e.aliases.length) {
    lines.push(`  Alias:  ${e.aliases.join(', ')}`);
  }
  lines.push('');
  lines.push('  Arguments:');
  if (e.arguments.length === 0) {
    lines.push('    none');
  } else {
    for (const argument of e.arguments) {
      const def = argument.default ? `  (default: ${argument.default})` : '';
      lines.push(`    ${argument.name}`);
      lines.push(`        ${argument.description}${def}`);
    }
  }
  for (const [heading, values] of [
    ['Preconditions', e.preconditions],
    ['Effects', e.effects],
    ['Output', e.output],
  ]) {
    lines.push('');
    lines.push(`  ${heading}:`);
    for (const value of values) lines.push(`    ${value}`);
  }
  lines.push('');
  lines.push('  Exit codes:');
  for (const c of e.exitCodes) {
    lines.push(`    ${c.code}  ${c.meaning}`);
  }
  lines.push('');
  lines.push('  Examples:');
  for (const ex of e.examples) lines.push(`    ${ex}`);
  lines.push('');
  lines.push('  Related:');
  for (const related of e.relatedCommands) lines.push(`    ${related}`);
  return lines.join('\n');
}

function renderTopLevel() {
  const lines = [];
  lines.push('Task Tracker — command reference');
  lines.push('');
  lines.push('Run `/task help <verb>` (or `/task <verb> --help`) for full detail on any command.');

  for (const topic of TOPICS) {
    const entries = agentCommandCatalog()
      .filter((entry) => entry.routing !== 'standalone')
      .filter((entry) => entry.group === topic.key);
    if (!entries.length) continue;
    lines.push('');
    lines.push(`${topic.title}:`);
    for (const e of entries) {
      const usage = e.usage.padEnd(30);
      lines.push(`  ${usage}  ${e.purpose}`);
    }
  }

  lines.push('');
  lines.push('State-transition map (8-state kanban):');
  for (const t of STATE_TRANSITIONS) {
    lines.push(`  ${`${t.from} → ${t.to}`.padEnd(20)} verb: ${t.verb}`);
    lines.push(`  ${''.padEnd(20)} gate: ${t.gate}`);
  }

  lines.push('');
  lines.push('Gate & evidence model:');
  for (const block of GATE_EVIDENCE_MODEL) {
    lines.push(`  ${block.heading}`);
    lines.push(`    ${block.body}`);
  }

  return lines.join('\n');
}

export function verbHelp(target) {
  const key = resolveVerb(target);
  if (key) {
    console.log(renderVerb(key));
    return;
  }
  console.log(renderTopLevel());
}
