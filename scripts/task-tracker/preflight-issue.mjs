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
import { existingRuntimePath, RUNTIME_REL, SHARED_DIR } from './paths.mjs';
import { GIT_TIMEOUT_MS, GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { LIFECYCLE_LABELS, lifecycleSatisfaction } from './lib/lifecycle-dod.mjs';
import { hasFullAutoApproved } from './lib/markers.mjs';
import { lintChecklistCommands, formatViolations } from './lib/checklist-command-lint.mjs';
import { auditEvidenceMarkers } from './lib/evidence-markers.mjs';
import { normalizePlanMetadataValue } from './lib/plan-metadata.mjs';
import { formatIssueFieldDb } from './issue-field-db.mjs';
import { serializeMarker } from './lib/marker-grammar.mjs';
import { setIssueKindMarker, normalizeKind } from './lib/issue-kind.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_TEMPLATES_DIR = path.resolve(SCRIPT_DIR, '..', '..', 'templates');
const VALID_SHAPES = ['epic', 'sub-issue', 'solo', 'stub'];

// #426 — placeholder fills for the lightweight `stub` shape. These deliberately
// fail the Refine→Plan gate (no substantive ACs, no Plan Metadata) until the
// Refine stage replaces them; a stub is fast idea-capture, not a planned story.
const STUB_SCOPE_PLACEHOLDER = '_Stub — describe the work at Refine._';
const STUB_AC_PLACEHOLDER = '- [ ] _TBD — define acceptance criteria at Refine._';
const STUB_PLAN_METADATA_PLACEHOLDER = '_TBD — set Size, Estimate, Priority, and Rank at Refine._';

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
  const override = existingRuntimePath(root, `${SHARED_DIR}/${filename}`);
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

// Plan Metadata label emphasis (#416, fixed in #488). Delegates to the shared
// `lib/plan-metadata.mjs` core so creation, back-fill, and the enforcement lint
// share one definition of a label. Handles both the bulleted list form
// (`- label: value`) used by real metadata and the bare form, and is idempotent
// on already-bold labels. Kept as a named export for the existing test surface.
export function normalizePlanMetadata(value) {
  return normalizePlanMetadataValue(value);
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
  if (typeof out.plan_metadata === 'string') {
    out.plan_metadata = normalizePlanMetadata(out.plan_metadata);
  }
  return out;
}

// #298 AC3 — Build the `aitm-fields` trailer block from seed values forwarded
// by create-issue.mjs (priority/size/estimate/rank/start-time). Returns
// null when no values were forwarded; caller then omits the trailer block.
function buildFieldsTrailer(args) {
  const keys = ['priority', 'size', 'estimate', 'rank', 'start-time'];
  const out = {
    priority: null,
    size: null,
    estimate: null,
    engagedTime: null,
    sessionTime: null,
    reviewTime: null,
    rank: null,
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
    } else if (k === 'rank') {
      const n = parseInt(raw, 10);
      out.rank = Number.isFinite(n) ? n : null;
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
  // #480 — `## Definition of Done` (2-hash) is a top-level sibling of
  // `## Acceptance Criteria` / `## Verification Commands`, so the CODE_COMPLETE
  // AC slice (`NEXT_HEADING_RE = /^##\s+/`) terminates at it and stops slurping
  // the DoD Functional/Lifecycle items. Canonical order is
  // DoD → `---` → Pickup Directive.
  return [
    '## Definition of Done',
    dod,
    '',
    '---',
    '',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '',
  ].join('\n');
}

function emitShape(args, dodPath, root) {
  const shape = args.shape;
  if (!VALID_SHAPES.includes(shape)) {
    die(`--shape must be one of: ${VALID_SHAPES.join(', ')} (got: ${shape})`);
  }
  if (shape === 'sub-issue' && typeof args.parent !== 'string') {
    die('--parent <N> required with --shape sub-issue');
  }

  let rawFills;
  if (shape === 'stub') {
    // #426 — stub: no section files required. An optional --idea-file seeds
    // Scope; AC and Plan Metadata are placeholders the Refine stage fills.
    const idea =
      typeof args['idea-file'] === 'string'
        ? readFileOrDie(args['idea-file'], '--idea-file').trim()
        : '';
    rawFills = {
      scope: idea || STUB_SCOPE_PLACEHOLDER,
      acceptance_criteria: STUB_AC_PLACEHOLDER,
      plan_metadata: STUB_PLAN_METADATA_PLACEHOLDER,
    };
  } else {
    const required = ['scope-file', 'ac-file', 'plan-metadata-file'];
    for (const flag of required) {
      if (typeof args[flag] !== 'string') die(`--${flag} required with --shape`);
    }
    rawFills = {
      scope: readFileOrDie(args['scope-file'], '--scope-file').trim(),
      acceptance_criteria: readFileOrDie(args['ac-file'], '--ac-file').trim(),
      plan_metadata: readFileOrDie(args['plan-metadata-file'], '--plan-metadata-file').trim(),
    };
  }
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
  // #410 — Seed a `## Verification Commands` section so a freshly-rendered body
  // is a fixed point of the test→review evidence audit. The seed set is derived
  // from the assembled body itself (DoD Functional commands + any AC-level
  // `aitm-verified-by` commands) via the same audit review-preflight runs, so
  // the rendered issue passes VC-membership with no manual post-creation edit.
  const seedCmds = auditEvidenceMarkers(assembled).missingVerificationCommands;
  let finalBody = assembled;
  if (seedCmds.length) {
    const vcSection =
      '## Verification Commands\n\n' + seedCmds.map((c) => `- [ ] \`${c}\``).join('\n') + '\n\n';
    // #480 — VC sits BETWEEN `## Acceptance Criteria` and `## Definition of Done`
    // (canonical order), so anchor on the DoD heading rather than Pickup.
    const anchor = '## Definition of Done';
    const idx = finalBody.indexOf(anchor);
    finalBody =
      idx === -1
        ? finalBody + vcSection
        : finalBody.slice(0, idx) + vcSection + finalBody.slice(idx);
  }
  // #494, #500 — `--kind <audit|research|spike|epic>` stamps the issue-kind
  // marker at creation, routing the new issue onto the deliverable-evidence
  // lane. `code` (the default) leaves the body unmarked.
  if (typeof args.kind === 'string') {
    let kind;
    try {
      kind = normalizeKind(args.kind);
    } catch (err) {
      die(err.message);
    }
    finalBody = setIssueKindMarker(finalBody, kind);
  }
  process.stdout.write(finalBody);
  // #298 AC3 — emit `aitm-fields` trailer block from seed values forwarded
  // by create-issue.mjs. Goes BEFORE `aitm-body-version` so the body-shape
  // matches the canonical trailer order seen on healed issues.
  const fieldsTrailer = buildFieldsTrailer(args);
  if (fieldsTrailer) process.stdout.write(fieldsTrailer);
  // Epic #288: stamp the optimistic-concurrency marker on every newly-rendered
  // body. `pushIssueBody` bumps subsequent writes; this seeds version 1.
  // #376: emit the new `version="..."` property grammar.
  process.stdout.write(`${serializeMarker('body-version', { version: '1' })}\n`);
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
  const fullAutoApproved = hasFullAutoApproved(String(body));
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
  if (wantsHelp(process.argv.slice(2))) {
    emitSelfDoc('preflight-issue');
    process.exit(0);
  }
  const args = parseArgs(process.argv.slice(2));
  if (typeof args['check-integrity'] === 'string') {
    await checkIntegrity(args['check-integrity']);
    return;
  }
  const root = repoRoot();
  const pickupPath = existingRuntimePath(root, RUNTIME_REL.pickupDirective);
  const dodPath = existingRuntimePath(root, RUNTIME_REL.dod);

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
  // #376: emit the new `version="..."` property grammar.
  process.stdout.write(`${serializeMarker('body-version', { version: '1' })}\n`);
}

main().catch((err) => {
  process.stderr.write(`preflight-issue: ${err.message || err}\n`);
  process.exit(2);
});
