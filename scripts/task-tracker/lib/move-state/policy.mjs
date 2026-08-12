// INTERNAL — library module for the state-movement boundary (#559).
//
// Input/policy concern extracted from `scripts/gh/move-state.mjs`: argv
// parsing, the state→config-key map, the refusal verb hint, and the
// verb-pipeline gate decision. Every export here is PURE — no I/O, no
// process.exit, no env reads — so the policy surface is unit-testable in
// isolation. The host script keeps ownership of process.exit / stderr; it
// asks these helpers WHAT to do and performs the side effect itself.

import { stateIds, stateConfigKey, forwardTarget } from '../lifecycle-policy/index.mjs';

const LEGACY_READY_FOR_PLAN_STATES = new Set(['assigned', 'on-deck']);
const CANONICAL_READY_FOR_PLAN_STATE = 'ready-for-plan';

function canonicalizeStateToken(token) {
  if (LEGACY_READY_FOR_PLAN_STATES.has(token)) {
    return { value: CANONICAL_READY_FOR_PLAN_STATE, legacy: true };
  }
  return { value: token, legacy: false };
}

export function legacyStateAliasWarning(location = 'state') {
  return `[aitm] deprecated ${location} alias; use "ready-for-plan".`;
}

// Canonical board-state → config option-id key map. The host reads
// `cfg[STATE_TO_CONFIG_KEY[state]]` to find the single-select option id.
export const STATE_TO_CONFIG_KEY = Object.freeze(
  Object.fromEntries(stateIds().map((state) => [state, stateConfigKey(state)]))
);

// Which `/task` verb a human should reach for instead of invoking move-state
// directly, keyed on the move's target state. Forward moves → promote,
// backlog (the only matrix-legal backward target) → park (#848 — `demote` is
// hardcoded to `develop` and can never reach `backlog`; `park` is the
// dedicated Refine|Plan → Backlog verb), everything else → reconcile.
const FORWARD_TARGETS = new Set(stateIds().map(forwardTarget).filter(Boolean));
// Exported (not just local) so `move-state-policy.test.mjs` (#848 AC7) can
// enumerate every backward target `refusalVerbHint` names a verb for, and
// assert that verb actually declares the target legal — without shelling out.
export const BACKWARD_TARGETS = new Set(['backlog']);

export function refusalVerbHint(targetState) {
  if (FORWARD_TARGETS.has(targetState)) return '/task promote';
  if (BACKWARD_TARGETS.has(targetState)) return '/task park';
  return '/task reconcile';
}

// Parse the move-state argv tail (everything after `node move-state.mjs`).
// Returns a structured descriptor; never throws and never exits. The host
// maps `error` / `unknownState` onto its usage() / unknown-state exits so the
// exact exit codes + stderr bytes stay in the script.
//
// `argv` is the full process.argv (the function slices from index 2), matching
// the script's own `process.argv.slice(2)` convention.
export function parseMoveStateArgs(argv) {
  const cliArgs = argv.slice(2);
  const issueArg = cliArgs[0];
  const rawStateArg = cliArgs[1];
  const canonicalState = canonicalizeStateToken(rawStateArg);
  const stateArg = canonicalState.value;

  const result = {
    issueArg,
    stateArg,
    itemIdOverride: '',
    fromOverride: '',
    demoteFlag: false,
    demoteReason: '',
    supersedeFlag: false,
    forceFlag: false,
    outOfBandReason: '',
    legacyStateAliases: canonicalState.legacy ? ['state'] : [],
    // error kinds the host turns into an exit:
    //   'usage'          → usage() / exit 1
    //   'unknown-state'  → unknown-state message / exit 1
    //   'out-of-band'    → --out-of-band requires a reason / exit 2
    error: null,
  };

  // --out-of-band <reason> (parsed against the full argv so a human invoking
  // the raw script gets the same handling as the host did inline).
  const oobIdx = argv.indexOf('--out-of-band');
  if (oobIdx !== -1) {
    const raw = argv[oobIdx + 1];
    if (raw === undefined || String(raw).trim() === '') {
      result.error = 'out-of-band';
      return result;
    }
    result.outOfBandReason = String(raw).trim();
  }

  for (let i = 2; i < cliArgs.length; i++) {
    if (cliArgs[i] === '--item-id' && cliArgs[i + 1]) {
      result.itemIdOverride = cliArgs[i + 1];
      i++;
    } else if (cliArgs[i] === '--from' && cliArgs[i + 1]) {
      const fromState = canonicalizeStateToken(cliArgs[i + 1]);
      result.fromOverride = fromState.value;
      if (fromState.legacy) result.legacyStateAliases.push('--from');
      i++;
    } else if (cliArgs[i] === '--demote') {
      result.demoteFlag = true;
    } else if (cliArgs[i] === '--demote-reason' && cliArgs[i + 1] !== undefined) {
      // #831 (EPIC #823 D3) — the demote's audit row carries this reason (e.g. the
      // review-gate objection summary). Parsed here so both the verb path (via
      // extraArgs) and a raw script invocation reach `emitPhasePairRows` with it.
      result.demoteReason = String(cliArgs[i + 1]).trim();
      i++;
    } else if (cliArgs[i] === '--supersede') {
      result.supersedeFlag = true;
    } else if (cliArgs[i] === '--force') {
      result.forceFlag = true;
    }
  }

  if (!issueArg || !stateArg) {
    result.error = 'usage';
    return result;
  }
  if (!/^\d+$/.test(issueArg)) {
    result.error = 'usage';
    return result;
  }
  if (!Object.prototype.hasOwnProperty.call(STATE_TO_CONFIG_KEY, stateArg)) {
    result.stateArg = rawStateArg;
    result.error = 'unknown-state';
    return result;
  }

  return result;
}

// Verb-pipeline gate decision. Precedence (matching the host's inline order):
// env (verb context) → --out-of-band → cfg.directMoveStateAllowed → TTY →
// refuse. Returns one of:
//   { decision: 'allow' }                      — env / out-of-band / TTY path
//   { decision: 'allow-with-warning' }         — directAllowed non-TTY path
//   { decision: 'refuse' }                     — agent context, no escape hatch
// The host owns the stderr text + exit 3 for the refuse case and the warning
// banner for allow-with-warning.
export function decideVerbGate({ hasVerbEnv, outOfBandReason, directAllowed, isTty }) {
  if (hasVerbEnv || outOfBandReason) return { decision: 'allow' };
  if (isTty) return { decision: 'allow' };
  if (directAllowed) return { decision: 'allow-with-warning' };
  return { decision: 'refuse' };
}
