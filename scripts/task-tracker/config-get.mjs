#!/usr/bin/env node
// Read a single value from .ai-task-manager/task-tracker.json.
// Replaces ad-hoc `cat task-tracker.json | python3 -c "..."` patterns so
// orchestrators make one clean `node` call instead of a shell pipeline.
//
// Usage:
//   node node_modules/ai-task-manager/scripts/task-tracker/config-get.mjs <key> [default]
//
// Examples:
//   PROJECT_ID=$(node .../config-get.mjs projectId)
//   ASSIGNEE=$(node .../config-get.mjs assignee @me)
//   REPO=$(node .../config-get.mjs repo)
//
// Prints the value with no trailing newline.
// Exits 0 always; if the key is missing the default (or empty string) is printed.

import { readFileSync } from 'fs';
import { configPath } from './paths.mjs';

const [, , key, defaultValue = ''] = process.argv;

if (!key) {
  process.stderr.write('Usage: config-get.mjs <key> [default]\n');
  process.exit(1);
}

let config = {};
try {
  // configPath() prefers .ai-task-manager/ and falls back to the legacy .claude/ twin.
  config = JSON.parse(readFileSync(configPath(process.cwd()), 'utf8'));
} catch {
  /* config not found — use defaults */
}

const value = config[key] ?? defaultValue;
process.stdout.write(String(value));
