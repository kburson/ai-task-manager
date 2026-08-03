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
//        --scope-file <p> --ac-file <p> --story-origin-file <p> \
//        [--plan-metadata-file <p>] \
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
import { renderVcSection, spliceVcSection, nextVcId } from './lib/vc-emit.mjs';
import { normalizePlanMetadataValue } from './lib/plan-metadata.mjs';
import {
  hasStoryOriginFields,
  normalizeStoryOriginValue,
  upsertStoryOriginField,
} from './lib/story-origin.mjs';
import { formatIssueFieldDb } from './issue-field-db.mjs';
import { serializeMarker } from './lib/marker-grammar.mjs';
import { setIssueKindMarker, normalizeKind, DEFAULT_KIND } from './lib/issue-kind.mjs';
import { filterDodForKindAndDiff } from './lib/dod-kind-filter.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { verifyIssueBody } from '../gh/lib/issue-body-verifier.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_TEMPLATES_DIR = path.resolve(SCRIPT_DIR, '..', '..', 'templates');
const VALID_SHAPES = ['epic', 'sub-issue', 'solo', 'stub'];

// #426/#892 — placeholder fills for the lightweight `stub` shape. Scope and AC
// deliberately fail Refine gates until expanded. Story Origin is real
// create-time data; Plan Metadata is intentionally empty until planning.
const STUB_SCOPE_PLACEHOLDER = '_Stub — describe the work at Refine._';
const STUB_AC_PLACEHOLDER = '- [ ] _TBD — define acceptance criteria at Refine._';

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
  story_origin: '## Story Origin',
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

export function normalizeStoryOrigin(value) {
  return normalizeStoryOriginValue(value);
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
  if (typeof out.story_origin === 'string') {
    out.story_origin = normalizeStoryOrigin(out.story_origin);
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

// #681 — Resolve the render kind for DoD filtering. `--kind` is validated via
// normalizeKind (dies on an unknown kind, matching the marker-stamp path);
// absence means the `code` default, for which the DoD filter is a no-op.
function resolveRenderKind(args) {
  if (typeof args.kind !== 'string') return DEFAULT_KIND;
  try {
    return normalizeKind(args.kind);
  } catch (err) {
    die(err.message);
    return DEFAULT_KIND;
  }
}

// #681 — `kind` scopes which DoD items render. For `code` (and any kind no
// annotation names) `filterDodForKind` returns the file verbatim, so the tail
// block is byte-identical to pre-change output; a no-code kind (spike/research)
// drops the annotated `tests` item, and because `## Verification Commands` is
// derived from the assembled body downstream, its `npm run test:all` seed drops
// with it automatically.
//
// #700 — the Pickup Directive moved out of this tail and into the shape
// templates directly (right after `## Plan Metadata`), so the issue body reads
// linearly: directive first, then AC/VC/DoD. This tail now emits DoD only.
// #480 — `## Definition of Done` (2-hash) is a top-level sibling of
// `## Acceptance Criteria` / `## Verification Commands`, so the CODE_COMPLETE
// AC slice (`NEXT_HEADING_RE = /^##\s+/`) terminates at it and stops slurping
// the DoD Functional/Lifecycle items.
// #865 — `changedPaths` (null unless a `docs-only` render supplies
// `--changed-paths-file`) drives the diff-conditional drop of the functional
// `tests` item. `filterDodForKindAndDiff` is byte-identical to the #681
// `filterDodForKind` for every non-`docs-only` kind and for any `docs-only` diff
// that is not provably documentation-only (null/empty/mixed), so the code-kind
// back-compat guarantee holds.
function dodBlock(dodPath, kind = DEFAULT_KIND, changedPaths = null) {
  const dod = filterDodForKindAndDiff(
    readFileSync(dodPath, 'utf8').replace(/\s+$/, ''),
    kind,
    changedPaths
  );
  return ['## Definition of Done', dod, ''].join('\n');
}

// #865 — Read the diff's changed-path list for the `docs-only` diff-decides rule.
// Returns null (→ no conditional drop; keep the suite) UNLESS the render is
// `--kind docs-only` AND `--changed-paths-file <p>` is supplied. The file is a
// plain newline-delimited list of repo-relative paths (e.g. `git diff
// --name-only trunk...HEAD`); blank lines are ignored. Absent the flag, the safe
// default is to keep the functional-test item — mislabelling alone can never
// skip the suite.
function readChangedPaths(args, kind) {
  if (kind !== 'docs-only' || typeof args['changed-paths-file'] !== 'string') return null;
  const raw = readFileOrDie(args['changed-paths-file'], '--changed-paths-file');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// Legacy tail-only mode (no `--shape`): pre-#700 callers spliced DoD + Pickup
// Directive together at the bottom of a hand-assembled body. No current caller
// invokes this path (grepped repo-wide); kept byte-identical for compatibility.
function tailBlock(dodPath, kind = DEFAULT_KIND) {
  return [
    dodBlock(dodPath, kind).replace(/\n$/, ''),
    '',
    '---',
    '',
    '## Pickup Directive — MANDATORY, DO NOT SKIP',
    '> Follow: `.ai-task-manager/templates/pickup-directive.md`',
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

  const kind = resolveRenderKind(args);
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
      story_origin: `- kind: ${kind}`,
      acceptance_criteria: STUB_AC_PLACEHOLDER,
      plan_metadata: '',
    };
  } else {
    const required = ['scope-file', 'ac-file', 'story-origin-file'];
    for (const flag of required) {
      if (typeof args[flag] !== 'string') die(`--${flag} required with --shape`);
    }
    rawFills = {
      scope: readFileOrDie(args['scope-file'], '--scope-file').trim(),
      story_origin: readFileOrDie(args['story-origin-file'], '--story-origin-file').trim(),
      acceptance_criteria: readFileOrDie(args['ac-file'], '--ac-file').trim(),
      plan_metadata:
        typeof args['plan-metadata-file'] === 'string'
          ? readFileOrDie(args['plan-metadata-file'], '--plan-metadata-file').trim()
          : '',
    };
    const originFragment = stripLeadingHeading(
      rawFills.story_origin,
      SECTION_HEADINGS.story_origin
    );
    if (/^#{1,6}\s+/m.test(originFragment)) {
      die('--story-origin-file must be a flat metadata fragment without headings');
    }
    const normalizedOrigin = normalizeStoryOriginValue(originFragment);
    if (!hasStoryOriginFields(`## Story Origin\n\n${normalizedOrigin}\n`)) {
      die(
        '--story-origin-file must contain at least one non-empty flat Story Origin metadata field'
      );
    }
  }
  let fills = normalizeFills(rawFills);
  if (shape === 'sub-issue') {
    const wrapped = `## Story Origin\n\n${fills.story_origin}\n`;
    const withParent = upsertStoryOriginField(wrapped, 'parent', `#${args.parent}`);
    fills = {
      ...fills,
      story_origin: withParent.replace(/^## Story Origin\s*\n+/, '').trim(),
    };
  }
  if (shape === 'epic') {
    fills.sub_issue_list =
      typeof args['sub-issue-list-file'] === 'string'
        ? readFileOrDie(args['sub-issue-list-file'], '--sub-issue-list-file').trim()
        : '';
  }

  // #681 — resolve kind BEFORE the DoD tail is injected so the Functional items
  // are filtered for the issue's kind and the derived Verification Commands seed
  // is computed over the surviving items.
  // #865 — for a `docs-only` render, a supplied `--changed-paths-file` decides
  // whether the functional `tests` item (and its derived `test:all` VC seed) is
  // dropped: only a provably documentation-only diff drops it (default-deny).
  // null for every other kind and for a `docs-only` render with no diff file.
  const changedPaths = readChangedPaths(args, kind);

  const template = loadTemplate(root, shape);
  const skeleton = stripHeaderComment(template);
  const body = fillTemplate(skeleton, fills).replace(/\s+$/, '') + '\n\n';
  const assembled = body + dodBlock(dodPath, kind, changedPaths);
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
    // #772 — stamp stable ids (from 1 on a fresh body) and splice with one
    // blank line above AND below the `## Verification Commands` header.
    const vcSection = renderVcSection(seedCmds, nextVcId(finalBody));
    // #480 — VC sits BETWEEN `## Acceptance Criteria` and `## Definition of Done`
    // (canonical order), so anchor on the DoD heading rather than Pickup.
    const anchor = '## Definition of Done';
    const idx = finalBody.indexOf(anchor);
    finalBody =
      idx === -1
        ? spliceVcSection(finalBody, vcSection, '')
        : spliceVcSection(finalBody.slice(0, idx), vcSection, finalBody.slice(idx));
  }
  // #494, #500, #923, #865 — `--kind <audit|research|spike|epic|docs-only>`
  // stamps the issue-kind marker at creation. The no-commit kinds route onto the
  // deliverable-evidence lane; commit-bearing `docs-only` keeps the commit trail
  // and drops the `tests` DoD item + derived `test:all` VC ONLY when a supplied
  // `--changed-paths-file` proves the diff is documentation-only (#865
  // diff-decides; default-deny keeps the suite otherwise). `code` (the default)
  // leaves the body unmarked. The kind was already resolved above (#681) for DoD
  // filtering; reuse it.
  if (typeof args.kind === 'string') {
    finalBody = setIssueKindMarker(finalBody, kind);
  }
  const bodyVerification = verifyIssueBody(finalBody);
  if (!bodyVerification.ok) {
    die(
      `rendered ${shape} body failed canonical verification: ${bodyVerification.missing.join('; ')}`
    );
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
  if (!existsSync(pickupPath)) missing.push('.ai-task-manager/templates/pickup-directive.md');
  if (!existsSync(dodPath)) missing.push('.ai-task-manager/templates/definition-of-done.md');

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

  // Legacy tail-only mode. Honors `--kind` for DoD filtering too (#681).
  process.stdout.write(tailBlock(dodPath, resolveRenderKind(args)));
  // #376: emit the new `version="..."` property grammar.
  process.stdout.write(`${serializeMarker('body-version', { version: '1' })}\n`);
}

main().catch((err) => {
  process.stderr.write(`preflight-issue: ${err.message || err}\n`);
  process.exit(2);
});
