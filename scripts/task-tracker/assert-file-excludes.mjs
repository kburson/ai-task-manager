#!/usr/bin/env node
/**
 * Assert that a literal substring is absent from a file (#854).
 *
 * AC/VC evidence commands run through two shell-free executors:
 * `evidence-runner.mjs` (ac-stamp, no-shell `execFile`) and
 * `verification-allowlist.mjs` (Test/Review stage, `BIN_RULES`-gated). Neither
 * supports shell negation (`! grep -q ...`) or inline eval (`node -e`), so
 * "assert this string is gone from this file" — the natural VC for a
 * dead-code-removal issue — has no working shell-free primitive. This script
 * is that primitive, invoked as a plain `node <script> <args>` command (which
 * both executors accept).
 *
 * Usage:
 *   node scripts/task-tracker/assert-file-excludes.mjs <pattern> <file>
 *
 * Exit 0 if <pattern> (plain substring match, not a regex) is absent from
 * <file>. Exit 1 with a message on stderr if the pattern is present, the file
 * does not exist, or arguments are missing.
 */
import { readFileSync, existsSync } from 'node:fs';

const [pattern, file] = process.argv.slice(2);

if (!pattern || !file) {
  process.stderr.write('Usage: assert-file-excludes.mjs <pattern> <file>\n');
  process.exit(1);
}

if (!existsSync(file)) {
  process.stderr.write(`assert-file-excludes: file not found: ${file}\n`);
  process.exit(1);
}

const content = readFileSync(file, 'utf8');
if (content.includes(pattern)) {
  process.stderr.write(`assert-file-excludes: "${pattern}" found in ${file}\n`);
  process.exit(1);
}

process.exit(0);
