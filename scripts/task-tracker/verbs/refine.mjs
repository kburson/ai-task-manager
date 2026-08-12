// `refine` verb — Refine-stage field prep + stage-completion marker (#282).
//
// Sets Priority + Size + Estimate on the GitHub project board (via
// tetherIssueToProject), prepends a `<!-- aitm-refinement-rationale: {...} -->`
// marker AND stamps a `<!-- aitm-refine-complete: <ts> -->` stage-completion
// marker to the issue body. Backlog entry starts active Refine WIP without a
// completion marker. Re-running the verb from Refine records the completed
// snapshot and advances exactly one edge to durable Ready for Planning.
//
// CLI:
//   /task refine <issue#> --size <XS|S|M|L|XL> --estimate <hours>
//                         --priority <p0|p1|p2> --reason <text>
//
// Pure core: `runRefine({ args, cfg, deps })`. All I/O is injectable for tests.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tetherIssueToProject } from '../../gh/lib/project-tether.mjs';
import { fieldOptionMap } from '../../gh/lib/github-projects.mjs';
import { verbPromote } from './promote.mjs';
import { parseRationaleMarker, RATIONALE_MARKER_RE } from '../lib/apply-refinement-estimate.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { ensureIssueFieldDb } from '../issue-field-db.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { serializeMarker } from '../lib/marker-grammar.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { assertBoundToIssue } from '../lib/bind-context.mjs';
import { STUB_AC_PLACEHOLDER } from '../lib/refine-exit-stub-placeholder-guard.mjs';
import { actionPolicyFor } from '../lib/lifecycle-policy/index.mjs';
import { ceilEstimateHours } from '../lib/estimation/estimate-granularity.mjs';
import {
  REFINEMENT_SNAPSHOT_MARKER_RE,
  stampRefinementSnapshot,
} from '../lib/refinement-snapshot.mjs';

const pexec = promisify(execFile);

const SIZE_ENUM = ['XS', 'S', 'M', 'L', 'XL'];
const PRIORITY_ENUM = ['p0', 'p1', 'p2'];
const PRE_REFINE_STATES = new Set(actionPolicyFor('refine').entryStates);

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
    rank: null,
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
      case '--rank':
        parsed.rank = val;
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

export function validateArgs({ issueNumber, size, estimate, priority, reason, rank, labels }) {
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
  if (rank != null && rank !== '') {
    const sn = Number(rank);
    if (!Number.isFinite(sn)) errs.push('--rank must be a number');
  }
  if (labels != null) {
    const parts = parseLabelsArg(labels);
    if (!parts || parts.length === 0)
      errs.push('--labels must be a non-empty comma-separated list');
  }
  if (errs.length) throw new Error(`refine: ${errs.join('; ')}`);
}

// #220: emit the canonical four-key shape — bucket tokens stay in their slots,
// the reason text lives in its own `rationale` key. `rank` is included as a
// number when supplied (omitted otherwise so round-trip equality doesn't carry
// a stray null).
export function buildRationaleMarker({ size, estimate, priority, rank, reason } = {}) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('buildRationaleMarker: reason is required');
  }
  const payload = {
    size: String(size),
    estimate: String(estimate),
    priority: String(priority),
    rationale: reason,
  };
  if (rank != null && rank !== '') {
    const rankNum = Number(rank);
    if (Number.isFinite(rankNum)) payload.rank = rankNum;
  }
  return `<!-- aitm-refinement-rationale: ${JSON.stringify(payload)} -->`;
}

export function applyRationaleMarker(body, marker) {
  const stripped = String(body || '')
    .replace(RATIONALE_MARKER_RE, '')
    .replace(/^\n+/, '');
  return `${marker}\n\n${stripped}`;
}

// #282 — stage-completion marker for the Refine stage. Promote reads this
// on the refine→plan transition; absent marker = refuse-with-message.
// Re-runs of `/task refine` re-stamp with the latest timestamp (idempotent).
// Strip-pattern widened (#375) to match BOTH the legacy colon grammar
// (`aitm-refine-complete: <iso>`) and the consolidated property grammar
// (`aitm-refine-complete ts="<iso>"`), so a re-stamp on an already-migrated
// body removes the prior marker cleanly. Legacy branch stays until #369.
export const REFINE_COMPLETE_MARKER_RE =
  /<!--\s*aitm-refine-complete(?::[^>]*|\s+ts="[^"]*")\s*-->\s*\n?/gi;

export function stampRefineCompleteMarker(body, ts) {
  const stamp = ts || new Date().toISOString();
  const stripped = String(body || '').replace(REFINE_COMPLETE_MARKER_RE, '');
  return `${serializeMarker('refine-complete', { ts: stamp })}\n${stripped}`;
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

// #295 — body writes go through `mutateIssueBody({ mutate })`.
async function defaultMutateBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
}

async function defaultAddLabels({ issueNumber, repo, labels }) {
  if (!labels || labels.length === 0) return;
  const args = ['issue', 'edit', String(issueNumber), '-R', repo];
  for (const l of labels) {
    args.push('--add-label', l);
  }
  await pexec('gh', args, { timeout: GH_API_TIMEOUT_MS });
}

async function defaultFetchLabels({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      repo,
      '--json',
      'labels',
      '--jq',
      '.labels[].name',
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '')
    .split('\n')
    .map((label) => label.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

export async function runRefine({ args, cfg, deps = {} } = {}) {
  if (!cfg) throw new Error('refine: cfg is required');
  validateArgs(args);
  const assertBound = deps.assertBound ?? assertBoundToIssue;
  assertBound(args?.issueNumber);

  const { issueNumber, size, estimate, priority, reason, rank, labels } = args;
  const estimateNum = ceilEstimateHours(parseFloat(String(estimate).replace(/h$/i, '')));
  const priorityNorm = String(priority).toLowerCase();
  const rankNum = rank == null || rank === '' ? null : Number(rank);
  const labelList = parseLabelsArg(labels) || [];

  const tether = deps.tetherIssueToProject || tetherIssueToProject;
  const loadFieldOptionMap = deps.fieldOptionMap || fieldOptionMap;
  const fetchBody = deps.fetchBody || defaultFetchBody;
  const mutateBody = deps.mutateBody || defaultMutateBody;
  const addLabels = deps.addLabels || defaultAddLabels;
  const fetchLabels = deps.fetchLabels || defaultFetchLabels;
  const promote = deps.verbPromote || verbPromote;
  const ensureFieldDb = deps.ensureIssueFieldDb || ensureIssueFieldDb;
  const loadFieldDefs = deps.loadProjectFieldDefs || loadProjectFieldDefs;

  // 1. Read the issue body up front so we can decide whether this run is a
  //     pre-Refine entry transition (the one legitimate transitive advance for
  //     this verb) or a Refine-state field/rationale refresh. Under the 8-state
  //     model the predecessor of Refine is Backlog, so entry is exactly one hop.
  const body = await fetchBody({ issueNumber, repo: cfg.repo });
  const { state: recordedState } = readLastKnownState(body);
  const isPreRefineEntry = recordedState == null || PRE_REFINE_STATES.has(recordedState);
  const completesRefinement = recordedState === 'refine';
  if (!isPreRefineEntry && !completesRefinement) {
    throw new Error(`refine: current state ${recordedState || 'unknown'} is not Backlog or Refine`);
  }

  // 1b. Pre-load size option IDs from the project so tetherIssueToProject can
  //     resolve `size: 'S'` → option ID without requiring the config file to
  //     carry sizeOptions (which most installs don't).
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
  if (rankNum != null && Number.isFinite(rankNum)) {
    tetherArgs.rank = rankNum;
  }
  await tether(tetherArgs);

  // 2b. Add issue labels (separate from project fields).
  if (labelList.length > 0) {
    await addLabels({ issueNumber, repo: cfg.repo, labels: labelList });
  }
  // Production always reads back the exact live labels. Legacy unit seams that
  // inject body I/O but predate the snapshot contract may omit fetchLabels;
  // they continue to characterize their narrower behavior without networking.
  const snapshotEnabled =
    typeof deps.fetchLabels === 'function' || typeof deps.fetchBody !== 'function';
  const currentLabels = snapshotEnabled ? await fetchLabels({ issueNumber, repo: cfg.repo }) : [];

  // 2c. Write the rationale marker (replace any existing one — last write wins).
  const marker = buildRationaleMarker({
    size,
    estimate: estimateNum,
    priority: priorityNorm,
    rank: rankNum,
    reason,
  });

  // #295 — capture the final body via a closure so refresh applies to the
  // FRESH base on each push attempt. `newBody` is held for the round-trip
  // validation below.
  let newBody = null;
  await mutateBody({
    issueNumber,
    repo: cfg.repo,
    mutate: (base) => {
      let next = applyRationaleMarker(base, marker);
      // #450 — defense-in-depth: refuse to stamp refine-complete if stub
      // placeholders are still present (guard layer also catches this at promote).
      if (next.includes(STUB_AC_PLACEHOLDER)) {
        throw new Error(
          'stub AC placeholder still present — replace the TBD acceptance criteria before running refine'
        );
      }
      // 2d. Backlog entry begins active WIP. Only a run already in Refine
      // declares the work current and stamps completion evidence.
      if (completesRefinement) next = stampRefineCompleteMarker(next);
      // #223 — refresh the aitm-fields body cache.
      try {
        const fieldDefs = loadFieldDefs();
        const refreshed = ensureFieldDb(
          next,
          fieldDefs,
          {
            priority: priorityNorm.toUpperCase(),
            size,
            estimate: estimateNum,
            rank: rankNum,
          },
          { overrideKeys: ['priority', 'size', 'estimate', 'rank'] }
        );
        next = refreshed.body;
      } catch (err) {
        process.stderr.write(`[refine] WARN: aitm-fields cache refresh skipped: ${err.message}\n`);
      }
      if (completesRefinement && snapshotEnabled) {
        next = stampRefinementSnapshot(next, { labels: currentLabels });
      }
      newBody = next;
      return next;
    },
  });

  // 3. Round-trip validate.
  const parsed = parseRationaleMarker(newBody);
  if (!parsed.ok) {
    throw new Error(`refine: wrote rationale marker but parse failed: ${parsed.reason}`);
  }

  // 4. The verb owns one edge per invocation: Backlog -> active Refine, or a
  //    completed Refine -> durable Ready for Planning. Later states do not move.
  let promoted = false;
  if (isPreRefineEntry || completesRefinement) {
    const startState = recordedState == null ? 'backlog' : recordedState;
    const hops = startState === 'backlog' || startState === 'refine' ? 1 : 0;
    try {
      for (let i = 0; i < hops; i += 1) {
        await promote([String(issueNumber)], cfg);
      }
      promoted = true;
    } catch (err) {
      // #675 AC3 — a refused promote must not leave the body stamped
      // refine-complete without the state having actually advanced. Roll back
      // ONLY the stage-completion marker; the rationale marker and the
      // aitm-fields cache refresh from step 2c/2d legitimately belong
      // regardless of promote's outcome (they describe field values already
      // committed to the board in step 2), so they are left untouched.
      await mutateBody({
        issueNumber,
        repo: cfg.repo,
        mutate: (base) =>
          base.replace(REFINE_COMPLETE_MARKER_RE, '').replace(REFINEMENT_SNAPSHOT_MARKER_RE, ''),
      });
      throw err;
    }
  }

  return {
    status: 'refined',
    issueNumber,
    size,
    estimate: estimateNum,
    priority: priorityNorm.toUpperCase(),
    promoted,
    completed: completesRefinement,
    recordedState: recordedState ?? null,
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
    const target = result.completed ? 'Ready for Planning' : 'Refine';
    const tail = result.promoted
      ? `; moved ${result.recordedState ?? 'backlog'} → ${target}`
      : `; stayed at ${result.recordedState ?? 'refine'}`;
    process.stdout.write(
      `✓ #${result.issueNumber} refined: size=${result.size}, estimate=${result.estimate}h, priority=${result.priority}${tail}\n`
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
