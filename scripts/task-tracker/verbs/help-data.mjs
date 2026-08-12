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
    usage: '/task #N [--confirm-relocation]',
    flags: [
      {
        flag: '--confirm-relocation',
        desc: 'explicitly accept and append a changed issue-resident worktree location',
      },
    ],
    examples: ['/task #667'],
  },
  start: {
    topic: 'lifecycle',
    summary: 'Bind to issue #N and start the timer (same path as `/task #N`).',
    usage: '/task start <N> [--confirm-relocation]',
    flags: [
      {
        flag: '--confirm-relocation',
        desc: 'explicitly accept and append a changed issue-resident worktree location',
      },
    ],
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
    usage: '/task resume [#N] ["reason"] [--confirm-relocation]',
    flags: [
      {
        flag: '--confirm-relocation',
        desc: 'explicitly accept and append a changed issue-resident worktree location',
      },
    ],
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
  'adopt-github-records': {
    topic: 'meta',
    summary: 'Audit or adopt one legacy issue into GitHub-native authority records.',
    usage: '/task adopt-github-records <N> [--apply|--rollback|--repair]',
    flags: [
      { flag: '--apply', desc: 'perform adoption after exact parity audit' },
      { flag: '--rollback', desc: 'remove the directory only before divergent authority exists' },
      { flag: '--repair', desc: 'repair only from complete validated singleton records' },
      { flag: '--grant-id <id>', desc: 'current coordinator grant ID required by --apply' },
      { flag: '--authority-epoch <n>', desc: 'current coordinator epoch required by --apply' },
      { flag: '--actor <id>', desc: 'coordinator actor identity required by --apply' },
    ],
    examples: ['/task adopt-github-records 1086', '/task adopt-github-records 1086 --apply'],
  },

  // ── board / state machine ─────────────────────────────────────────────────
  promote: {
    topic: 'board',
    summary:
      'Advance one forward state (Backlog→Refine→Ready for Planning→Plan→Develop→Test→Review→Done).',
    usage: '/task promote #N',
    aliases: ['next'],
    exitCodes: [GATE_REFUSAL],
    examples: ['/task promote 667', '/task next 667'],
  },
  demote: {
    topic: 'board',
    summary: 'Return one state backward (from Test or Review back to Develop).',
    usage: '/task demote #N [--rework "<reason>"]',
    flags: [
      {
        flag: '--rework "<reason>"',
        desc: 'required provenance when demoting Review to Develop; --rework=<reason> is also accepted',
      },
    ],
    exitCodes: [GATE_REFUSAL],
    examples: ['/task demote 667'],
  },
  park: {
    topic: 'board',
    summary:
      'Return a Refine or Plan issue to Backlog (premise falsified, deprioritized); keeps Priority/Size/Estimate.',
    usage: '/task park <N> --reason "<text>"',
    flags: [{ flag: '--reason <text>', desc: 'why this issue is returning to Backlog (required)' }],
    exitCodes: [
      {
        code: 4,
        meaning: 'drift, source state, missing reason, or transition gate refused; state unchanged',
      },
    ],
    examples: ['/task park 848 --reason "premise falsified after refine review"'],
  },
  refine: {
    topic: 'board',
    summary: 'Atomic pre-Refine entry: set fields, then move Backlog→Refine.',
    usage:
      '/task refine <N> --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2> --reason <text>',
    flags: [
      { flag: '--size <XS|S|M|L|XL>', desc: 'T-shirt size (required)' },
      { flag: '--estimate <hours>', desc: 'estimate in hours (required)' },
      { flag: '--priority <p0|p1|p2>', desc: 'priority (required)' },
      { flag: '--reason <text>', desc: 'refinement rationale (required)' },
      { flag: '--rank <n>', desc: 'optional board Rank' },
      {
        flag: '--labels <name[,name...]>',
        desc: 'optional comma-separated labels to add',
      },
    ],
    exitCodes: [{ code: 2, meaning: 'a required flag is missing or malformed' }, GATE_REFUSAL],
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
      'Record plan approval with durable human or Full-Auto provenance (stamps the `aitm-plan-approved` marker Plan→Develop needs).',
    usage: '/task plan-approve #N',
    exitCodes: [{ code: 3, meaning: 'issue is not in Plan' }],
    examples: ['/task plan-approve 667'],
  },
  'plan-estimate': {
    topic: 'board',
    summary: 'Converge the detailed human Plan estimate and publish a separate AI forecast.',
    usage:
      '/task plan-estimate [#N] --evidence-file <path> | --compatibility-mode --planned-size <S> --planned-estimate <H>',
    flags: [
      { flag: '--evidence-file <path>', desc: 'aitm.plan-estimation-input/v1 JSON evidence' },
      {
        flag: '--adopt-legacy-baseline',
        desc: 'one-time Develop recovery when existing board/body/history exactly match v1 Plan',
      },
      { flag: '--compatibility-mode', desc: 'explicitly use the legacy appendix-only path' },
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
      '/task plan-estimate 667 --evidence-file .tmp/plan/667-estimation.json',
      '/task plan-estimate 667 --evidence-file .tmp/plan/667-estimation.json --adopt-legacy-baseline',
      '/task plan-estimate 667 --compatibility-mode --planned-size L --planned-estimate 6 --rationale "legacy issue"',
    ],
  },
  'decompose-check': {
    topic: 'board',
    summary: 'Classify whether a planned issue is atomic or requires decomposition.',
    usage: '/task decompose-check <issue> [--plan <path>] [--json]',
    flags: [
      { flag: '--plan <path>', desc: 'override the plan linked from Plan Metadata' },
      { flag: '--json', desc: 'emit the structured classification result' },
    ],
    exitCodes: [{ code: 3, meaning: 'the issue must split and has no valid waiver' }],
    examples: ['/task decompose-check 1052 --json'],
  },
  'split-plan': {
    topic: 'discovery',
    summary: 'Draft or create sanctioned child issues from numbered plan sections.',
    usage: '/task split-plan <issue> (--dry-run|--confirm) [--plan <path>] [--json]',
    flags: [
      { flag: '--dry-run', desc: 'preflight every child without creating issues' },
      { flag: '--confirm', desc: 'preflight all children, then create them in plan order' },
      { flag: '--plan <path>', desc: 'override the plan linked from Plan Metadata' },
      { flag: '--json', desc: 'emit the structured proposal or creation result' },
    ],
    exitCodes: [{ code: 6, meaning: 'partial success; at least one child was created' }],
    examples: ['/task split-plan 1052 --dry-run', '/task split-plan 1052 --confirm'],
  },
  approve: {
    topic: 'board',
    summary:
      'Record final review approval (Review→Done gate). In Full-Auto, pair with an audit comment.',
    usage: '/task approve #N [--human]',
    flags: [
      {
        flag: '--human',
        desc: 'record an explicit human approval instead of Full-Auto provenance',
      },
    ],
    examples: ['/task approve 667', '/task approve 667 --human'],
  },
  review: {
    topic: 'board',
    summary: 'Move an issue through Test to Review, flush timing, and pause.',
    usage: '/task review #N [--duration-minutes N --words N] [--probe "command"]',
    flags: [
      { flag: '--duration-minutes <N>', desc: 'agent-reported active minutes (skips JSONL read)' },
      { flag: '--words <N>', desc: 'agent-reported word delta' },
      {
        flag: '--probe "<command>"',
        desc: 'in Review, run one repeatable allowlisted focused probe and record separate evidence',
      },
    ],
    exitCodes: [GATE_REFUSAL],
    examples: [
      '/task review 667',
      '/task review 667 --duration-minutes 45 --words 1200',
      '/task review 667 --probe "node --test path/to/focused.test.mjs"',
    ],
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
      'Develop→Test verification — finalizes Develop lint/format evidence, then runs Test-owned commands in an isolated worktree.',
    usage: '/task test #N',
    exitCodes: [
      { code: 1, meaning: 'missing target or test setup/runtime failure' },
      { code: 3, meaning: 'verification command or post-verification state update failed' },
      { code: 4, meaning: 'no Verification Commands exist or the transition gate refused' },
      { code: 5, meaning: 'the delegated board transition is invalid' },
      { code: 6, meaning: 'the delegated evidence-contiguity gate refused' },
      { code: 7, meaning: 'the delegated issue mutation lock is held' },
    ],
    examples: ['/task test 667'],
  },
  reconcile: {
    topic: 'board',
    summary:
      'Drift recovery — align recorded state with the live board or restore the saga-verified sentinel.',
    usage: '/task reconcile <accept-live|revert-to-recorded|revert-to-sentinel|backfill> #N',
    examples: [
      '/task reconcile accept-live 667',
      '/task reconcile revert-to-sentinel 667',
      '/task reconcile backfill 667',
    ],
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
      "Record that an epic's Acceptance Criteria were reconciled against what its children delivered and optionally attach its existing deliverable comment.",
    usage: '/task epic-reconcile [<N>] [--deliverable-comment <id|url>]',
    flags: [
      {
        flag: '--deliverable-comment <id|url>',
        desc: 'validate and record an existing comment on this epic as its no-commit deliverable',
      },
    ],
    exitCodes: [
      {
        code: 1,
        meaning:
          'no active/valid issue number, target is not an epic, or deliverable provenance is invalid',
      },
    ],
    examples: ['/task epic-reconcile', '/task epic-reconcile 883 --deliverable-comment 4866618296'],
  },
  'pull-next': {
    topic: 'board',
    summary: 'JIT child-pull: promote the next refine-state child of an epic (by rank) into Plan.',
    usage: '/task pull-next <epic#>',
    exitCodes: [
      { code: 4, meaning: 'the selected child failed a Refine-to-Plan gate' },
      { code: 5, meaning: 'the selected child no longer has a legal Refine-to-Plan edge' },
      { code: 6, meaning: 'the selected child is missing required entry-marker history' },
      {
        code: 7,
        meaning: 'the child mutation lock is held or the completed move could not be verified',
      },
    ],
    examples: ['/task pull-next 508'],
  },
  close: {
    topic: 'board',
    summary: 'Close the active or specified task (runs the pre-close gate).',
    usage:
      '/task close [#N] [--force] [--repair] [--answer yes|no|cancel] [--as duplicate|not-planned] [--of <N>]',
    aliases: ['end'],
    flags: [
      { flag: '--force', desc: 'close even if unchecked items remain' },
      {
        flag: '--repair',
        desc: 'replay the full atomic close from Done (timing flush, board fields, lifecycle boxes, audit rows) when a PR closing-reference auto-closed the issue and bypassed the gated chain',
      },
      { flag: '--answer <yes|no|cancel>', desc: 'pre-answer the dirty-tree close confirmation' },
      {
        flag: '--as <duplicate|not-planned>',
        desc: 'close with a non-Done disposition instead of the delivery gate',
      },
      { flag: '--of <N>', desc: 'canonical issue for the duplicate disposition' },
    ],
    exitCodes: [{ code: 1, meaning: 'pre-close gate refused (unchecked boxes / dirty tree)' }],
    examples: ['/task close', '/task close 667 --answer yes', '/task close 708 --repair'],
  },
  'inflate-estimate': {
    topic: 'board',
    summary: 'Adjust Size/Estimate mid-flight and record the change on the board + comment.',
    usage:
      '/task inflate-estimate <N> --size <S> --estimate <H> --reason "<text>" --item "<work (~effort)>" [--item "<work (~effort)>" ...]',
    flags: [
      { flag: '--size <S>', desc: 'new size' },
      { flag: '--estimate <H>', desc: 'new estimate (hours)' },
      { flag: '--reason "<text>"', desc: 'why it grew' },
      { flag: '--item "<work (~effort)>"', desc: 'discovered work item (required, repeatable)' },
    ],
    examples: [
      '/task inflate-estimate 667 --size XL --estimate 12 --reason "scope grew" --item "parser audit (~2h)"',
    ],
  },
  kind: {
    topic: 'board',
    summary: 'Set the issue kind, or clear its marker by selecting the default code lane.',
    usage: '/task kind [<N>] <code|docs-only|audit|research|spike|epic>',
    examples: ['/task kind 667 epic', '/task kind 667 code'],
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
    exitCodes: [
      { code: 2, meaning: 'mode is missing or unknown' },
      { code: 3, meaning: 'no active session exists for the override' },
    ],
    examples: ['/task auto both', '/task auto off'],
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
    usage:
      '/task check ["<label>" | --label "<label>" ... | --labels-file <path>] [--allow-unverified-ticks]   (deprecated alias of ensureChecked)',
    aliases: ['ensureChecked'],
    flags: [
      {
        flag: '--allow-unverified-ticks',
        desc: 'honest override when an item genuinely cannot be stamped',
      },
      { flag: '--label "<label>"', desc: 'checkbox label for repeatable batch mode' },
      { flag: '--labels-file <path>', desc: 'newline-delimited checkbox labels for batch mode' },
    ],
    examples: ['/task check <label>   (deprecated — use /task ensureChecked "<label>")'],
  },
  ensureChecked: {
    topic: 'evidence',
    summary:
      'Ensure a checkbox is ticked (idempotent; never unticks). Refuses stampable items without evidence.',
    usage:
      '/task ensureChecked ["<label>" | --label "<label>" ... | --labels-file <path>] [--allow-unverified-ticks]',
    aliases: ['check'],
    flags: [
      {
        flag: '--allow-unverified-ticks',
        desc: 'honest override for a genuinely unstampable item',
      },
      { flag: '--label "<label>"', desc: 'checkbox label for repeatable batch mode' },
      { flag: '--labels-file <path>', desc: 'newline-delimited checkbox labels for batch mode' },
    ],
    examples: ['/task ensureChecked "Deep dive complete"'],
  },
  ensureUnchecked: {
    topic: 'evidence',
    summary: 'Ensure a checkbox is unticked (idempotent; never ticks).',
    usage: '/task ensureUnchecked ["<label>" | --label "<label>" ... | --labels-file <path>]',
    flags: [
      { flag: '--label "<label>"', desc: 'checkbox label for repeatable batch mode' },
      { flag: '--labels-file <path>', desc: 'newline-delimited checkbox labels for batch mode' },
    ],
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
  'issue-body': {
    topic: 'evidence',
    summary: 'Apply one governed, declarative fresh-base issue-body operation from a JSON file.',
    usage: '/task issue-body #N --operation-file <path>',
    flags: [
      {
        flag: '--operation-file <path>',
        desc: 'aitm.issue-body-operation/v1 exact or named-section replacement',
      },
    ],
    examples: ['/task issue-body 667 --operation-file .tmp/gh/667-body-operation.json'],
  },
  comment: {
    topic: 'evidence',
    summary: 'Idempotently create or update one marker-owned issue comment from a file.',
    usage: '/task comment #N --key <stable-key> --body-file <path>',
    flags: [
      { flag: '--key <stable-key>', desc: 'stable lowercase ownership key' },
      { flag: '--body-file <path>', desc: 'markdown comment body without an ownership marker' },
    ],
    examples: ['/task comment 667 --key plan.audit-v1 --body-file .tmp/gh/667-audit.md'],
  },
  'commit-trace': {
    topic: 'evidence',
    summary: 'Create or update the canonical commit-trace comment from HEAD.',
    usage: '/task commit-trace [#N]',
    examples: ['/task commit-trace 667'],
  },
  'mirror-deep-dive': {
    topic: 'evidence',
    summary:
      'Mirror a deep-dive analysis from an existing comment or repair one legacy block placement.',
    usage: '/task mirror-deep-dive (--from-comment <id|url> | --repair-placement) [#N]',
    flags: [
      { flag: '--from-comment <id|url>', desc: 'source comment (id, URL, or #issuecomment-<id>)' },
      {
        flag: '--repair-placement',
        desc: 'relocate one existing block after Pickup without fetching a comment',
      },
    ],
    examples: [
      '/task mirror-deep-dive --from-comment 4866618296 667',
      '/task mirror-deep-dive --repair-placement 667',
    ],
  },

  // ── creation & discovery ──────────────────────────────────────────────────
  new: {
    topic: 'discovery',
    summary: 'Create a new issue (via the sanctioned create-issue script) and start tracking it.',
    usage:
      '/task new [title|docs/plans/<file>.md] [--kind <code|docs-only|audit|research|spike|epic>]',
    flags: [
      {
        flag: '--kind <code|docs-only|audit|research|spike|epic>',
        desc: 'optional issue kind passed to sanctioned creation',
      },
    ],
    examples: ['/task new "Fix flaky timing test" --kind code'],
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
      { flag: '--as-a "<role>"', desc: 'alias of --as' },
      { flag: '--want "<goal>"', desc: 'the desired capability' },
      { flag: '--i-want "<goal>"', desc: 'alias of --want' },
      { flag: '--so-that "<benefit>"', desc: 'the value' },
      { flag: '--so "<benefit>"', desc: 'alias of --so-that' },
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
    usage: '/task migrate [--dry-run] [--skip-init] [--closed|--all] [--keep-retired]',
    flags: [
      { flag: '--dry-run', desc: 'preview without writing' },
      { flag: '--skip-init', desc: 'skip initialization checks or setup' },
      { flag: '--closed', desc: 'include closed issues' },
      { flag: '--all', desc: 'include both open and closed issues' },
      { flag: '--keep-retired', desc: 'retain retired Project fields' },
    ],
    examples: ['/task migrate --dry-run', '/task migrate --all --keep-retired'],
  },
  fleet: {
    topic: 'meta',
    summary: 'Show active tasks across worktrees, or prune stale fleet registrations.',
    usage: '/task fleet [prune [--dry-run]]',
    flags: [
      { flag: '--dry-run', desc: 'preview stale registrations without rewriting the registry' },
    ],
    examples: ['/task fleet', '/task fleet prune --dry-run', '/task fleet prune'],
  },
  log: {
    topic: 'meta',
    summary: 'Re-compute and write Engaged/Session/Review/Plan for an issue.',
    usage: '/task log #N',
    examples: ['/task log 667'],
  },
  'chore-mode': {
    topic: 'meta',
    summary: 'Toggle chore-mode so unrelated edits are allowed past the source-edit gate.',
    usage: '/task chore-mode <on ["reason"]|off|status> [--resume]',
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
    gate: 'Rank + ≥1 label + Start Time + Pickup Directive heading + every AC demonstrable (verifier or `<!-- aitm-non-demonstrable -->`)',
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
    body: 'Functional DoD checkboxes are backed by stage-owned evidence. Develop finalization records exact-SHA lint/format evidence, Test reuses that receipt while running sandbox-owned test commands, and derived keys `acs` and `checkboxes` are auto-stamped from the body itself.',
  },
  {
    heading: 'Full-Auto audit path',
    body: 'When human gates are disabled (`/task auto both`), the driving agent both flips the "Passed final human review" box AND posts an audit comment recording the autonomous approval — for plan-approve, approve, and close alike.',
  },
  {
    heading: 'Legitimate override hatches',
    body: '`--allow-unverified-ticks` (genuinely unstampable item), the `<!-- aitm-non-demonstrable -->` AC marker (honest opt-out from the demonstrable-AC gate), and `close --force` (close with unchecked items). These are explicit, grep-able, and never a license to fabricate evidence.',
  },
];
