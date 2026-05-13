#!/usr/bin/env node
// Preflight check before any `gh issue create` from the task skill.
//
// Two modes:
//   1. Tail-only (legacy): emits the Definition of Done + Pickup Directive
//      tail block to stdout for the skill to splice into a body it assembled
//      itself. Triggered when no --shape flag is given.
//   2. Full-body: with `--shape epic|sub-issue|solo`, emits a complete body
//      assembled from the matching `<shape>-body.md` template, with
//      `{{scope}}`, `{{acceptance_criteria}}`, `{{plan_metadata}}`, etc.
//      substituted from the provided files, then the tail block appended.
//      `.ai-task-manager/<shape>-body.md` overrides the packaged
//      `templates/<shape>-body.md` if present (same precedence as
//      pickup-directive.md and definition-of-done.md).
//
// Exit codes:
//   0 — templates present (and shape rendered if requested)
//   2 — templates missing OR required flag missing in --shape mode
//
// Usage:
//   node preflight-issue.mjs                    # tail block only
//   node preflight-issue.mjs --check-only       # verify templates, no stdout
//   node preflight-issue.mjs --shape <shape> \
//        --scope-file <p> --ac-file <p> --plan-metadata-file <p> \
//        [--parent <N>] [--sub-issue-list-file <p>]

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existingRuntimePath } from './paths.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_TEMPLATES_DIR = path.resolve(SCRIPT_DIR, '..', '..', 'templates');
const VALID_SHAPES = ['epic', 'sub-issue', 'solo'];

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  } catch {
    return process.cwd();
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'check-only') {
      out[key] = true;
      continue;
    }
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = val;
      i += 1;
    }
  }
  return out;
}

function die(msg, code = 2) {
  process.stderr.write(`preflight-issue: ${msg}\n`);
  process.exit(code);
}

function readFileOrDie(p, label) {
  try {
    return readFileSync(p, 'utf8');
  } catch (err) {
    die(`cannot read ${label} ${p}: ${err.message}`);
    return '';
  }
}

function templateFilename(shape) {
  // solo uses the legacy `solo-issue-body.md` name for symmetry with sub-issue.
  return shape === 'solo' ? 'solo-issue-body.md' : `${shape}-body.md`;
}

function loadTemplate(root, shape) {
  const filename = templateFilename(shape);
  const override = existingRuntimePath(root, `.ai-task-manager/${filename}`);
  if (override && existsSync(override)) return readFileSync(override, 'utf8');
  const packaged = path.join(PACKAGE_TEMPLATES_DIR, filename);
  if (!existsSync(packaged)) {
    die(`packaged template missing: ${packaged} (reinstall ai-task-manager)`);
  }
  return readFileSync(packaged, 'utf8');
}

// Strip leading <!-- ... --> header comment (documentation for agents);
// callers want the body skeleton only.
function stripHeaderComment(body) {
  const m = body.match(/^\s*<!--[\s\S]*?-->\s*\n+/);
  return m ? body.slice(m[0].length) : body;
}

function fillTemplate(template, fills) {
  let out = template;
  for (const [key, value] of Object.entries(fills)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function tailBlock(dodPath) {
  const dod = readFileSync(dodPath, 'utf8').replace(/\s+$/, '');
  return [
    '### Definition of Done',
    dod,
    '',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '',
    '---',
    '',
  ].join('\n');
}

function emitShape(args, dodPath, root) {
  const shape = args.shape;
  if (!VALID_SHAPES.includes(shape)) {
    die(`--shape must be one of: ${VALID_SHAPES.join(', ')} (got: ${shape})`);
  }
  const required = ['scope-file', 'ac-file', 'plan-metadata-file'];
  for (const flag of required) {
    if (typeof args[flag] !== 'string') die(`--${flag} required with --shape`);
  }
  if (shape === 'sub-issue' && typeof args.parent !== 'string') {
    die('--parent <N> required with --shape sub-issue');
  }

  const fills = {
    scope: readFileOrDie(args['scope-file'], '--scope-file').trim(),
    acceptance_criteria: readFileOrDie(args['ac-file'], '--ac-file').trim(),
    plan_metadata: readFileOrDie(args['plan-metadata-file'], '--plan-metadata-file').trim(),
  };
  if (shape === 'sub-issue') fills.parent_epic = `#${args.parent}`;
  if (shape === 'epic') {
    fills.sub_issue_list =
      typeof args['sub-issue-list-file'] === 'string'
        ? readFileOrDie(args['sub-issue-list-file'], '--sub-issue-list-file').trim()
        : '';
  }

  const template = loadTemplate(root, shape);
  const skeleton = stripHeaderComment(template);
  const body = fillTemplate(skeleton, fills).replace(/\s+$/, '') + '\n\n';
  process.stdout.write(body);
  process.stdout.write(tailBlock(dodPath));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const pickupPath = existingRuntimePath(root, '.ai-task-manager/pickup-directive.md');
  const dodPath = existingRuntimePath(root, '.ai-task-manager/definition-of-done.md');

  const missing = [];
  if (!existsSync(pickupPath)) missing.push('.ai-task-manager/pickup-directive.md');
  if (!existsSync(dodPath)) missing.push('.ai-task-manager/definition-of-done.md');

  if (missing.length > 0) {
    process.stderr.write(
      [
        '',
        'STOP - ai-task-manager templates are missing:',
        ...missing.map((p) => `   - ${p}`),
        '',
        'No GitHub issues will be created until the skill is (re)installed in this',
        'project. Run:',
        '',
        '   npx ai-task-manager install',
        '',
        'Then retry. If the install completes but files are still missing, check that',
        'you ran the command from the project root.',
        '',
      ].join('\n')
    );
    process.exit(2);
  }

  if (args['check-only']) {
    process.stderr.write(
      '[task-tracker] preflight ok — pickup-directive.md and definition-of-done.md present\n'
    );
    process.exit(0);
  }

  if (typeof args.shape === 'string') {
    emitShape(args, dodPath, root);
    return;
  }

  // Legacy tail-only mode.
  process.stdout.write(tailBlock(dodPath));
}

main();
