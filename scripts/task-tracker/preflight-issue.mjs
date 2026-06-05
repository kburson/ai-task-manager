#!/usr/bin/env node
// cspell:ignore optout
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
import { GIT_TIMEOUT_MS, GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { LIFECYCLE_LABELS, lifecycleSatisfaction } from './lib/lifecycle-dod.mjs';
import { FULL_AUTO_APPROVED_RE } from './lib/markers.mjs';
import { lintChecklistCommands, formatViolations } from './lib/checklist-command-lint.mjs';
import { formatIssueFieldDb } from './issue-field-db.mjs';

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

// #298 — Normalize section fill values BEFORE template substitution so the
// rendered body passes Refine→Plan / Plan→Develop gates without heal scripts.
//
// AC1 — H2 dedupe: if a fill begins with the same `## <heading>` that the
// template wraps it in, strip the duplicate leading heading line. Anchored;
// case-sensitive; only strips a single leading occurrence.
//
// AC2 — Numbered ACs → checkboxes: in the `acceptance_criteria` fill,
// line-anchor-convert `1. <text>` / `- <text>` to `- [ ] <text>`. Lines that
// already start with `- [` (checkbox) are left alone. One pass.
const SECTION_HEADINGS = {
  scope: '## Scope',
  acceptance_criteria: '## Acceptance Criteria',
  plan_metadata: '## Plan Metadata',
};

export function stripLeadingHeading(value, heading) {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}\\s*\\n+`, '');
  return value.replace(re, '');
}

export function normalizeAcceptanceCriteria(value) {
  const lines = value.split('\n');
  const out = lines.map((line) => {
    if (/^\s*- \[[ x]\]\s+/.test(line)) return line; // already a checkbox
    const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (numbered) return `${numbered[1]}- [ ] ${numbered[2]}`;
    const bullet = line.match(/^(\s*)-\s+(?!\[)(.+)$/);
    if (bullet) return `${bullet[1]}- [ ] ${bullet[2]}`;
    return line;
  });
  return out.join('\n');
}

export function normalizeFills(fills) {
  const out = { ...fills };
  for (const [key, heading] of Object.entries(SECTION_HEADINGS)) {
    if (typeof out[key] === 'string' && out[key]) {
      out[key] = stripLeadingHeading(out[key], heading);
    }
  }
  if (typeof out.acceptance_criteria === 'string') {
    out.acceptance_criteria = normalizeAcceptanceCriteria(out.acceptance_criteria);
  }
  return out;
}

// #298 AC3 — Build the `aitm-fields` trailer block from seed values forwarded
// by create-issue.mjs (priority/size/estimate/sequence/start-time). Returns
// null when no values were forwarded; caller then omits the trailer block.
function buildFieldsTrailer(args) {
  const keys = ['priority', 'size', 'estimate', 'sequence', 'start-time'];
  const out = {
    priority: null,
    size: null,
    estimate: null,
    engagedTime: null,
    sessionTime: null,
    reviewTime: null,
    sequence: null,
    startTime: null,
    blockedBy: null,
  };
  let any = false;
  for (const k of keys) {
    const raw = args[k];
    if (typeof raw !== 'string' || raw === '') continue;
    any = true;
    if (k === 'estimate') {
      const n = parseFloat(String(raw).replace(/h$/i, ''));
      out.estimate = Number.isFinite(n) ? n : null;
    } else if (k === 'sequence') {
      const n = parseInt(raw, 10);
      out.sequence = Number.isFinite(n) ? n : null;
    } else if (k === 'start-time') {
      out.startTime = raw;
    } else {
      out[k] = raw;
    }
  }
  return any ? formatIssueFieldDb(out) + '\n' : null;
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

  const rawFills = {
    scope: readFileOrDie(args['scope-file'], '--scope-file').trim(),
    acceptance_criteria: readFileOrDie(args['ac-file'], '--ac-file').trim(),
    plan_metadata: readFileOrDie(args['plan-metadata-file'], '--plan-metadata-file').trim(),
  };
  const fills = normalizeFills(rawFills);
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
  const assembled = body + tailBlock(dodPath);
  warnMissingLifecycleLabels(assembled);
  const lint = lintChecklistCommands(assembled);
  if (!lint.ok) {
    process.stderr.write('preflight-issue: checklist-forbidden-command\n');
    for (const line of formatViolations(lint.violations.filter((v) => v.severity === 'error'))) {
      process.stderr.write(`  ${line}\n`);
    }
    process.exit(12);
  }
  for (const w of lint.violations.filter((v) => v.severity === 'warn')) {
    process.stderr.write(
      `preflight-issue: WARN ac-evidence-marker:${w.lineIndex + 1} — marker payload "${w.command}" has no backtick-quoted commands (rule: ${w.rule})\n`
    );
  }
  process.stdout.write(body);
  process.stdout.write(tailBlock(dodPath));
  // #298 AC3 — emit `aitm-fields` trailer block from seed values forwarded
  // by create-issue.mjs. Goes BEFORE `aitm-body-version` so the body-shape
  // matches the canonical trailer order seen on healed issues.
  const fieldsTrailer = buildFieldsTrailer(args);
  if (fieldsTrailer) process.stdout.write(fieldsTrailer);
  // Epic #288: stamp the optimistic-concurrency marker on every newly-rendered
  // body. `pushIssueBody` bumps subsequent writes; this seeds version 1.
  process.stdout.write('<!-- aitm-body-version: 1 -->\n');
}

// #179 — Emit a stderr WARN if any reserved lifecycle label is absent from the
// assembled body. Never blocks; close-gate is the hard contract.
function warnMissingLifecycleLabels(body) {
  const missing = [];
  for (const [key, label] of Object.entries(LIFECYCLE_LABELS)) {
    if (!body.includes(label)) missing.push({ key, label });
  }
  if (missing.length === 0) return;
  process.stderr.write(
    [
      '',
      '[task-tracker] WARN: customized DoD is missing reserved lifecycle labels.',
      'These labels are auto-ticked by /task approve & /task close; absence will',
      'block close unless an opt-out marker is stamped per missing key:',
      ...missing.map(
        (m) => `   - ${m.key} (${m.label})  →  <!-- aitm-lifecycle-optout: ${m.key} -->`
      ),
      '',
    ].join('\n')
  );
}

async function checkIntegrity(issueNumber) {
  const num = String(issueNumber);
  if (!/^\d+$/.test(num)) {
    die(`--check-integrity expects an issue number (got: ${issueNumber})`);
  }
  let body;
  try {
    body = execFileSync('gh', ['issue', 'view', num, '--json', 'body', '--jq', '.body'], {
      encoding: 'utf8',
      timeout: GH_API_TIMEOUT_MS,
    });
  } catch (err) {
    die(`gh issue view #${num} failed: ${err.message}`);
    return;
  }
  const fullAutoApproved = FULL_AUTO_APPROVED_RE.test(String(body));
  const results = lifecycleSatisfaction(String(body), { fullAutoApproved });
  process.stderr.write(`[task-tracker] integrity check for #${num}:\n`);
  for (const r of results) {
    process.stderr.write(`   - ${r.key} (${r.label}): ${r.status}\n`);
  }
  const missing = results.filter((r) => r.status === 'missing');
  if (missing.length > 0) {
    process.stderr.write(`   close-gate would BLOCK: ${missing.map((m) => m.key).join(', ')}\n`);
    process.exit(0);
  }
  process.stderr.write('   close-gate would PASS.\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args['check-integrity'] === 'string') {
    await checkIntegrity(args['check-integrity']);
    return;
  }
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
  process.stdout.write('<!-- aitm-body-version: 1 -->\n');
}

main().catch((err) => {
  process.stderr.write(`preflight-issue: ${err.message || err}\n`);
  process.exit(2);
});
