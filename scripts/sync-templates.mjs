#!/usr/bin/env node
// #501 — refresh the tracked `.ai-task-manager/templates/` runtime mirror from
// `templates/`. Lightweight, idempotent counterpart to `installTemplates()`
// (bin/cli.mjs): copies ONLY the markdown template set (TEMPLATE_FILES) and
// touches no hooks/settings/config.
//
// Why this exists: editing a file under `templates/` left the deployed mirror
// stale until `templates.test.mjs`'s byte-identity guard failed. The only
// refresh path was a full `aitm install`. This command is the targeted fix —
// run `npm run sync:templates` after editing a template.
//
// `syncTemplates({ srcDir, destDir, files })` is the pure, injectable core so
// the behavior can be tested against a fixture pair without mutating the real
// runtime mirror.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';

import { TEMPLATE_FILES } from '../bin/lib/template-manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

/**
 * Copy each `files[i]` from `srcDir` into `destDir`, overwriting. Returns a
 * per-file result: `synced` when the destination changed (or was created),
 * `unchanged` when it was already byte-identical.
 *
 * @param {object} opts
 * @param {string} opts.srcDir   directory holding the canonical templates
 * @param {string} opts.destDir  runtime mirror directory (created if absent)
 * @param {string[]} [opts.files] template file names (defaults to TEMPLATE_FILES)
 * @returns {{name:string, status:'synced'|'unchanged'}[]}
 */
export function syncTemplates({ srcDir, destDir, files = TEMPLATE_FILES } = {}) {
  if (!srcDir) throw new Error('syncTemplates: srcDir is required');
  if (!destDir) throw new Error('syncTemplates: destDir is required');
  mkdirSync(destDir, { recursive: true });
  const results = [];
  for (const name of files) {
    const src = join(srcDir, name);
    const out = join(destDir, name);
    const bundled = readFileSync(src, 'utf8');
    const changed = !existsSync(out) || readFileSync(out, 'utf8') !== bundled;
    if (changed) copyFileSync(src, out);
    results.push({ name, status: changed ? 'synced' : 'unchanged' });
  }
  return results;
}

/**
 * Recursively mirror the `templates/references/` subtree into the runtime
 * `.ai-task-manager/templates/references/` mirror. Directory-driven (mirrors
 * `installReferences()` in bin/cli.mjs) so a new reference file is picked up
 * with no manifest edit. Returns one result per file, with `name` relative to
 * `srcDir`. No-op when `srcDir` is absent.
 *
 * @param {object} opts
 * @param {string} opts.srcDir   `templates/references` (or a subdir, in recursion)
 * @param {string} opts.destDir  `.ai-task-manager/templates/references` (or a subdir)
 * @param {string} [opts.prefix] relative path accumulator (internal)
 * @returns {{name:string, status:'synced'|'unchanged'}[]}
 */
export function syncReferenceTree({ srcDir, destDir, prefix = '' } = {}) {
  if (!srcDir) throw new Error('syncReferenceTree: srcDir is required');
  if (!destDir) throw new Error('syncReferenceTree: destDir is required');
  if (!existsSync(srcDir)) return [];
  mkdirSync(destDir, { recursive: true });
  const results = [];
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      results.push(...syncReferenceTree({ srcDir: srcPath, destDir: destPath, prefix: rel }));
      continue;
    }
    if (!st.isFile()) continue;
    const bundled = readFileSync(srcPath, 'utf8');
    const changed = !existsSync(destPath) || readFileSync(destPath, 'utf8') !== bundled;
    if (changed) copyFileSync(srcPath, destPath);
    results.push({ name: `references/${rel}`, status: changed ? 'synced' : 'unchanged' });
  }
  return results;
}

function main() {
  const results = [
    ...syncTemplates({
      srcDir: join(REPO_ROOT, 'templates'),
      destDir: join(REPO_ROOT, '.ai-task-manager', 'templates'),
    }),
    ...syncReferenceTree({
      srcDir: join(REPO_ROOT, 'templates', 'references'),
      destDir: join(REPO_ROOT, '.ai-task-manager', 'templates', 'references'),
    }),
  ];
  const synced = results.filter((r) => r.status === 'synced');
  for (const r of results) {
    console.log(
      `  ${r.status === 'synced' ? '↻' : '·'} .ai-task-manager/templates/${r.name} (${r.status})`
    );
  }
  console.log(
    `✓ sync:templates — ${synced.length} refreshed, ${results.length - synced.length} already in sync`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
