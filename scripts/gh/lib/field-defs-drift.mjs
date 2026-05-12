// Pure helper: detect drift between a project-local field defs file and the
// package default by comparing the set of `key` values. Schema evolution
// (added/removed fields) is what matters; alias and option changes are
// intentionally out of scope.

import { readFileSync } from 'node:fs';

export function detectFieldDefsDrift(localArr, defaultArr) {
  const localKeys = new Set(localArr.map((d) => d.key));
  const defaultKeys = new Set(defaultArr.map((d) => d.key));
  const added = [...defaultKeys].filter((k) => !localKeys.has(k));
  const removed = [...localKeys].filter((k) => !defaultKeys.has(k));
  return { added, removed, inSync: added.length === 0 && removed.length === 0 };
}

export function formatDrift({ added, removed, inSync }) {
  if (inSync) return 'in-sync';
  const parts = [];
  if (added.length) parts.push(`added: ${added.join(',')}`);
  if (removed.length) parts.push(`removed: ${removed.join(',')}`);
  return parts.join(' ');
}

// CLI entry: node field-defs-drift.mjs <local.json> <default.json>
// Prints "in-sync" or e.g. "added: startTime removed: startDate,endDate".
if (import.meta.url === `file://${process.argv[1]}`) {
  const [localPath, defaultPath] = process.argv.slice(2);
  if (!localPath || !defaultPath) {
    console.error('usage: field-defs-drift.mjs <local.json> <default.json>');
    process.exit(2);
  }
  const local = JSON.parse(readFileSync(localPath, 'utf8'));
  const dflt = JSON.parse(readFileSync(defaultPath, 'utf8'));
  console.log(formatDrift(detectFieldDefsDrift(local, dflt)));
}
