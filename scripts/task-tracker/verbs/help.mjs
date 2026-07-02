// `/task help` renderer (#667).
//
// Thin presentation layer over `help-data.mjs`. `verbHelp(target)`:
//   - target names a known verb/alias → print that verb's full reference
//     (usage, flags+defaults, exit codes, examples).
//   - otherwise → print the top-level listing: verbs grouped by topic, the
//     state-transition map, and the gate/evidence model.
// No runtime behavior beyond printing; the data lives in help-data.mjs so the
// drift guard can assert against it without capturing stdout.

import {
  VERB_REFERENCE,
  TOPICS,
  COMMON_EXIT_CODES,
  STATE_TRANSITIONS,
  GATE_EVIDENCE_MODEL,
} from './help-data.mjs';

// Resolve a user-typed token to a canonical VERB_REFERENCE key, following
// aliases. Returns null when the token names no known verb.
export function resolveVerb(target) {
  if (!target) return null;
  const t = String(target)
    .trim()
    .replace(/^#/, (m) => m); // keep leading # for '#N'
  if (Object.prototype.hasOwnProperty.call(VERB_REFERENCE, t)) return t;
  // alias lookup: an entry whose `aliases` contains the token
  for (const [key, entry] of Object.entries(VERB_REFERENCE)) {
    if (Array.isArray(entry.aliases) && entry.aliases.includes(t)) return key;
  }
  return null;
}

function renderVerb(key) {
  const e = VERB_REFERENCE[key];
  const lines = [];
  lines.push(`/task ${key} — ${e.summary}`);
  lines.push('');
  lines.push(`  Usage:  ${e.usage}`);
  if (Array.isArray(e.aliases) && e.aliases.length) {
    lines.push(`  Alias:  ${e.aliases.join(', ')}`);
  }
  if (Array.isArray(e.flags) && e.flags.length) {
    lines.push('');
    lines.push('  Flags:');
    for (const f of e.flags) {
      const def = f.default ? `  (default: ${f.default})` : '';
      lines.push(`    ${f.flag}`);
      lines.push(`        ${f.desc}${def}`);
    }
  }
  lines.push('');
  lines.push('  Exit codes:');
  const codes = [...COMMON_EXIT_CODES];
  // verb-specific codes override/augment the common set by code number
  for (const c of e.exitCodes || []) {
    const idx = codes.findIndex((x) => x.code === c.code);
    if (idx >= 0) codes[idx] = c;
    else codes.push(c);
  }
  for (const c of codes.sort((a, b) => a.code - b.code)) {
    lines.push(`    ${c.code}  ${c.meaning}`);
  }
  lines.push('');
  lines.push('  Examples:');
  for (const ex of e.examples) lines.push(`    ${ex}`);
  return lines.join('\n');
}

function renderTopLevel() {
  const lines = [];
  lines.push('Task Tracker — command reference');
  lines.push('');
  lines.push('Run `/task help <verb>` (or `/task <verb> --help`) for full detail on any command.');

  for (const topic of TOPICS) {
    const entries = Object.entries(VERB_REFERENCE).filter(([, e]) => e.topic === topic.key);
    if (!entries.length) continue;
    lines.push('');
    lines.push(`${topic.title}:`);
    for (const [, e] of entries) {
      const usage = e.usage.padEnd(30);
      lines.push(`  ${usage}  ${e.summary}`);
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
