// Per-verb reference data for `/task help` (#667).
//
// This module is the single data source behind the reworked help surface. It is
// deliberately data-only (no I/O, no rendering) so the drift-guard test
// (`help.test.mjs`) can import and assert against it without capturing stdout,
// and so `help.mjs` stays a thin renderer.
//
// Shapes:
//   VERB_REFERENCE: { [verb]: {
//     topic,            // one of TOPICS
//     summary,          // one-line description
//     usage,            // canonical `/task …` invocation line
//     aliases?,         // [string] alternate names dispatched to the same verb
//     flags?,           // [{ flag, desc, default? }]
//     exitCodes?,       // [{ code, meaning }] — overrides/augments COMMON_EXIT_CODES
//     examples,         // [string] ≥1 realistic invocation
//   } }
//   TOPICS: ordered display groups.
//   STATE_TRANSITIONS: the kanban edges, the driving verb, and per-edge gates.
//   GATE_EVIDENCE_MODEL: prose blocks for the gate/evidence section.
//
// The drift guard cross-checks VERB_REFERENCE keys against the live router
// (`task-tracker.mjs` `case '<verb>':` labels), so a new verb added to the
// dispatcher without a reference entry fails the test — help cannot silently
// drift from behavior.

export const TOPICS = [
  { key: 'lifecycle', title: 'Session & timer' },
  { key: 'board', title: 'Board / state machine' },
  { key: 'evidence', title: 'Evidence & proof' },
  { key: 'discovery', title: 'Creation & discovery' },
  { key: 'meta', title: 'Config, reporting & recovery' },
];

// Default exit-code convention shared by every verb unless it declares its own.
export const COMMON_EXIT_CODES = [
  { code: 0, meaning: 'success (or idempotent no-op)' },
  { code: 1, meaning: 'runtime error (message on stderr)' },
  { code: 2, meaning: 'usage error / unknown verb' },
];

// Gate-guarded state-machine verbs share this refusal code.
const GATE_REFUSAL = {
  code: 4,
  meaning: 'gate refused the transition (blockers printed); state unchanged',
};

export const VERB_REFERENCE = {
  // ── lifecycle ────────────────────────────────────────────────────────────
  status: {
    topic: 'lifecycle',
    summary: 'Show the active task, elapsed time, and words since the last marker.',
    usage: '/task',
    aliases: ['(default when no verb given)'],
    examples: ['/task'],
  },
  '#N': {
    topic: 'lifecycle',
    summary: 'Start or switch the timer to issue #N (binds it as the active task).',
    usage: '/task #N',
    examples: ['/task #667'],
  },
  start: {
    topic: 'lifecycle',
    summary: 'Bind to issue #N and start the timer (same path as `/task #N`).',
    usage: '/task start <N>',
    exitCodes: [{ code: 1, meaning: 'no issue number provided' }],
    examples: ['/task start 667'],
  },
  pause: {
    topic: 'lifecycle',
    summary: 'Flush timing and pause the active task; sets the paused flag.',
    usage: '/task pause ["reason"]',
    examples: ['/task pause "pause for question"'],
  },
  resume: {
    topic: 'lifecycle',
    summary: 'Resume the last paused task, or return to a specific paused/stopped issue.',
    usage: '/task resume [#N] ["reason"]',
    examples: ['/task resume', '/task resume 667 "question answered"'],
  },
  stop: {
    topic: 'lifecycle',
    summary: 'End the current session and unbind the active task.',
    usage: '/task stop',
    examples: ['/task stop'],
  },
  update: {
    topic: 'lifecycle',
    summary: 'Checkpoint — flush timing, reset counters, keep the task active.',
    usage: '/task update ["msg"]',
    examples: ['/task update "finished the parser"'],
  },
  'words-count': {
    topic: 'lifecycle',
    summary: 'Print the word count for the current session (agent bookkeeping).',
    usage: '/task words-count',
    examples: ['/task words-count'],
  },
  switch: {
    topic: 'lifecycle',
    summary: 'Internal: switch the active task to a bare `#N` verb (dispatched from `/task #N`).',
    usage: '/task #N',
    examples: ['/task #667'],
  },

  // ── board / state machine ─────────────────────────────────────────────────
  promote: {
    topic: 'board',
    summary: 'Advance one forward state (Backlog→Refine→Plan→Develop→Test→Review→Done).',
    usage: '/task promote [#N]',
    aliases: ['next'],
    exitCodes: [GATE_REFUSAL],
    examples: ['/task promote 667', '/task next'],
  },
  demote: {
    topic: 'board',
    summary: 'Return one state backward (from Test or Review back to Develop).',
    usage: '/task demote [#N]',
    exitCodes: [GATE_REFUSAL],
    examples: ['/task demote 667'],
  },
  refine: {
    topic: 'board',
    summary:
      'Atomic Backlog→Refine: set Priority+Size+Estimate, write the rationale marker, enter Refine.',
    usage:
      '/task refine <N> --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2> --reason <text>',
    flags: [
      { flag: '--size <XS|S|M|L|XL>', desc: 'T-shirt size (required)' },
      { flag: '--estimate <hours>', desc: 'estimate in hours (required)' },
      { flag: '--priority <p0|p1|p2>', desc: 'priority (required)' },
      { flag: '--reason <text>', desc: 'refinement rationale (required)' },
      { flag: '--rank <n>', desc: 'optional board Rank' },
      { flag: '--labels / --add-label <name>', desc: 'optional labels to add' },
    ],
    exitCodes: [{ code: 1, meaning: 'a required flag is missing' }, GATE_REFUSAL],
    examples: [
      '/task refine 667 --size L --estimate 6 --priority p2 --reason "per-verb help rework"',
    ],
  },
  plan: {
    topic: 'board',
    summary:
      'Refine→Plan (Sprint-Planning entry); distinct from discover backlog item generation. Refuses on any other current state.',
    usage: '/task plan #N',
    exitCodes: [GATE_REFUSAL],
    examples: ['/task plan 667'],
  },
  'plan-approve': {
    topic: 'board',
    summary:
      'Record human plan approval (stamps the `aitm-plan-approved` marker Plan→Develop needs).',
    usage: '/task plan-approve [#N]',
    exitCodes: [{ code: 1, meaning: 'issue not in plan state' }],
    examples: ['/task plan-approve 667'],
  },
  'plan-estimate': {
    topic: 'board',
    summary: 'Append the `### Planned Estimate` appendix the Plan→Develop gate requires.',
    usage:
      '/task plan-estimate [#N] --planned-size <S> --planned-estimate <H> [--rationale "<text>"]',
    flags: [
      { flag: '--planned-size <S>', desc: 'post-planning size' },
      { flag: '--planned-estimate <H>', desc: 'post-planning estimate (hours)' },
      {
        flag: '--current-size <S>',
        desc: 'override the Refine-column size',
        default: 'live board Size',
      },
      {
        flag: '--current-estimate <H>',
        desc: 'override the Refine-column estimate',
        default: 'live board Estimate',
      },
      { flag: '--rationale "<text>"', desc: 'why the estimate changed (or held)' },
    ],
    examples: [
      '/task plan-estimate 667 --planned-size L --planned-estimate 6 --rationale "held after deep dive"',
    ],
  },
  approve: {
    topic: 'board',
    summary:
      'Record final review approval (Review→Done gate). In Full-Auto, pair with an audit comment.',
    usage: '/task approve [#N]',
    exitCodes: [GATE_REFUSAL],
    examples: ['/task approve 667'],
  },
  review: {
    topic: 'board',
    summary: 'Move an issue through Test to Review, flush timing, and pause.',
    usage: '/task review #N [--duration-minutes N --words N]',
    flags: [
      { flag: '--duration-minutes <N>', desc: 'agent-reported active minutes (skips JSONL read)' },
      { flag: '--words <N>', desc: 'agent-reported word delta' },
    ],
    exitCodes: [GATE_REFUSAL],
    examples: ['/task review 667', '/task review 667 --duration-minutes 45 --words 1200'],
  },
  reject: {
    topic: 'board',
    summary: 'Reject an issue under review (returns it for rework). Reason required.',
    usage: '/task reject #N --reason "..."',
    flags: [{ flag: '--reason "<text>"', desc: 'why the review failed (required)' }],
    exitCodes: [{ code: 1, meaning: 'not in review state, or reason missing' }],
    examples: ['/task reject 667 --reason "help page missing exit codes"'],
  },
  test: {
    topic: 'board',
    summary:
      'Develop→Test sandbox verification — runs the Verification Commands in an isolated worktree.',
    usage: '/task test #N [--detach] [--force] [--no-audit] [--no-fund]',
    flags: [
      { flag: '--detach', desc: 'run the sandbox without holding the session' },
      { flag: '--force', desc: 'proceed past soft warnings' },
      { flag: '--no-audit', desc: 'skip the audit sub-step' },
      { flag: '--no-fund', desc: 'skip the funding sub-step' },
    ],
    exitCodes: [{ code: 1, meaning: 'a verification command failed in the sandbox' }, GATE_REFUSAL],
    examples: ['/task test 667'],
  },
  reconcile: {
    topic: 'board',
    summary: 'Drift recovery — align recorded state with the live board.',
    usage: '/task reconcile #N <accept-live|revert-to-recorded>',
    examples: ['/task reconcile 667 accept-live'],
  },
  board: {
    topic: 'board',
    summary:
      'Read the live Project-board `Status` for an issue (resolved via the bound projectId — never a guessed project number).',
    usage: '/task board [#N]',
    exitCodes: [{ code: 1, meaning: 'no target issue (no #N and no active bound issue)' }],
    examples: ['/task board', '/task board 900'],
  },
  'epic-reconcile': {
    topic: 'board',
    summary:
      "Record that an epic's Acceptance Criteria were reconciled against what its children delivered (stamps the epic-only marker `gateCodeComplete` requires to exit develop).",
    usage: '/task epic-reconcile [<N>]',
    exitCodes: [{ code: 1, meaning: 'no active/valid issue number, or the target is not an epic' }],
    examples: ['/task epic-reconcile', '/task epic-reconcile 883'],
  },
  'pull-next': {
    topic: 'board',
    summary: 'JIT child-pull: promote the next refine-state child of an epic (by rank) into Plan.',
    usage: '/task pull-next <epic#>',
    examples: ['/task pull-next 508'],
  },
  close: {
    topic: 'board',
    summary: 'Close the active or specified task (runs the pre-close gate).',
    usage: '/task close [#N] [--force] [--repair] [--answer yes|no|cancel]',
    aliases: ['end'],
    flags: [
      { flag: '--force', desc: 'close even if unchecked items remain' },
      {
        flag: '--repair',
        desc: 'replay the full atomic close from Done (timing flush, board fields, lifecycle boxes, audit rows) when a PR closing-reference auto-closed the issue and bypassed the gated chain',
      },
      { flag: '--answer <yes|no|cancel>', desc: 'pre-answer the dirty-tree close confirmation' },
    ],
    exitCodes: [{ code: 1, meaning: 'pre-close gate refused (unchecked boxes / dirty tree)' }],
    examples: ['/task close', '/task close 667 --answer yes', '/task close 708 --repair'],
  },
  'inflate-estimate': {
    topic: 'board',
    summary: 'Adjust Size/Estimate mid-flight and record the change on the board + comment.',
    usage: '/task inflate-estimate [#N] --size <S> --estimate <H> --reason "<text>"',
    flags: [
      { flag: '--size <S>', desc: 'new size' },
      { flag: '--estimate <H>', desc: 'new estimate (hours)' },
      { flag: '--reason "<text>"', desc: 'why it grew' },
    ],
    examples: ['/task inflate-estimate 667 --size XL --estimate 12 --reason "scope grew"'],
  },
  kind: {
    topic: 'board',
    summary: 'Set (or clear) the no-commit-lane issue kind (epic / sub-issue / solo).',
    usage: '/task kind [<N>] <kind>',
    examples: ['/task kind 667 epic'],
  },
  block: {
    topic: 'board',
    summary: 'Mark #N blocked by one or more other issues (label + board field + body marker).',
    usage: '/task block [#N] --by <M>[,<P>...]',
    flags: [{ flag: '--by <M>[,<P>...]', desc: 'blocking issue number(s)' }],
    examples: ['/task block 667 --by 700'],
  },
  unblock: {
    topic: 'board',
    summary: 'Clear a block (all blockers, or specific ones with --by).',
    usage: '/task unblock [#N] [--by <M>[,<P>...]]',
    flags: [
      { flag: '--by <M>[,<P>...]', desc: 'specific blocker(s) to clear', default: 'all blockers' },
    ],
    examples: ['/task unblock 667', '/task unblock 667 --by 700'],
  },
  supersede: {
    topic: 'board',
    summary: 'Mark a dead issue as superseded by another and close it out.',
    usage: '/task supersede <dead#> --by <superseding#>',
    flags: [{ flag: '--by <superseding#>', desc: 'the replacement issue (required)' }],
    examples: ['/task supersede 660 --by 667'],
  },
  auto: {
    topic: 'board',
    summary:
      'Toggle Full-Auto gate overrides for the session (disable plan→dev and/or review→done human gates).',
    usage: '/task auto <both|plan|review|off|reset>',
    flags: [
      { flag: 'both', desc: 'both gates OFF (full auto)' },
      { flag: 'plan', desc: 'only the plan→develop gate OFF' },
      { flag: 'review', desc: 'only the review→done gate OFF' },
      { flag: 'off / reset', desc: 'restore both human gates' },
    ],
    exitCodes: [{ code: 1, meaning: 'unknown choice' }],
    examples: ['/task auto both', '/task auto off'],
  },
  move: {
    topic: 'board',
    summary: 'Removed — use `/task promote` or `/task demote` (directional, one step at a time).',
    usage: '/task promote [#N]  |  /task demote [#N]',
    examples: ['/task promote 667'],
  },

  // ── evidence & proof ──────────────────────────────────────────────────────
  'ac-stamp': {
    topic: 'evidence',
    summary:
      "Run an AC's declared verifier and stamp its `aitm-ac-evidence` marker (refuses on non-zero exit).",
    usage: '/task ac-stamp "<acceptance criterion label>"',
    exitCodes: [{ code: 1, meaning: 'no matching AC, or the verifier command exited non-zero' }],
    examples: ['/task ac-stamp "Top-level /task help groups verbs by topic"'],
  },
  'dod-stamp': {
    topic: 'evidence',
    summary: "Run a Functional DoD item's verifier and stamp its `aitm-dod-evidence` marker.",
    usage: '/task dod-stamp <key>   (key ∈ { tests, lint, commits })',
    exitCodes: [{ code: 1, meaning: 'unknown key, or the verifier command exited non-zero' }],
    examples: ['/task dod-stamp tests', '/task dod-stamp lint'],
  },
  check: {
    topic: 'evidence',
    summary:
      'Deprecated alias of `ensureChecked` (no longer toggles) — tick a checkbox if its proof gate passes.',
    usage: '/task check <label>   (deprecated alias of ensureChecked)',
    aliases: ['ensureChecked'],
    flags: [
      {
        flag: '--allow-unverified-ticks',
        desc: 'honest override when an item genuinely cannot be stamped',
      },
    ],
    examples: ['/task check <label>   (deprecated — use /task ensureChecked "<label>")'],
  },
  ensureChecked: {
    topic: 'evidence',
    summary:
      'Ensure a checkbox is ticked (idempotent; never unticks). Refuses stampable items without evidence.',
    usage: '/task ensureChecked "<label>" [--allow-unverified-ticks]',
    aliases: ['check'],
    flags: [
      {
        flag: '--allow-unverified-ticks',
        desc: 'honest override for a genuinely unstampable item',
      },
    ],
    examples: ['/task ensureChecked "Deep dive complete"'],
  },
  ensureUnchecked: {
    topic: 'evidence',
    summary: 'Ensure a checkbox is unticked (idempotent; never ticks).',
    usage: '/task ensureUnchecked "<label>"',
    examples: ['/task ensureUnchecked "Passed final human review"'],
  },
  'evidence-markers': {
    topic: 'evidence',
    summary: 'Audit or backfill AC evidence markers against the Verification Commands.',
    usage: '/task evidence-markers <audit|backfill> #N [--map-file mappings.json] [--dry-run]',
    flags: [
      { flag: '--map-file <path>', desc: 'reviewed AC→command mapping (backfill)' },
      { flag: '--dry-run', desc: 'preview without writing' },
    ],
    examples: [
      '/task evidence-markers audit 667',
      '/task evidence-markers backfill 667 --map-file map.json --dry-run',
    ],
  },
  'commit-trace': {
    topic: 'evidence',
    summary: 'Create or update the canonical commit-trace comment from HEAD.',
    usage: '/task commit-trace [#N]',
    examples: ['/task commit-trace 667'],
  },
  'mirror-deep-dive': {
    topic: 'evidence',
    summary: 'Mirror a deep-dive analysis from an existing comment into the issue body.',
    usage: '/task mirror-deep-dive --from-comment <id|url> [#N]',
    flags: [
      { flag: '--from-comment <id|url>', desc: 'source comment (id, URL, or #issuecomment-<id>)' },
    ],
    examples: ['/task mirror-deep-dive --from-comment 4866618296 667'],
  },

  // ── creation & discovery ──────────────────────────────────────────────────
  new: {
    topic: 'discovery',
    summary: 'Create a new issue (via the sanctioned create-issue script) and start tracking it.',
    usage:
      '/task new [title] [--shape <epic|sub-issue|solo>] [--label <name>] [--assignee <who>] [--from-file <path>]',
    flags: [
      { flag: '--shape <epic|sub-issue|solo>', desc: 'issue shape' },
      { flag: '--title <text>', desc: 'issue title' },
      { flag: '--label <name>', desc: 'label(s) to apply' },
      { flag: '--assignee <who>', desc: 'assignee', default: 'config `assignee` (@me)' },
      { flag: '--from-file <path>', desc: 'body source file' },
    ],
    examples: ['/task new "Fix flaky timing test" --shape solo'],
  },
  discover: {
    topic: 'discovery',
    summary:
      'Open an untracked discovery bucket for pre-issue ideation / backlog item generation (distinct from `/task plan` Sprint-Planning).',
    usage: '/task discover',
    aliases: ['brainstorm'],
    examples: ['/task discover'],
  },
  'save-plan': {
    topic: 'discovery',
    summary:
      'Save a discovery plan markdown to docs/plans/ and stamp its path into the active bucket.',
    usage: '/task save-plan --from-file <path> [--title <override>]',
    flags: [
      { flag: '--from-file <path>', desc: 'plan markdown (required)' },
      { flag: '--title <override>', desc: 'title override' },
    ],
    exitCodes: [{ code: 1, meaning: 'no active discover state' }],
    examples: ['/task save-plan --from-file .tmp/plan/help-rework.md'],
  },
  'save-draft': {
    topic: 'discovery',
    summary: 'Autosave the in-progress discovery brainstorm to a tracked draft (safe to repeat).',
    usage: '/task save-draft --from-file <path> [--slug <s>] [--title <t>]',
    flags: [
      { flag: '--from-file <path>', desc: 'draft markdown (required)' },
      { flag: '--slug <s>', desc: 'draft filename slug' },
      { flag: '--title <t>', desc: 'draft title' },
    ],
    exitCodes: [{ code: 1, meaning: 'no active discover state' }],
    examples: ['/task save-draft --from-file .tmp/plan/draft.md'],
  },
  cancel: {
    topic: 'discovery',
    summary: 'Discard the active discovery bucket (no timing recorded).',
    usage: '/task cancel',
    examples: ['/task cancel'],
  },
  report: {
    topic: 'discovery',
    summary:
      'File a defect/feature report (optionally pre-filled from a machine-readable defect hint).',
    usage:
      '/task report [--kind defect|feature] [--summary <text>] [--from-hint <json>] [--draft] [--confirm]',
    flags: [
      { flag: '--kind <defect|feature>', desc: 'report kind' },
      { flag: '--summary <text>', desc: 'one-line summary' },
      { flag: '--from-hint <json>', desc: 'pre-fill from a defect-hint payload' },
      { flag: '--draft', desc: 'produce a draft without filing' },
      { flag: '--confirm', desc: 'skip the confirmation prompt' },
    ],
    examples: ['/task report --kind defect --summary "promote exit-4 message truncated"'],
  },
  'user-story': {
    topic: 'discovery',
    summary: 'Write the Connextra 3-line User Story onto an issue.',
    usage: '/task user-story [#N] --as "<role>" --want "<goal>" --so-that "<benefit>"',
    aliases: ['story'],
    flags: [
      { flag: '--as "<role>"', desc: 'the actor' },
      { flag: '--want "<goal>"', desc: 'the desired capability' },
      { flag: '--so-that "<benefit>"', desc: 'the value' },
    ],
    examples: [
      '/task user-story 667 --as "an operator" --want "per-verb help" --so-that "I skip reading source"',
    ],
  },

  // ── config, reporting & recovery ──────────────────────────────────────────
  config: {
    topic: 'meta',
    summary: 'List config values, set one, or run the interactive interview.',
    usage: '/task config [<key> <value> | init]',
    examples: ['/task config', '/task config assignee @me', '/task config init'],
  },
  migrate: {
    topic: 'meta',
    summary: 'Migrate repo issues into the selected/configured project.',
    usage: '/task migrate [--dry-run]',
    flags: [{ flag: '--dry-run', desc: 'preview without writing' }],
    examples: ['/task migrate --dry-run'],
  },
  fleet: {
    topic: 'meta',
    summary: 'Show all active tasks across parallel worktrees.',
    usage: '/task fleet',
    examples: ['/task fleet'],
  },
  log: {
    topic: 'meta',
    summary: 'Re-compute and write Engaged/Session Time for an issue.',
    usage: '/task log #N',
    examples: ['/task log 667'],
  },
  'chore-mode': {
    topic: 'meta',
    summary: 'Toggle chore-mode so unrelated edits are allowed past the source-edit gate.',
    usage: '/task chore-mode <on "<reason>"|off|status> [--resume]',
    flags: [{ flag: '--resume', desc: 'resume a suspended chore-mode session' }],
    examples: ['/task chore-mode on "fix lint across repo"', '/task chore-mode off'],
  },
  help: {
    topic: 'meta',
    summary: 'Show the top-level help, or a full per-verb reference with `/task help <verb>`.',
    usage: '/task help [<verb>]   (alias: /task ?)',
    aliases: ['?'],
    examples: ['/task help', '/task help refine', '/task refine --help'],
  },
};

// Kanban edges: the driving verb and the entry/exit gates per transition.
export const STATE_TRANSITIONS = [
  {
    from: 'Backlog',
    to: 'Refine',
    verb: 'refine',
    gate: 'sets Priority+Size+Estimate + rationale marker',
  },
  {
    from: 'Refine',
    to: 'Plan',
    verb: 'promote / plan',
    gate: 'Rank + ≥1 label + Start Time + Pickup Directive heading + every AC demonstrable (verifier or `invalid — non-demonstrable`)',
  },
  {
    from: 'Plan',
    to: 'Develop',
    verb: 'promote',
    gate: '`aitm-plan-approved` marker (`plan-approve`) + `### Planned Estimate` appendix (`plan-estimate`)',
  },
  {
    from: 'Develop',
    to: 'Test',
    verb: 'promote / test',
    gate: 'sandbox worktree runs the Verification Commands green',
  },
  { from: 'Test', to: 'Review', verb: 'review', gate: 'flush timing; move to Review' },
  {
    from: 'Review',
    to: 'Done',
    verb: 'approve / close',
    gate: 'pre-close gate: all pre-close boxes ticked + "Passed final human review" (Full-Auto: audit comment)',
  },
];

// Prose blocks rendered under the top-level help's gate/evidence section.
export const GATE_EVIDENCE_MODEL = [
  {
    heading: 'AC evidence',
    body: 'Each Acceptance Criterion binds a targeted verifier via `aitm-verified cmd="…"`. `/task ac-stamp "<label>"` RUNS that command and, on exit 0, writes the `aitm-ac-evidence:<key>` marker. `/task ensureChecked` refuses to tick a verifier-bound AC until that evidence marker exists.',
  },
  {
    heading: 'Checkbox-proof gate',
    body: 'A tick without proof is refused (`CheckboxProofMissingError`). Stamp first, tick second. Never bulk-check.',
  },
  {
    heading: 'Functional DoD',
    body: 'The Functional DoD items (tests / lint / commits) are stamped by `/task dod-stamp <key>` from a real verifier run. The derived keys `acs` and `checkboxes` are auto-stamped by `/task close` from the body itself.',
  },
  {
    heading: 'Full-Auto audit path',
    body: 'When human gates are disabled (`/task auto both`), the driving agent both flips the "Passed final human review" box AND posts an audit comment recording the autonomous approval — for plan-approve, approve, and close alike.',
  },
  {
    heading: 'Legitimate override hatches',
    body: '`--allow-unverified-ticks` (genuinely unstampable item), the `invalid — non-demonstrable` AC tag (honest opt-out from the demonstrable-AC gate), and `close --force` (close with unchecked items). These are explicit, grep-able, and never a license to fabricate evidence.',
  },
];
