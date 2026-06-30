// `plan-estimate` verb — surface the `### Planned Estimate` appendix writer.
//
// CLI: /task plan-estimate [#N] --planned-size <S> --planned-estimate <H>
//        [--current-size <S>] [--current-estimate <H>] [--rationale "<text>"]
//
// The plan→develop gate (`planPlannedEstimateGate`, refusal
// `planned-estimate-appendix-missing`) hard-blocks unless the
// `### 🛠 Refine estimate` comment carries a non-empty `### Planned Estimate`
// appendix. The only writer of that appendix was the internal
// `appendPlannedEstimate` library function, referenced by NO verb — so a freshly
// planned issue could not reach Develop through first-party verbs (#663). This
// thin verb wraps `appendPlannedEstimate` (and `repopulateEmptyPlannedAppendix`
// for the pre-#171 empty-table heal path).
//
// When `--current-*` is omitted, the "Refine" column is sourced from the live
// board Size/Estimate (mirroring `inflate-estimate`), falling back to mirroring
// the planned column when the board read is empty so `appendPlannedEstimate`'s
// "at least one field" contract always holds. Comment-only: touches no board
// field and no Status. Pure core: `runPlanEstimate({...})`; all I/O injectable.

import {
  appendPlannedEstimate,
  repopulateEmptyPlannedAppendix,
} from '../lib/refine-estimate-comment.mjs';
import { projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { loadState } from '../state.mjs';

// Resolve the target issue: explicit positional `#N` / `N` wins, else the bound
// active issue. Returns a positive integer or null.
export function resolveTargetIssue({ rest, activeIssue }) {
  for (const tok of rest) {
    const m = String(tok).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  if (activeIssue) {
    const m = String(activeIssue).match(/^#?(\d+)$/);
    if (m) return Number(m[1]);
  }
  return null;
}

// Strip a trailing `h`/`H` and coerce to a finite number, else null.
function parseEstimate(v) {
  if (v === undefined || v === null) return null;
  const n = parseFloat(String(v).replace(/h$/i, ''));
  return Number.isFinite(n) ? n : null;
}

// Parse `rest` into { target, planned, current, rationale }. Flags:
// --planned-size, --planned-estimate, --current-size, --current-estimate,
// --rationale. `planned`/`current` only carry keys that were supplied.
export function parseArgs(rest, activeIssue) {
  const planned = {};
  const current = {};
  let rationale = null;
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    switch (tok) {
      case '--planned-size':
        planned.size = rest[++i] ?? '';
        break;
      case '--planned-estimate':
        planned.estimate = parseEstimate(rest[++i]);
        break;
      case '--current-size':
        current.size = rest[++i] ?? '';
        break;
      case '--current-estimate':
        current.estimate = parseEstimate(rest[++i]);
        break;
      case '--rationale':
        rationale = rest[++i] ?? '';
        break;
      default:
        positional.push(tok);
    }
  }
  const target = resolveTargetIssue({ rest: positional, activeIssue });
  return { target, planned, current, rationale };
}

// Read the live board Size/Estimate for the "Refine" column. Best-effort:
// returns {} on any failure or when no project is configured.
async function readBoardCurrent({ cfg, issueNumber, deps }) {
  if (!cfg.projectId) return {};
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  try {
    const fieldDefs = fieldDefsLoader();
    const vals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
    const out = {};
    if (vals && vals.size) out.size = vals.size;
    if (vals && typeof vals.estimate === 'number') out.estimate = vals.estimate;
    return out;
  } catch {
    return {};
  }
}

/**
 * Core runner. Bootstraps (or heals) the `### Planned Estimate` appendix on the
 * refine-estimate comment.
 *
 * @returns {Promise<{status:string, commentId?:number, target:number}>}
 */
export async function runPlanEstimate({
  target,
  planned,
  current,
  rationale,
  cfg,
  deps = {},
} = {}) {
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error('plan-estimate: no target issue (bind via /task #N or pass a positional)');
  }
  if (!cfg || !cfg.repo) {
    throw new Error('plan-estimate: cfg.repo is required');
  }
  const hasPlanned = planned && (planned.size !== undefined || planned.estimate !== undefined);
  if (!hasPlanned) {
    throw new Error(
      'plan-estimate: at least one of --planned-size / --planned-estimate is required'
    );
  }
  const append = deps.appendPlannedEstimate || appendPlannedEstimate;
  const repopulate = deps.repopulateEmptyPlannedAppendix || repopulateEmptyPlannedAppendix;

  // Source the "current" (Refine) column: explicit flags win; else read the
  // board; else mirror the planned column so the "at least one field" contract
  // always holds.
  let effectiveCurrent = current;
  if (!current || (current.size === undefined && current.estimate === undefined)) {
    const board = await readBoardCurrent({ cfg, issueNumber: target, deps });
    effectiveCurrent =
      board.size !== undefined || board.estimate !== undefined ? board : { ...planned };
  }

  const res = await append({
    cfg,
    issueNumber: target,
    planned,
    current: effectiveCurrent,
    rationale,
  });

  // An EMPTY (pre-#171 all-em-dash) appendix returns `duplicate` from append;
  // heal it in place rather than leaving the gate blocked.
  if (res?.status === 'duplicate') {
    const healed = await repopulate({
      cfg,
      issueNumber: target,
      planned,
      current: effectiveCurrent,
      rationale,
    });
    return { ...healed, target };
  }
  return { ...res, target };
}

export async function verbPlanEstimate(ctx) {
  const { cfg, statePath, rest } = ctx;
  const s = loadState(statePath);
  const active = s.active || null;
  const { target, planned, current, rationale } = parseArgs(rest, active);
  if (!target) {
    console.error(
      'Usage: /task plan-estimate [#N] --planned-size <S> --planned-estimate <H> ' +
        '[--current-size <S>] [--current-estimate <H>] [--rationale "<text>"]'
    );
    process.exit(2);
  }
  if (planned.size === undefined && planned.estimate === undefined) {
    console.error('plan-estimate: at least one of --planned-size / --planned-estimate is required');
    process.exit(2);
  }
  try {
    const res = await runPlanEstimate({ target, planned, current, rationale, cfg });
    switch (res.status) {
      case 'appended':
        console.log(`[task-tracker] ✓ #${target} Planned Estimate appendix written`);
        break;
      case 'repopulated':
        console.log(`[task-tracker] ✓ #${target} empty Planned Estimate appendix repopulated`);
        break;
      case 'duplicate':
        console.log(
          `[task-tracker] ✓ #${target} Planned Estimate appendix already present — no change`
        );
        break;
      case 'no-refine-comment':
        console.error(
          `plan-estimate: no \`### 🛠 Refine estimate\` comment on #${target} — refine the issue first`
        );
        process.exit(1);
        break;
      default:
        console.error(`plan-estimate: unexpected status '${res.status}' for #${target}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
