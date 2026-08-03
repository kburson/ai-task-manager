// @story #1011 #1012
// Aggregate normalized command catalog. Help metadata is canonical here;
// routing identities contribute only the verb-to-dispatch relationship.

import { COMMON_EXIT_CODES, VERB_REFERENCE } from '../../verbs/help-data.mjs';
import { SELF_DOC } from '../../../lib/self-doc.mjs';
import { EXECUTABLE_ENTRYPOINTS } from './entrypoints.mjs';
import { ROUTE_IDENTITIES, routeIdentityForVerb } from './routing.mjs';
import { normalizeHelpRecord, validateHelpRecord } from './schema.mjs';

const entrypointByCommand = new Map(
  EXECUTABLE_ENTRYPOINTS.filter((entry) => entry.command).map((entry) => [entry.command, entry])
);
const entrypointByPath = new Map(EXECUTABLE_ENTRYPOINTS.map((entry) => [entry.path, entry]));

function mergedExitCodes(extra = []) {
  const byCode = new Map(COMMON_EXIT_CODES.map((entry) => [entry.code, entry]));
  for (const entry of extra) byCode.set(entry.code, entry);
  return [...byCode.values()].sort((left, right) => left.code - right.code);
}

const exit = (code, meaning) => Object.freeze({ code, meaning });
const PREFLIGHT_ACTIVE_EXITS = Object.freeze([
  exit(9, 'live board state differs from the recorded state marker'),
  exit(10, 'issue assignee is mismatched, absent, or unverifiable'),
]);
const PREFLIGHT_TARGET_EXITS = Object.freeze([
  exit(7, 'target differs from the active issue binding'),
  exit(9, 'live board state differs from the recorded state marker'),
  exit(10, 'issue assignee is mismatched, absent, or unverifiable'),
]);
const MOVE_REFUSAL = exit(4, 'state transition or lifecycle gate refused; state unchanged');

function contract(preconditions, effects, output, exitCodes = []) {
  return Object.freeze({
    preconditions: Object.freeze(preconditions),
    effects: Object.freeze(effects),
    output: Object.freeze(output),
    exitCodes: Object.freeze(exitCodes),
  });
}

// Explicit command semantics are deliberately separate from the terse help
// summaries. A missing entry fails catalog construction instead of silently
// inheriting a plausible-sounding generic contract.
export const VERB_CONTRACTS = Object.freeze({
  status: contract(
    ['The local tracker state must be readable; an active task is not required.'],
    ['Reads tracker state and timing counters without mutating the session or issue.'],
    ['Prints the active task and counters, or an unbound-session status.']
  ),
  '#N': contract(
    [
      'The token must be a syntactically valid #N issue reference; the bind path does not run lifecycle preflight.',
    ],
    ['Flushes any prior binding, binds issue #N, and starts its work timer.'],
    ['Prints the new active binding and any timing or issue-read diagnostic.']
  ),
  start: contract(
    ['The numbered issue must exist in the configured repository and pass the assignee check.'],
    ['Binds the numbered issue and starts a tracked work session.'],
    ['Prints the active issue and session-start confirmation.'],
    PREFLIGHT_ACTIVE_EXITS
  ),
  pause: contract(
    ['An active tracked issue must be bound and pass session preflight checks.'],
    ['Flushes elapsed time, records the optional reason, and marks the session paused.'],
    ['Prints the paused issue and flushed timing totals.'],
    PREFLIGHT_ACTIVE_EXITS
  ),
  resume: contract(
    ['A paused or stopped issue must be recoverable and pass assignee and drift checks.'],
    ['Restores the selected or last paused binding and starts a new timing segment.'],
    ['Prints the resumed issue and session status.'],
    PREFLIGHT_ACTIVE_EXITS
  ),
  stop: contract(
    ['An active tracked issue must be bound and pass session preflight checks.'],
    ['Flushes the final timing segment and clears the active binding.'],
    ['Prints the stopped issue and final session totals.'],
    PREFLIGHT_ACTIVE_EXITS
  ),
  update: contract(
    ['An active tracked issue must be bound and pass session preflight checks.'],
    [
      'Flushes timing and word counters, records the optional checkpoint, and keeps the binding active.',
    ],
    ['Prints the checkpoint and refreshed counters.'],
    PREFLIGHT_ACTIVE_EXITS
  ),
  'words-count': contract(
    ['No active issue is required; a current session log is used when one exists.'],
    ['Reads the current session transcript without changing tracker state.'],
    ['Prints one integer word count.']
  ),
  promote: contract(
    [
      'The target issue must be active or explicitly selected, assigned correctly, drift-free, and eligible for exactly one forward edge.',
    ],
    ['Runs the current edge gate and advances the board by one state only when every gate passes.'],
    ['Prints the attempted edge, gate evidence, resulting state, or a machine-readable prompt.'],
    [
      exit(3, 'delegated lifecycle action failed'),
      MOVE_REFUSAL,
      ...PREFLIGHT_TARGET_EXITS,
      exit(7, 'target binding differs or the issue mutation lock is held'),
    ]
  ),
  demote: contract(
    [
      'The target issue must be in Test or Review, match the active binding, and include --rework provenance for Review-to-Develop rework.',
    ],
    ['Moves the issue back one state to Develop and records the transition markers.'],
    ['Prints the prior and resulting state or the refusing gate.'],
    [MOVE_REFUSAL, ...PREFLIGHT_TARGET_EXITS]
  ),
  park: contract(
    ['The target must be in Refine or Plan, --reason is required, and preflight checks must pass.'],
    ['Moves the issue to Backlog while retaining estimate fields and records the reason.'],
    ['Prints the parked issue, retained fields, and transition result.'],
    [MOVE_REFUSAL, ...PREFLIGHT_TARGET_EXITS]
  ),
  refine: contract(
    [
      'The issue must exist in Backlog; size, estimate, priority, and reason are required; assignee and drift checks must pass.',
    ],
    ['Writes refinement fields and rationale, then moves the issue one edge into Refine.'],
    ['Prints the applied fields, rationale marker, transition result, or refusal prompt.'],
    [MOVE_REFUSAL, ...PREFLIGHT_TARGET_EXITS]
  ),
  plan: contract(
    ['The numbered issue must exist in Refine and satisfy the Refine-to-Plan entry gates.'],
    ['Moves the issue one edge into Plan without running discovery-plan generation.'],
    ['Prints gate failures or the confirmed Plan state.'],
    [MOVE_REFUSAL]
  ),
  'plan-approve': contract(
    [
      'The target must be in Plan, pass assignee and drift checks, and have the required plan evidence.',
    ],
    ['Records the human or Full-Auto plan-approval marker used by the Plan-to-Develop gate.'],
    ['Prints approval provenance or a prompt explaining the missing approval prerequisite.'],
    [
      exit(3, 'issue is not in Plan'),
      ...PREFLIGHT_TARGET_EXITS,
      exit(12, 'plan evidence preflight failed'),
    ]
  ),
  'plan-estimate': contract(
    [
      'The target must be in Plan with a refine estimate and either v1 evidence or explicit legacy compatibility flags; one-time legacy adoption additionally accepts an exact-matching Develop baseline.',
    ],
    [
      'V1 converges board Size/Estimate, canonical fields, Refine history, and a read-back forecast; compatibility mode updates only the legacy appendix.',
    ],
    ['Prints convergence evidence and the immutable forecast record ID.']
  ),
  approve: contract(
    ['The target must be in Review, pass preflight, and satisfy final-review approval policy.'],
    [
      'Records Full-Auto approval evidence, or explicit human provenance with --human, and enables close.',
    ],
    ['Prints approval provenance, remaining review blockers, or a machine-readable prompt.'],
    [
      exit(3, 'issue is not in Review'),
      exit(6, 'agent review has not completed'),
      ...PREFLIGHT_TARGET_EXITS,
      exit(7, 'target binding differs or the issue mutation lock is held'),
    ]
  ),
  review: contract(
    [
      'The target must be in Test or Review, pass preflight, and have reviewable verification evidence.',
      'The --probe mode requires the target to already be in Review and the quoted command to pass the verification allowlist.',
    ],
    [
      'Flushes timing, evaluates the review gate, moves Test to Review when needed, and pauses the session.',
      'With --probe, executes only focused commands at the clean exact SHA and persists a separate Review receipt without rerunning the Review gate.',
    ],
    [
      'Prints review findings, state movement, timing totals, approval prompts, or focused-probe receipt diagnostics.',
    ],
    [
      exit(3, 'review evidence or board data could not be fetched'),
      MOVE_REFUSAL,
      ...PREFLIGHT_TARGET_EXITS,
    ]
  ),
  reject: contract(
    ['The target must be in Review, a reason is required, and preflight checks must pass.'],
    ['Records the rejection reason and returns the issue to Develop for rework.'],
    ['Prints the rejection audit record and resulting state.'],
    PREFLIGHT_TARGET_EXITS
  ),
  test: contract(
    ['The target must be in Develop and declare runnable Verification Commands.'],
    [
      'Finalizes Develop lint/format evidence, reuses that exact-SHA receipt, then runs Test-owned verification in an isolated worktree and moves the issue to Test only on success.',
    ],
    ['Streams finalization, sandbox verification, and resulting state or failure diagnostics.']
  ),
  reconcile: contract(
    [
      'The issue must exist, a listed reconciliation or backfill mode is required, and its mutation lock must be available.',
    ],
    ['Adopts live state, walks the board to a recorded sentinel, or backfills missing markers.'],
    ['Prints detected drift, each repair step, and the final reconciled state.'],
    [
      exit(3, 'delegated board transition refused its verb-context gate'),
      exit(4, 'no drift exists for the selected reconciliation mode'),
      exit(5, 'requested repair would move in the wrong direction'),
      exit(6, 'delegated evidence-contiguity gate refused'),
      exit(7, 'the issue mutation lock is held'),
      exit(8, 'reconciled state could not be recorded'),
    ]
  ),
  board: contract(
    [
      'A target issue must be supplied or actively bound and the configured Project field must be readable.',
    ],
    ['Reads the live Project Status without changing issue or tracker state.'],
    ['Prints the canonical live board state.']
  ),
  'epic-reconcile': contract(
    ['The target must be a valid epic whose child delivery can be inspected.'],
    ['Records the epic acceptance-criteria reconciliation marker.'],
    ['Prints the epic, inspected child set, and marker result.']
  ),
  'pull-next': contract(
    ['The epic must exist and have an eligible ranked child currently in Refine.'],
    ['Selects the next child by rank and promotes it one edge into Plan.'],
    ['Prints the selected child and its transition result.']
  ),
  close: contract(
    [
      'Delivery close requires final approval, pre-close evidence, and a reachable attributed commit; disposition close requires a valid --as mode.',
    ],
    [
      'Flushes timing and closes through Done, or records a duplicate/not-planned disposition and removes the issue from the board.',
    ],
    ['Prints each close gate, repair action when requested, and the final closed state.'],
    [
      exit(3, 'body fetch, convergence, or operator confirmation prevented close'),
      MOVE_REFUSAL,
      exit(5, 'attributed commit or branch reachability gate failed'),
      exit(6, 'required evidence layout is not contiguous'),
      ...PREFLIGHT_TARGET_EXITS,
      exit(7, 'target binding differs or final review approval is missing'),
      exit(8, '--answer cannot satisfy the final human-review approval gate'),
    ]
  ),
  'inflate-estimate': contract(
    [
      'A positive issue number, size, estimate, reason, and at least one repeatable --item are required.',
    ],
    ['Updates board estimate fields and appends an auditable inflation comment.'],
    ['Prints old and new estimates and the audit comment reference.']
  ),
  kind: contract(
    ['The target issue must exist and the requested kind or clear operation must be valid.'],
    ['Sets or clears the issue-kind marker used by commit and epic gates.'],
    ['Prints the resulting issue kind.']
  ),
  block: contract(
    ['The blocked issue and every --by issue must exist; at least one blocker is required.'],
    ['Adds blocker relationships, blocked label and board metadata, and the body marker.'],
    ['Prints the canonical blocker set after mutation.']
  ),
  unblock: contract(
    ['The target issue must exist; optional --by values must identify current blockers.'],
    ['Removes selected blockers or clears the full blocked relationship and metadata.'],
    ['Prints removed and remaining blockers.']
  ),
  supersede: contract(
    ['Both issue numbers must exist, --by is required, and the dead issue must pass preflight.'],
    [
      'Records the replacement relationship, moves the dead issue to Done, and closes it as superseded.',
    ],
    ['Prints the supersession link and close result.'],
    [MOVE_REFUSAL, ...PREFLIGHT_TARGET_EXITS]
  ),
  auto: contract(
    ['The mode must be both, plan, review, off, or reset.'],
    ['Changes only the current session human-gate override settings.'],
    ['Prints the effective plan and review gate modes.'],
    [exit(3, 'session override state could not be persisted')]
  ),
  'ac-stamp': contract(
    ['The active issue must contain the exact criterion and its declared verifier command.'],
    ['Runs the verifier and writes the criterion evidence marker only after exit 0.'],
    ['Streams verifier output and prints the evidence marker result.']
  ),
  'dod-stamp': contract(
    ['A supported Functional DoD key and its runnable verifier must be available.'],
    ['Runs the selected verifier and writes its DoD evidence marker only after success.'],
    ['Streams verifier output and prints the stamped DoD key.']
  ),
  check: contract(
    [
      'An active issue and exact checkbox label are required; proof-bound boxes need evidence unless explicitly overridden.',
    ],
    ['Idempotently checks the matching box and never unchecks it.'],
    ['Prints whether the box changed or was already checked.']
  ),
  ensureChecked: contract(
    [
      'An active issue and exact checkbox label are required; proof-bound boxes need evidence unless explicitly overridden.',
    ],
    ['Idempotently checks the matching box and never unchecks it.'],
    ['Prints whether the box changed or was already checked.']
  ),
  ensureUnchecked: contract(
    ['An active issue and exact checkbox label are required.'],
    ['Idempotently clears the matching checkbox and never checks it.'],
    ['Prints whether the box changed or was already clear.']
  ),
  'evidence-markers': contract(
    ['The issue must exist; backfill additionally requires a reviewed mapping file.'],
    ['Audits existing AC markers or backfills verified mappings, with dry-run support.'],
    ['Prints per-criterion evidence status and mutation totals.'],
    [exit(3, 'evidence audit found invalid or incomplete marker state')]
  ),
  'commit-trace': contract(
    ['The target issue must exist and the current Git HEAD must be readable.'],
    ['Creates or updates the canonical commit-trace issue comment from HEAD history.'],
    ['Prints the traced commits and comment reference.']
  ),
  'mirror-deep-dive': contract(
    ['A valid source comment and target issue are required.'],
    ['Copies the source deep-dive block into the canonical issue-body section.'],
    ['Prints the source comment and updated issue reference.']
  ),
  new: contract(
    [
      'The current directory must be an initialized Git repository with configured GitHub repo/project access.',
    ],
    ['Creates an issue through the sanctioned preflight pipeline and starts tracking it.'],
    ['Prints the created issue URL, applied fields, and active binding.']
  ),
  discover: contract(
    ['No issue or active session is required; no other discovery bucket may be active.'],
    ['Creates an untracked discovery bucket without starting issue timing.'],
    ['Prints the discovery bucket identifier and save/cancel commands.']
  ),
  'save-plan': contract(
    ['An active discovery bucket and readable --from-file markdown are required.'],
    ['Writes the plan under docs/plans and records its path in discovery state.'],
    ['Prints the saved plan path.']
  ),
  'save-draft': contract(
    ['An active discovery bucket and readable --from-file markdown are required.'],
    ['Creates or updates the tracked discovery draft without filing an issue.'],
    ['Prints the draft path and discovery state.']
  ),
  cancel: contract(
    ['An active discovery bucket must exist.'],
    ['Discards discovery state without recording task time or creating an issue.'],
    ['Prints confirmation that the discovery bucket was removed.']
  ),
  report: contract(
    [
      'A summary or readable defect-hint payload is required before confirmation; filing requires configured GitHub access.',
    ],
    ['Builds a defect or feature report and files it only after the requested confirmation path.'],
    ['Prints the draft report or created issue URL.']
  ),
  'user-story': contract(
    ['The target issue must exist and all three Connextra fields are required.'],
    ['Creates or replaces the canonical first User Story section.'],
    ['Prints the updated issue and normalized story text.']
  ),
  config: contract(
    ['No active issue is required; writes require a supported key/value or the init interview.'],
    ['Lists configuration, updates one setting, or initializes project configuration.'],
    ['Prints current values, the changed setting, or interview results.']
  ),
  migrate: contract(
    [
      'Repository and target Project configuration must be available; --dry-run may be used for preview.',
    ],
    [
      'Tethers eligible repository issues to the configured Project or reports the planned mutations.',
    ],
    ['Prints per-issue migration actions and totals.']
  ),
  fleet: contract(
    ['No active issue is required; linked worktree tracker states must be readable.'],
    [
      'Lists bindings read-only, or prunes stale registry entries unless prune --dry-run is selected.',
    ],
    ['Prints fleet rows or the stale entries evicted or retained by prune.']
  ),
  log: contract(
    ['The numbered issue and its timing event history must exist.'],
    ['Recomputes and writes Engaged, Session, Review, and Plan timing fields.'],
    ['Prints the computed duration fields and write result.']
  ),
  'chore-mode': contract(
    ['A valid on, off, or status operation is required; an on reason is optional.'],
    ['Persists, clears, resumes, or reads the source-edit gate override.'],
    ['Prints chore-mode state, reason, and suspension status.']
  ),
  'decompose-check': contract(
    ['The target issue and its board planning fields must be readable.'],
    ['Reads the issue, linked plan, and decomposition policy without mutating any state.'],
    ['Prints the atomicity classification, signals, plan diagnostic, and waiver status.']
  ),
  'split-plan': contract(
    [
      'The target must require decomposition and have a readable numbered plan with executable verifiers.',
      'Exactly one of --dry-run and --confirm is required.',
    ],
    [
      'Preflights every generated child through sanctioned create-issue; --confirm creates children only after every preflight passes.',
    ],
    ['Prints deterministic proposals, created issue numbers, or partial-success recovery data.']
  ),
  help: contract(
    ['No active issue, repository initialization, network access, or writable state is required.'],
    ['Reads the canonical command catalog without changing project or session state.'],
    ['Prints the grouped command list or one complete command reference.']
  ),
});

export const VERB_RELATED_COMMANDS = Object.freeze({
  status: Object.freeze(['start', 'fleet', 'words-count']),
  '#N': Object.freeze(['start', 'resume']),
  start: Object.freeze(['#N', 'resume', 'pause']),
  pause: Object.freeze(['resume', 'update', 'stop']),
  resume: Object.freeze(['pause', 'stop', 'start']),
  stop: Object.freeze(['start', 'resume', 'status']),
  update: Object.freeze(['pause', 'stop', 'words-count']),
  'words-count': Object.freeze(['status', 'update', 'log']),
  promote: Object.freeze(['demote', 'plan', 'test', 'review', 'close']),
  demote: Object.freeze(['promote', 'review', 'test']),
  park: Object.freeze(['refine', 'promote']),
  refine: Object.freeze(['park', 'plan', 'promote']),
  plan: Object.freeze(['plan-estimate', 'plan-approve', 'promote']),
  'plan-approve': Object.freeze(['plan-estimate', 'promote']),
  'plan-estimate': Object.freeze(['plan-approve', 'promote']),
  'decompose-check': Object.freeze(['split-plan', 'plan', 'promote']),
  'split-plan': Object.freeze(['decompose-check', 'create-issue']),
  approve: Object.freeze(['review', 'reject', 'close']),
  review: Object.freeze(['approve', 'reject', 'close']),
  reject: Object.freeze(['review', 'demote']),
  test: Object.freeze(['review', 'demote', 'promote']),
  reconcile: Object.freeze(['board', 'status', 'promote']),
  board: Object.freeze(['status', 'reconcile', 'fleet']),
  'epic-reconcile': Object.freeze(['pull-next', 'promote', 'close']),
  'pull-next': Object.freeze(['plan', 'promote', 'epic-reconcile']),
  close: Object.freeze(['approve', 'review', 'commit-trace']),
  'inflate-estimate': Object.freeze(['plan-estimate', 'board']),
  kind: Object.freeze(['new', 'board']),
  block: Object.freeze(['unblock', 'board']),
  unblock: Object.freeze(['block', 'board']),
  supersede: Object.freeze(['block', 'close']),
  auto: Object.freeze(['plan-approve', 'approve', 'close']),
  'ac-stamp': Object.freeze(['ensureChecked', 'evidence-markers']),
  'dod-stamp': Object.freeze(['ensureChecked', 'close']),
  check: Object.freeze(['ac-stamp', 'dod-stamp', 'ensureUnchecked']),
  ensureChecked: Object.freeze(['ac-stamp', 'dod-stamp', 'ensureUnchecked']),
  ensureUnchecked: Object.freeze(['ensureChecked', 'reject']),
  'evidence-markers': Object.freeze(['ac-stamp', 'ensureChecked']),
  'commit-trace': Object.freeze(['close', 'status']),
  'mirror-deep-dive': Object.freeze(['plan', 'save-plan']),
  new: Object.freeze(['discover', 'refine', '#N']),
  discover: Object.freeze(['save-draft', 'save-plan', 'cancel']),
  'save-plan': Object.freeze(['save-draft', 'new', 'cancel']),
  'save-draft': Object.freeze(['save-plan', 'cancel']),
  cancel: Object.freeze(['discover', 'new']),
  report: Object.freeze(['new', 'block']),
  'user-story': Object.freeze(['new', 'refine', 'plan']),
  config: Object.freeze(['status', 'migrate']),
  migrate: Object.freeze(['config', 'board']),
  fleet: Object.freeze(['status', 'board']),
  log: Object.freeze(['status', 'words-count']),
  'chore-mode': Object.freeze(['status', 'update']),
  help: Object.freeze(['status', 'config']),
});

const positional = (name, description) => Object.freeze({ name, description });

export const VERB_POSITIONAL_ARGUMENTS = Object.freeze({
  status: Object.freeze([]),
  '#N': Object.freeze([positional('#N', 'Issue number to bind as the active task.')]),
  start: Object.freeze([positional('<N>', 'Issue number to bind and start.')]),
  pause: Object.freeze([positional('["reason"]', 'Optional reason recorded with the pause.')]),
  resume: Object.freeze([
    positional('[#N]', 'Optional issue number to resume instead of the last paused task.'),
    positional('["reason"]', 'Optional reason recorded with the resume.'),
  ]),
  stop: Object.freeze([]),
  update: Object.freeze([positional('["msg"]', 'Optional checkpoint message.')]),
  'words-count': Object.freeze([]),
  promote: Object.freeze([
    positional('#N', 'Required issue number advanced by one forward state.'),
  ]),
  demote: Object.freeze([
    positional('#N', 'Required issue number returned one state toward Develop.'),
  ]),
  park: Object.freeze([positional('<N>', 'Issue number to return to Backlog.')]),
  refine: Object.freeze([positional('<N>', 'Issue number to refine.')]),
  plan: Object.freeze([positional('#N', 'Issue number to move from Refine to Plan.')]),
  'plan-approve': Object.freeze([
    positional('#N', 'Required issue number whose plan approval is recorded.'),
  ]),
  'plan-estimate': Object.freeze([
    positional('[#N]', 'Optional issue number; defaults to the active task.'),
  ]),
  'decompose-check': Object.freeze([
    positional('<issue>', 'Issue number whose linked plan is classified.'),
  ]),
  'split-plan': Object.freeze([
    positional('<issue>', 'Issue number whose linked plan supplies child sections.'),
  ]),
  approve: Object.freeze([positional('#N', 'Required issue number whose review is approved.')]),
  review: Object.freeze([positional('#N', 'Issue number to move through the review gate.')]),
  reject: Object.freeze([positional('#N', 'Issue number whose review is rejected.')]),
  test: Object.freeze([positional('#N', 'Issue number verified in the sandbox.')]),
  reconcile: Object.freeze([
    positional(
      '<accept-live|revert-to-recorded|revert-to-sentinel|backfill>',
      'Explicit reconciliation or missing-field backfill mode.'
    ),
    positional('#N', 'Issue number whose recorded and live state differ.'),
  ]),
  board: Object.freeze([positional('[#N]', 'Optional issue number; defaults to the active task.')]),
  'epic-reconcile': Object.freeze([
    positional('[<N>]', 'Optional epic issue number; defaults to the active task.'),
  ]),
  'pull-next': Object.freeze([positional('<epic#>', 'Epic whose next ranked child is pulled.')]),
  close: Object.freeze([positional('[#N]', 'Optional issue number; defaults to the active task.')]),
  'inflate-estimate': Object.freeze([
    positional('<N>', 'Required positive issue number whose estimate is inflated.'),
  ]),
  kind: Object.freeze([
    positional('[<N>]', 'Optional issue number; defaults to the active task.'),
    positional(
      '<code|docs-only|audit|research|spike|epic>',
      'Issue kind to set; code clears the explicit marker.'
    ),
  ]),
  block: Object.freeze([
    positional('[#N]', 'Optional blocked issue number; defaults to the active task.'),
  ]),
  unblock: Object.freeze([
    positional('[#N]', 'Optional blocked issue number; defaults to the active task.'),
  ]),
  supersede: Object.freeze([positional('<dead#>', 'Issue number being superseded.')]),
  auto: Object.freeze([
    positional('<both|plan|review|off|reset>', 'Full-Auto gate mode to apply.'),
  ]),
  'ac-stamp': Object.freeze([
    positional('"<acceptance criterion label>"', 'Exact acceptance-criterion label to verify.'),
  ]),
  'dod-stamp': Object.freeze([positional('<key>', 'Functional DoD key: tests, lint, or commits.')]),
  check: Object.freeze([
    positional('["<label>"]', 'Optional legacy single label when batch flags are not used.'),
  ]),
  ensureChecked: Object.freeze([
    positional('["<label>"]', 'Optional single label when batch flags are not used.'),
  ]),
  ensureUnchecked: Object.freeze([
    positional('["<label>"]', 'Optional single label when batch flags are not used.'),
  ]),
  'evidence-markers': Object.freeze([
    positional('<audit|backfill>', 'Evidence-marker operation.'),
    positional('#N', 'Issue number to audit or backfill.'),
  ]),
  'commit-trace': Object.freeze([
    positional('[#N]', 'Optional issue number; defaults to the active task.'),
  ]),
  'mirror-deep-dive': Object.freeze([
    positional('[#N]', 'Optional issue number; defaults to the active task.'),
  ]),
  new: Object.freeze([
    positional(
      '[title|docs/plans/<file>.md]',
      'Optional plain title or saved discovery-plan path.'
    ),
  ]),
  discover: Object.freeze([]),
  'save-plan': Object.freeze([]),
  'save-draft': Object.freeze([]),
  cancel: Object.freeze([]),
  report: Object.freeze([]),
  'user-story': Object.freeze([
    positional('[#N]', 'Optional issue number; defaults to the active task.'),
  ]),
  config: Object.freeze([
    positional(
      '[<key> <value> | init]',
      'Optional configuration key/value update or initialization operation.'
    ),
  ]),
  migrate: Object.freeze([]),
  fleet: Object.freeze([positional('[prune]', 'Optional stale-registration pruning subcommand.')]),
  log: Object.freeze([positional('#N', 'Issue number whose timing fields are recomputed.')]),
  'chore-mode': Object.freeze([
    positional('<on ["reason"]|off|status>', 'Chore-mode operation and optional on-reason.'),
  ]),
  help: Object.freeze([positional('[<verb>]', 'Optional task verb to document.')]),
});

function verbArguments(name, reference) {
  if (!Object.hasOwn(VERB_POSITIONAL_ARGUMENTS, name)) {
    throw new Error(`command catalog: missing explicit positional arguments for ${name}`);
  }
  return [
    ...VERB_POSITIONAL_ARGUMENTS[name],
    ...(reference.flags || []).map((flag) => ({
      name: flag.flag,
      description: flag.desc,
      ...(flag.default ? { default: flag.default } : {}),
    })),
  ];
}

function verbPath(entry) {
  if (!entry || entry.dispatch === 'inline') {
    return 'scripts/task-tracker/task-tracker.mjs';
  }
  return `scripts/task-tracker/${entry.dispatch}`;
}

const coveredReferenceKeys = new Set();
const verbRecords = ROUTE_IDENTITIES.map((route) => {
  const reference = VERB_REFERENCE[route.verb];
  if (!reference) throw new Error(`command catalog: missing verb reference for ${route.verb}`);
  const contract = VERB_CONTRACTS[route.verb];
  if (!contract)
    throw new Error(`command catalog: missing explicit verb contract for ${route.verb}`);
  const relatedCommands = VERB_RELATED_COMMANDS[route.verb];
  if (!relatedCommands)
    throw new Error(`command catalog: missing explicit related commands for ${route.verb}`);
  const aliases = Object.freeze(
    (reference.aliases || []).filter((alias) => /^[a-z][a-z0-9-]*$/i.test(alias))
  );
  coveredReferenceKeys.add(route.verb);
  for (const alias of aliases) coveredReferenceKeys.add(alias);
  const path = verbPath(route);
  return normalizeHelpRecord({
    name: route.verb,
    aliases,
    classification: 'agent-callable-verb',
    agentCallable: true,
    purpose: reference.summary,
    usage: reference.usage,
    arguments: verbArguments(route.verb, reference),
    preconditions: contract.preconditions,
    effects: contract.effects,
    output: contract.output,
    exitCodes: mergedExitCodes([...(contract.exitCodes || []), ...(reference.exitCodes || [])]),
    examples: reference.examples,
    relatedCommands,
    path,
    routing: route.dispatch,
    group: reference.topic,
  });
});

const supplementalVerbRecords = Object.entries(VERB_REFERENCE)
  .filter(([name]) => !coveredReferenceKeys.has(name))
  .map(([name, reference]) => {
    const contract = VERB_CONTRACTS[name];
    if (!contract) throw new Error(`command catalog: missing explicit verb contract for ${name}`);
    const relatedCommands = VERB_RELATED_COMMANDS[name];
    if (!relatedCommands)
      throw new Error(`command catalog: missing explicit related commands for ${name}`);
    return normalizeHelpRecord({
      name,
      aliases: reference.aliases || [],
      classification: 'agent-callable-verb',
      agentCallable: true,
      purpose: reference.summary,
      usage: reference.usage,
      arguments: verbArguments(name, reference),
      preconditions: contract.preconditions,
      effects: contract.effects,
      output: contract.output,
      exitCodes: mergedExitCodes([...(contract.exitCodes || []), ...(reference.exitCodes || [])]),
      examples: reference.examples,
      relatedCommands,
      path: 'scripts/task-tracker/task-tracker.mjs',
      routing: 'inline',
      group: reference.topic,
    });
  });

// #1089 — `verify-develop` is a two-mode authority boundary. Refuse catalog
// construction if its canonical standalone metadata ever collapses iteration
// and exact-SHA finalization back into an ambiguous single command.
const verifyDevelopDoc = SELF_DOC['verify-develop'];
if (
  !verifyDevelopDoc?.usage.includes('--mode iteration|final') ||
  !verifyDevelopDoc?.arguments.some(({ name }) => name === '--issue <N>')
) {
  throw new Error('command catalog: verify-develop must expose iteration/final and --issue <N>');
}

const selfDocRecords = Object.entries(SELF_DOC).map(([name, doc]) => {
  const classified = entrypointByCommand.get(name) || entrypointByPath.get(doc.path);
  return normalizeHelpRecord({
    name,
    aliases: doc.aliases || [],
    classification: classified?.classification || doc.classification,
    agentCallable: doc.agentCallable ?? doc.routable !== false,
    purpose: doc.synopsis,
    usage: doc.usage,
    arguments: doc.arguments,
    preconditions: doc.preconditions,
    effects: doc.effects,
    output: doc.output,
    exitCodes: doc.exitCodes,
    examples: doc.examples || [`npx ${doc.usage}`],
    relatedCommands: doc.relatedCommands,
    path: doc.path,
    routing: doc.routable === false ? 'direct-only' : 'standalone',
    group: doc.group,
  });
});

export function buildCommandCatalog(...sources) {
  const byName = new Map();
  for (const records of sources) {
    for (const record of records) {
      const prior = byName.get(record.name);
      if (prior) {
        throw new Error(
          `command catalog: duplicate canonical command "${record.name}" from ${prior.path} and ${record.path}`
        );
      }
      byName.set(record.name, Object.isFrozen(record) ? record : normalizeHelpRecord(record));
    }
  }
  return Object.freeze([...byName.values()]);
}

export const COMMAND_CATALOG = buildCommandCatalog(
  verbRecords,
  supplementalVerbRecords,
  selfDocRecords
);

const lookup = new Map();
for (const record of COMMAND_CATALOG) {
  for (const name of [record.name, ...record.aliases]) {
    if (lookup.has(name)) {
      throw new Error(`command catalog: duplicate command or alias ${name}`);
    }
    lookup.set(name, record);
  }
  const errors = validateHelpRecord(record);
  if (errors.length) {
    throw new Error(`command catalog: invalid ${record.name}: ${errors.join('; ')}`);
  }
}

export function commandByName(name) {
  return lookup.get(String(name)) || null;
}

export function agentCommandCatalog() {
  return COMMAND_CATALOG.filter((record) => record.agentCallable);
}

export function routeIdentityForCommand(name) {
  const record = commandByName(name);
  return record ? routeIdentityForVerb(record.name) : null;
}

export function taskVerbNames() {
  return new Set(verbRecords.flatMap((record) => [record.name, ...record.aliases]));
}
