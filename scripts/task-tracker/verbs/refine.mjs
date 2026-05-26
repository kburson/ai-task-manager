// `refine` verb — atomic Backlog → Refine prep + promote.
//
// Sets Priority + Size + Estimate on the GitHub project board (via
// tetherIssueToProject), prepends a `<!-- aitm-refinement-rationale: {...} -->`
// marker to the issue body, and delegates to verbPromote to execute the
// Backlog → Refine state transition.
//
// CLI:
//   /task refine <issue#> --size <XS|S|M|L|XL> --estimate <hours>
//                         --priority <p0|p1|p2> --reason <text>
//
// Pure core: `runRefine({ args, cfg, deps })`. All I/O is injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { tetherIssueToProject } from '../../gh/lib/project-tether.mjs';
import { fieldOptionMap } from '../../gh/lib/github-projects.mjs';
import { verbPromote } from './promote.mjs';
import { parseRationaleMarker, RATIONALE_MARKER_RE } from '../lib/apply-refinement-estimate.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexec = promisify(execFile);

const SIZE_ENUM = ['XS', 'S', 'M', 'L', 'XL'];
const PRIORITY_ENUM = ['p0', 'p1', 'p2'];

export function parseArgs(argv = []) {
  const args = argv.slice();
  const issueRaw = args.shift();
  const issueMatch = String(issueRaw || '').match(/^#?(\d+)$/);
  const issueNumber = issueMatch ? Number(issueMatch[1]) : NaN;

  const parsed = {
    issueNumber,
    size: null,
    estimate: null,
    priority: null,
    reason: null,
    sequence: null,
    labels: null,
  };

  let i = 0;
  while (i < args.length) {
    const flag = args[i];
    const val = args[i + 1];
    switch (flag) {
      case '--size':
        parsed.size = val;
        i += 2;
        break;
      case '--estimate':
        parsed.estimate = val;
        i += 2;
        break;
      case '--priority':
        parsed.priority = val;
        i += 2;
        break;
      case '--reason':
        parsed.reason = val;
        i += 2;
        break;
      case '--sequence':
        parsed.sequence = val;
        i += 2;
        break;
      case '--labels':
        parsed.labels = val;
        i += 2;
        break;
      default:
        throw new Error(`refine: unknown argument: ${flag}`);
    }
  }
  return parsed;
}

export function parseLabelsArg(raw) {
  if (raw == null) return null;
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts;
}

export function validateArgs({ issueNumber, size, estimate, priority, reason, sequence, labels }) {
  const errs = [];
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    errs.push('issue# must be a positive integer');
  }
  if (!size) errs.push('--size is required');
  else if (!SIZE_ENUM.includes(size)) errs.push(`--size must be one of: ${SIZE_ENUM.join(', ')}`);
  if (estimate == null || estimate === '') errs.push('--estimate is required');
  else {
    const n = parseFloat(String(estimate).replace(/h$/i, ''));
    if (!Number.isFinite(n) || n <= 0)
      errs.push('--estimate must be a positive number (e.g. 4 or 4h)');
  }
  if (!priority) errs.push('--priority is required');
  else if (!PRIORITY_ENUM.includes(String(priority).toLowerCase())) {
    errs.push(`--priority must be one of: ${PRIORITY_ENUM.join(', ')}`);
  }
  if (!reason || !String(reason).trim()) errs.push('--reason is required (non-empty)');
  if (sequence != null && sequence !== '') {
    const sn = Number(sequence);
    if (!Number.isFinite(sn)) errs.push('--sequence must be a number');
  }
  if (labels != null) {
    const parts = parseLabelsArg(labels);
    if (!parts || parts.length === 0)
      errs.push('--labels must be a non-empty comma-separated list');
  }
  if (errs.length) throw new Error(`refine: ${errs.join('; ')}`);
}

// #220: emit the canonical four-key shape — bucket tokens stay in their slots,
// the reason text lives in its own `rationale` key. `sequence` is included as a
// number when supplied (omitted otherwise so round-trip equality doesn't carry
// a stray null).
export function buildRationaleMarker({ size, estimate, priority, sequence, reason } = {}) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('buildRationaleMarker: reason is required');
  }
  const payload = {
    size: String(size),
    estimate: String(estimate),
    priority: String(priority),
    rationale: reason,
  };
  if (sequence != null && sequence !== '') {
    const seqNum = Number(sequence);
    if (Number.isFinite(seqNum)) payload.sequence = seqNum;
  }
  return `<!-- aitm-refinement-rationale: ${JSON.stringify(payload)} -->`;
}

export function applyRationaleMarker(body, marker) {
  const stripped = String(body || '')
    .replace(RATIONALE_MARKER_RE, '')
    .replace(/^\n+/, '');
  return `${marker}\n\n${stripped}`;
}

// ---------------------------------------------------------------------------
// Default I/O
// ---------------------------------------------------------------------------

async function defaultFetchBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

async function defaultWriteBody({ issueNumber, repo, body }) {
  const tmp = path.join(os.tmpdir(), `aitm-refine-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

async function defaultAddLabels({ issueNumber, repo, labels }) {
  if (!labels || labels.length === 0) return;
  const args = ['issue', 'edit', String(issueNumber), '-R', repo];
  for (const l of labels) {
    args.push('--add-label', l);
  }
  await pexec('gh', args, { timeout: GH_API_TIMEOUT_MS });
}

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

export async function runRefine({ args, cfg, deps = {} } = {}) {
  if (!cfg) throw new Error('refine: cfg is required');
  validateArgs(args);

  const { issueNumber, size, estimate, priority, reason, sequence, labels } = args;
  const estimateNum = parseFloat(String(estimate).replace(/h$/i, ''));
  const priorityNorm = String(priority).toLowerCase();
  const sequenceNum = sequence == null || sequence === '' ? null : Number(sequence);
  const labelList = parseLabelsArg(labels) || [];

  const tether = deps.tetherIssueToProject || tetherIssueToProject;
  const loadFieldOptionMap = deps.fieldOptionMap || fieldOptionMap;
  const fetchBody = deps.fetchBody || defaultFetchBody;
  const writeBody = deps.writeBody || defaultWriteBody;
  const addLabels = deps.addLabels || defaultAddLabels;
  const promote = deps.verbPromote || verbPromote;

  // 1. Pre-load size option IDs from the project so tetherIssueToProject can
  //    resolve `size: 'S'` → option ID without requiring the config file to
  //    carry sizeOptions (which most installs don't).
  let cfgForTether = cfg;
  if (cfg.sizeFieldId && !cfg.sizeOptions && !cfg.sizeOptionMap) {
    const optMap = await loadFieldOptionMap(cfg.projectId);
    cfgForTether = { ...cfg, sizeOptionMap: optMap };
  }

  // 2. Set Priority + Size + Estimate (+ Sequence when supplied) atomically on
  //    the project board.
  const tetherArgs = {
    cfg: cfgForTether,
    issueNumber,
    priority: priorityNorm,
    size,
    estimate: estimateNum,
  };
  if (sequenceNum != null && Number.isFinite(sequenceNum)) {
    tetherArgs.sequence = sequenceNum;
  }
  await tether(tetherArgs);

  // 2b. Add issue labels (separate from project fields).
  if (labelList.length > 0) {
    await addLabels({ issueNumber, repo: cfg.repo, labels: labelList });
  }

  // 2. Write the rationale marker (replace any existing one — last write wins).
  const body = await fetchBody({ issueNumber, repo: cfg.repo });
  const marker = buildRationaleMarker({
    size,
    estimate: estimateNum,
    priority: priorityNorm,
    sequence: sequenceNum,
    reason,
  });
  const newBody = applyRationaleMarker(body, marker);
  await writeBody({ issueNumber, repo: cfg.repo, body: newBody });

  // 3. Round-trip validate.
  const parsed = parseRationaleMarker(newBody);
  if (!parsed.ok) {
    throw new Error(`refine: wrote rationale marker but parse failed: ${parsed.reason}`);
  }

  // 4. Delegate to promote for the Backlog → Refine transition.
  await promote([String(issueNumber)], cfg);

  return {
    status: 'refined',
    issueNumber,
    size,
    estimate: estimateNum,
    priority: priorityNorm.toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------

export async function verbRefine(rest, cfg) {
  let args;
  try {
    args = parseArgs(rest);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.stderr.write(
      'Usage: /task refine <issue#> --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2> --reason <text>\n'
    );
    process.exit(2);
  }

  try {
    const result = await runRefine({ args, cfg });
    process.stdout.write(
      `✓ #${result.issueNumber} refined: size=${result.size}, estimate=${result.estimate}h, priority=${result.priority}; moved Backlog → Refine\n`
    );
  } catch (err) {
    process.stderr.write(`refine: ${err.message}\n`);
    process.exit(1);
  }
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  const { loadConfig } = await import('../config.mjs');
  const cfg = loadConfig();
  await verbRefine(process.argv.slice(2), cfg);
}
