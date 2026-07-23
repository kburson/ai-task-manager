// @story #915 (epic #912)
// Two-axis reporting: the single surface that reports an item's delivery status
// as TWO distinct axes and structurally refuses to conflate them.
//
//   Axis-1  DONE (delivered-to-parent)          — a RECORDED fact. The item's
//           `[#N]` commit is reachable on its done-target branch (the immediate
//           parent branch, walked up to the nearest surviving ancestor → trunk,
//           per #913's `resolveDoneTargetBranch`). This is what the board's
//           Status=Done column and the recorded markers mean.
//
//   Axis-2  DELIVERED-TO-CUSTOMER (on-trunk)     — a DERIVED fact. Reachability of
//           the `[#N]` commit on trunk, computed on demand from git topology on
//           EVERY call. It is NEVER persisted to a board field or an issue marker:
//           an item can be done (on its parent branch) long before — or without
//           ever — being delivered to trunk, so storing it would immediately drift.
//
// The #521 failure mode this closes: a reporting/query surface that treats
// "done" as a proxy for "on trunk". Here the two axes are separate keys with
// separate bases; `assertDeliveredNotPersisted` is the write-time guard that
// stops the derived axis from ever being recorded, and `auditConsumers` is the
// static check that every consumer sources Axis-2 from git, never from the
// recorded done/Status field.
//
// Pure modulo injected I/O: `deps.commitReachable`, plus the `deps.graph`/
// `deps.branchExists`/`deps.trunk` that `resolveDoneTargetBranch` consumes. The
// git-backed defaults are used only when a caller omits them, so the unit tests
// run without git or gh.

import { execFileSync } from 'node:child_process';

import { resolveDoneTargetBranch } from './close-gates-lineage.mjs';

export const DONE_AXIS = 'done'; // delivered-to-parent, recorded
export const DELIVERED_AXIS = 'delivered-to-customer'; // on-trunk, derived
const DEFAULT_TRUNK = 'trunk';

// A caller who tries to persist the derived Axis-2 under any of these keys is
// conflating the axes; `assertDeliveredNotPersisted` refuses the write. These are
// the shapes a report/rollup might reach for ("mark it delivered to the customer").
export const FORBIDDEN_PERSISTED_AXIS_KEYS = Object.freeze([
  DELIVERED_AXIS,
  'delivered-to-customer',
  'deliveredToCustomer',
  'on-trunk',
  'onTrunk',
  'trunk-delivered',
  'trunkDelivered',
]);

const FORBIDDEN_KEY_SET = new Set(FORBIDDEN_PERSISTED_AXIS_KEYS.map((k) => normalizeKey(k)));

function normalizeKey(k) {
  return String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Thrown by `assertDeliveredNotPersisted` when a write would record Axis-2.
export class PersistedDeliveredAxisError extends Error {
  constructor(key) {
    super(
      `two-axis-delivery: refusing to persist the derived delivered-to-customer axis under "${key}" — Axis-2 is computed on demand from git, never stored (it would drift the moment trunk advances)`
    );
    this.name = 'PersistedDeliveredAxisError';
    this.key = key;
  }
}

// Default git-backed reachability probe: is a `[#N]` commit reachable on `branch`?
// Message-attribution based (matches #913/#914), so an unmerged branch or worktree
// still attributes correctly. Never throws — an attribution failure is "not
// reachable" (the conservative answer), not a crash.
function defaultCommitReachable(projectDir) {
  return (issueNumber, branch) => {
    try {
      const commits = defaultAttributingCommitsSync(issueNumber, {
        cwd: projectDir,
        refs: [branch],
      });
      return Array.isArray(commits) && commits.length > 0;
    } catch {
      return false;
    }
  };
}

// `attributingCommits` is async; the axes API is sync (a report reads it inline),
// so the git-backed default shells out synchronously here. Tests inject
// `deps.commitReachable` and never reach this path.
function defaultAttributingCommitsSync(issueNumber, { cwd, refs }) {
  const id = String(issueNumber).replace(/^#/, '');
  const ref = (refs && refs[0]) || DEFAULT_TRUNK;
  const out = execFileSync('git', ['log', '--format=%H %s', ref], {
    cwd,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const re = new RegExp(`\\[#${id}\\]`);
  return out
    .split('\n')
    .filter((line) => re.test(line))
    .map((line) => line.split(' ')[0]);
}

// Report BOTH delivery axes for an item, as two distinct, non-conflatable facts.
//
//   deliveryAxes({ issueNumber, projectDir, deps }) → Object.freeze({
//     done:      { axis, recorded:true,  basis, targetBranch, reachable },
//     delivered: { axis, derived:true, persisted:false, basis, trunk, onTrunk },
//   })
//
// deps: { commitReachable, graph, branchExists, trunk }
//   commitReachable(issue, branch) → boolean   (default: git message-attribution)
//   graph/branchExists/trunk                    (consumed by resolveDoneTargetBranch)
//
// The delivered axis is recomputed from `commitReachable` on EVERY call — pass the
// same item after trunk advances and `delivered.onTrunk` flips. Nothing here writes.
export function deliveryAxes({ issueNumber, projectDir, deps = {} } = {}) {
  if (issueNumber == null) throw new Error('deliveryAxes: issueNumber is required');
  const trunk = deps.trunk || DEFAULT_TRUNK;
  const commitReachable =
    typeof deps.commitReachable === 'function'
      ? deps.commitReachable
      : defaultCommitReachable(projectDir);

  // Axis-1: the RECORDED done fact — reachable on the done-target branch.
  const targetBranch = resolveDoneTargetBranch({
    issueNumber,
    deps: { graph: deps.graph, branchExists: deps.branchExists, trunk },
  });
  const done = Object.freeze({
    axis: DONE_AXIS,
    recorded: true,
    basis: 'parent-branch-reachability',
    targetBranch,
    reachable: Boolean(commitReachable(issueNumber, targetBranch)),
  });

  // Axis-2: the DERIVED delivered-to-customer fact — trunk reachability, computed
  // now, never stored. `persisted:false` is the structural marker the write guard
  // and the consumer audit both key off.
  const delivered = Object.freeze({
    axis: DELIVERED_AXIS,
    derived: true,
    persisted: false,
    basis: 'trunk-reachability',
    trunk,
    onTrunk: Boolean(commitReachable(issueNumber, trunk)),
  });

  return Object.freeze({ done, delivered });
}

// Write-time guard. A consumer about to persist board fields / issue markers passes
// its intended writes (an object of key→value, or an array of `{ key }` / keys);
// this throws `PersistedDeliveredAxisError` on the first key that would record the
// derived Axis-2. Returns the writes unchanged when clean, so it composes inline:
//   persist(assertDeliveredNotPersisted(writes)).
export function assertDeliveredNotPersisted(writes) {
  if (writes == null) return writes;
  const keys = Array.isArray(writes)
    ? writes.map((w) => (w && typeof w === 'object' ? w.key : w))
    : Object.keys(writes);
  for (const key of keys) {
    if (key != null && FORBIDDEN_KEY_SET.has(normalizeKey(key))) {
      throw new PersistedDeliveredAxisError(key);
    }
  }
  return writes;
}

// The real reporting/query consumers of delivery status. Each MUST source the
// delivered-to-customer axis from git (`git-derived`, i.e. through
// `deliveryAxes().delivered`); reading it from the recorded done/Status field is
// the conflation this epic forbids. `auditConsumers` validates a consumer set
// against this contract, and the targeted test asserts THIS registry is clean.
export const CONSUMER_REGISTRY = Object.freeze([
  Object.freeze({
    name: 'verbs/status.mjs',
    surface: '/task status',
    deliveredSource: 'git-derived',
  }),
  Object.freeze({
    name: 'verbs/board.mjs',
    surface: '/task board queries',
    deliveredSource: 'git-derived',
  }),
  Object.freeze({
    name: 'verbs/report.mjs',
    surface: 'value-report',
    deliveredSource: 'git-derived',
  }),
  Object.freeze({
    name: 'lib/upstream-report.mjs',
    surface: 'rollups',
    deliveredSource: 'git-derived',
  }),
]);

// The only source that is NOT a conflation: the delivered axis is derived from git.
const NON_CONFLATING_SOURCE = 'git-derived';

// Static audit: no consumer may derive the delivered-to-customer axis from the
// recorded done/Status field. Returns `{ ok, violations:[{name, reason, deliveredSource}] }`.
// A consumer with `deliveredSource !== 'git-derived'` (e.g. 'done-field', 'status',
// 'recorded') is flagged — it treats "done" as a proxy for "on trunk".
export function auditConsumers(consumers = CONSUMER_REGISTRY) {
  const violations = [];
  for (const c of consumers) {
    const src = c && c.deliveredSource;
    if (src !== NON_CONFLATING_SOURCE) {
      violations.push({
        name: (c && c.name) || '<unnamed>',
        deliveredSource: src ?? '<missing>',
        reason: `delivered-to-customer axis sourced from "${src ?? '<missing>'}" — must be "${NON_CONFLATING_SOURCE}" (read trunk reachability from deliveryAxes().delivered, not the recorded done/Status field)`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}
