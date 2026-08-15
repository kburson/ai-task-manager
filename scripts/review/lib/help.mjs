// @story #1266

const command = (definition) => Object.freeze(definition);

export const COMMANDS = Object.freeze({
  init: command({
    purpose: 'Create a new local co-review protocol or import one immutable reviewer round.',
    caller: 'The artifact owner or human coordinator, before either agent begins a new exchange.',
    prerequisites: [
      'Run in the Git worktree that contains the authoritative committed artifact.',
      'Choose a caller-owned Git-ignored runtime directory.',
      'Use distinct non-blank owner and reviewer identities and a positive review-turn budget.',
    ],
    usage:
      'npx aitm co-review init --dir <path> --artifact <repo-path> --owner <identity> --reviewer <identity> --max-turns <N> [--import-review <file> --review-of <commit>]',
    arguments: [
      '--dir <path>                 Ignored local protocol directory.',
      '--artifact <repo-path>       Authoritative tracked artifact.',
      '--owner <identity>           Identity allowed to act as owner.',
      '--reviewer <identity>        Distinct identity allowed to act as reviewer.',
      '--max-turns <N>              Positive reviewer-response limit.',
      '--import-review <file>       Existing immutable review; requires --review-of.',
      '--review-of <commit>         Exact commit reviewed by the imported review.',
    ],
    effects: [
      'Creates state.json and events.jsonl under --dir through the protocol mutex.',
      'An imported review is hashed and consumes reviewer turn 1.',
      'An imported review therefore requires --max-turns 2 or greater so the owner can answer it and receive another review.',
    ],
    validations: [
      'Runtime ignore/containment, role separation, budget, Git reachability, artifact blob equality, import pairing, and immutable path separation.',
    ],
    output: 'Prints initialized state, budget, integrity, and the next claim command.',
    exits: '0=initialized/help; 1=protocol or Git refusal; 2=invalid usage.',
    transition: 'Absent -> active owner round 1; imported R1 -> active owner round 2.',
    idempotency: 'An exact configuration/hash retry returns existing state without another event.',
    examples: [
      'npx aitm co-review init --dir .tmp/design-review --artifact docs/design.md --owner owner-agent --reviewer reviewer-agent --max-turns 6',
      'npx aitm co-review init --dir .tmp/1117-review --artifact docs/superpowers/specs/design.md --owner codex --reviewer claude --max-turns 6 --import-review .tmp/1117-review/r1-claude-review.md --review-of abc1234',
    ],
    recovery:
      'If initialization refuses, preserve every input, correct the named invariant, and rerun this exact command. Never delete a surviving lock without human inspection.',
    next: [
      'npx aitm co-review status --dir <path>',
      'npx aitm co-review claim --dir <path> --actor <owner-identity>',
    ],
  }),
  status: command({
    purpose: 'Recover the complete protocol state and verify recorded artifact integrity.',
    caller: 'Owner, reviewer, or human at any time, especially after context loss.',
    prerequisites: ['The --dir protocol must have been initialized.'],
    usage: 'npx aitm co-review status --dir <path> [--json]',
    arguments: [
      '--dir <path>                 Existing protocol directory.',
      '--json                       Emit machine-readable state and next action.',
    ],
    effects: ['Reads state, events, hashes, Git anchors, and lock metadata; writes nothing.'],
    validations: [
      'Schema, revision/budget arithmetic, recorded hashes, artifact/index/branch anchors.',
    ],
    output:
      'Prints lifecycle, actor, role, round, claim, Git ref, budget, integrity, last handoff, and next command.',
    exits:
      '0=integrity verified; 1=not initialized, malformed state, or integrity drift; 2=invalid usage.',
    transition: 'None.',
    idempotency: 'Always read-only and repeatable.',
    examples: [
      'npx aitm co-review status --dir .tmp/design-review',
      'npx aitm co-review status --dir .tmp/design-review --json',
    ],
    recovery:
      'Follow the printed next action. On drift or lock evidence, preserve files and escalate to the human.',
    next: [
      'claim when your configured role is available',
      'wait when the other role owns the turn',
      'stop when accepted',
    ],
  }),
  claim: command({
    purpose: 'Atomically claim the currently available owner or reviewer turn.',
    caller: 'Only the configured identity whose role is displayed as available by status.',
    prerequisites: [
      'Protocol is active, integrity is clean, and the caller identity maps to the current role.',
    ],
    usage: 'npx aitm co-review claim --dir <path> --actor <identity>',
    arguments: [
      '--dir <path>                 Existing protocol directory.',
      '--actor <identity>           Exact configured owner or reviewer identity.',
    ],
    effects: ['Acquires the mutex and records one claim event with actor/process/host/time.'],
    validations: [
      'Lifecycle, current role, configured identity, availability, integrity, and mutex ownership.',
    ],
    output: 'Prints claimed role/round and the role-specific handoff command.',
    exits:
      '0=claimed or exact idempotent retry; 1=role/state/integrity/lock refusal; 2=invalid usage.',
    transition: 'active available -> active claimed for the same role.',
    idempotency:
      'An exact retry by the recorded claimant returns state without a new revision/event.',
    examples: ['npx aitm co-review claim --dir .tmp/design-review --actor owner-agent'],
    recovery:
      'Wrong actor waits; other claimant stops; lock/drift evidence is preserved and escalated.',
    next: [
      'owner: revise/commit artifact, write response, then handoff',
      'reviewer: review exact owner commit, then handoff',
    ],
  }),
  wait: command({
    purpose: 'Wait briefly and read-only for one configured actor to become claimable.',
    caller: 'Owner or reviewer while the other role has the turn.',
    prerequisites: ['Protocol exists and --actor is a configured identity.'],
    usage: 'npx aitm co-review wait --dir <path> --actor <identity> [--timeout <seconds>]',
    arguments: [
      '--dir <path>                 Existing protocol directory.',
      '--actor <identity>           Configured identity waiting for its role.',
      '--timeout <seconds>          0..60 seconds; default 55.',
    ],
    effects: ['Polls status without a mutex and without writing.'],
    validations: ['Actor identity, timeout bounds, state schema, and terminal state.'],
    output: 'Prints available, terminal/intervention, or timeout state and next action.',
    exits:
      '0=available or terminal state observed; 1=protocol/integrity failure; 2=invalid usage; 3=bounded timeout.',
    transition: 'None.',
    idempotency: 'Always read-only and safely repeatable.',
    examples: [
      'npx aitm co-review wait --dir .tmp/design-review --actor reviewer-agent --timeout 55',
    ],
    recovery:
      'A timeout is not failure: report status and repeat another bounded wait if appropriate.',
    next: [
      'claim when available',
      'status after timeout',
      'stop/escalate on accepted/intervention-required',
    ],
  }),
  handoff: command({
    purpose: 'Validate and transfer one completed owner or reviewer turn.',
    caller: 'Only the configured identity holding the claimed current turn.',
    prerequisites: [
      'Owner: committed artifact plus immutable response; answers preceding review when present.',
      'Reviewer: immutable review of exact owner commit plus explicit accepted or changes-requested decision.',
    ],
    usage: 'npx aitm co-review handoff --dir <path> --actor <identity> <role-specific-options>',
    arguments: [
      'Owner: --response <file> --artifact <path> --commit <sha> [--answers <review>] --message <text>',
      'Reviewer: --review <file> --review-of <sha> --decision <accepted|changes-requested> [--summary <file>] --message <text>',
    ],
    effects: [
      'Hashes immutable exchange artifacts, appends one handoff event, clears the claim, and transfers/terminates state.',
      'A reviewer handoff consumes exactly one review turn.',
    ],
    validations: [
      'Role/claim/round, immutable path/hash separation, finding coverage, exact Git commit/artifact/index/branch, explicit decision, budget, and required interception summary.',
    ],
    output: 'Prints hashes, decision, used/max/remaining turns, lifecycle, and next command.',
    exits:
      '0=handoff complete; 1=protocol/Git/artifact refusal; 2=invalid or role-inapplicable flags.',
    transition:
      'owner -> reviewer; reviewer changes -> owner; reviewer accepted -> accepted; final reviewer changes -> intervention-required.',
    idempotency: 'A completed handoff is not replayed; status reveals the already-advanced state.',
    examples: [
      'npx aitm co-review handoff --dir .tmp/design-review --actor owner-agent --response .tmp/design-review/r2-owner-response.md --artifact docs/design.md --commit abc1234 --answers .tmp/design-review/r1-review.md --message "revision ready"',
      'npx aitm co-review handoff --dir .tmp/design-review --actor reviewer-agent --review .tmp/design-review/r3-review.md --review-of abc1234 --decision accepted --message "accepted"',
      'npx aitm co-review handoff --dir .tmp/design-review --actor reviewer-agent --review .tmp/design-review/r6-review.md --review-of abc1234 --decision changes-requested --summary .tmp/design-review/r6-human-summary.md --message "human decision requested"',
    ],
    recovery:
      'Do not edit a handed-off file. Correct only the named unaccepted input; on drift, branch change, or exhausted budget, stop and escalate.',
    next: [
      'status',
      'the displayed next-role claim',
      'continue only after intervention-required human approval',
    ],
  }),
  continue: command({
    purpose: 'Record human approval to add reviewer turns after mandatory interception.',
    caller: 'The human continuation authority, or an agent transcribing explicit human direction.',
    prerequisites: [
      'Lifecycle is intervention-required and the last review/summary remain intact.',
    ],
    usage:
      'npx aitm co-review continue --dir <path> --additional-turns <N> --approved-by <identity> [--focus <file>]',
    arguments: [
      '--dir <path>                 Existing protocol directory.',
      '--additional-turns <N>       Positive turns added to the existing maximum.',
      '--approved-by <identity>     Declared human provenance; not authentication.',
      '--focus <file>               Optional immutable human refocus instructions.',
    ],
    effects: [
      'Adds to max turns, preserves used turns, hashes optional focus, and returns an available owner turn.',
    ],
    validations: [
      'Intervention lifecycle, positive addition, approval identity, integrity, focus containment/separation, and mutex.',
    ],
    output: 'Prints approval/refocus provenance, cumulative budget, and owner claim command.',
    exits: '0=continued; 1=state/integrity/lock refusal; 2=invalid usage.',
    transition:
      'intervention-required -> active owner available; accepted remains terminal and cannot continue.',
    idempotency:
      'Not replayable after success because the protocol is no longer intervention-required.',
    examples: [
      'npx aitm co-review continue --dir .tmp/design-review --additional-turns 3 --approved-by kendrick',
      'npx aitm co-review continue --dir .tmp/design-review --additional-turns 2 --approved-by kendrick --focus .tmp/design-review/refocus.md',
    ],
    recovery:
      'If approval or focus is wrong, correct it before success. After success, do not rerun; use status.',
    next: [
      'npx aitm co-review claim --dir <path> --actor <owner-identity>',
      'npx aitm co-review status --dir <path>',
    ],
  }),
});

const HELP_TOKENS = new Set(['help', '--help', '-h', '?']);

export function helpRequest(argv = []) {
  if (argv.length === 1 && HELP_TOKENS.has(argv[0])) return { requested: true, command: null };
  if (argv.length === 2 && argv[0] === 'help' && COMMANDS[argv[1]]) {
    return { requested: true, command: argv[1] };
  }
  if (argv.length === 2 && COMMANDS[argv[0]] && HELP_TOKENS.has(argv[1])) {
    return { requested: true, command: argv[0] };
  }
  return { requested: false };
}

function list(label, values) {
  return [`${label}:`, ...values.map((value) => `  - ${value}`)];
}

function renderCommandHelp(name) {
  const entry = COMMANDS[name];
  if (!entry) return `co-review: unknown help command "${name}"\n`;
  return [
    `co-review ${name}`,
    '',
    `Purpose: ${entry.purpose}`,
    `Authorized caller: ${entry.caller}`,
    ...list('Prerequisites', entry.prerequisites),
    `Usage: ${entry.usage}`,
    ...list('Arguments', entry.arguments),
    ...list('Effects', entry.effects),
    ...list('Validations', entry.validations),
    `Output: ${entry.output}`,
    `Exit codes: ${entry.exits}`,
    `State transition: ${entry.transition}`,
    `Idempotency: ${entry.idempotency}`,
    ...list('Examples', entry.examples),
    `Failure recovery: ${entry.recovery}`,
    ...list('Next commands', entry.next),
    '',
    'Help is read-only: it performs no repository discovery, lock acquisition, network access, or write.',
    '',
  ].join('\n');
}

function renderTopHelp() {
  return `co-review — model-agnostic artifact owner / external reviewer handshake

Purpose: Coordinate immutable owner/reviewer artifact rounds through explicit acceptance or human interception.
Usage: npx aitm co-review <init|status|claim|wait|handoff|continue> [command options]
Audience: Artifact owners, external reviewers, and the human continuation authority.
Arguments: Run npx aitm co-review help <command> for exact required and optional flags.
Preconditions: Normal commands require a Git worktree, tracked artifact, and caller-selected ignored --dir; help requires nothing.
Effects: Normal mutations update only local protocol state under --dir; help, status, and wait do not mutate it.
Output: Recovery instructions, validated state, immutable hashes, budget arithmetic, and the exact next action.
Exit codes: 0=success/help; 1=runtime/integrity/protocol refusal; 2=invalid usage; 3=bounded wait timeout.
Examples: npx aitm co-review --help; npx aitm co-review status --dir .tmp/design-review
Related: npx aitm help; npx aitm verify-develop

WHAT
  Coordinates immutable owner responses and reviewer decisions around one authoritative committed artifact.

WHY
  Chat context is transient. Atomic turns, hashes, exact Git anchors, explicit decisions, and an event trail make every round recoverable and auditable.

WHO
  owner: exclusively edits/commits the artifact and answers every finding.
  reviewer: reads the exact handoff and writes an immutable accepted or changes-requested review.
  human: selects --max-turns and alone authorizes continuation/refocus after interception.
  Identities are local provenance, not cryptographic authentication.

WHEN
  init before review; status after context loss; claim before work; wait while the other role acts; handoff only after immutable artifacts are complete; continue only after intervention-required human approval; stop forever after accepted.

WHERE
  The authoritative artifact is a tracked repository path. --dir is a caller-selected Git-ignored local directory containing state.json, events.jsonl, round artifacts, summaries, optional refocus files, and a short-lived .co-review-lock/.

HOW
  Every mutation validates, acquires a non-stealing directory mutex, revalidates, hashes accepted artifacts with SHA-256, appends one event, and atomically replaces state. The owner handoff proves exact commit/artifact/index equality. The reviewer handoff proves no owner-side Git drift.

LIFECYCLE
  active owner -> active reviewer -> active owner ... -> accepted
                                     final changes-requested -> intervention-required
                                     human continue -> active owner
  accepted is terminal and wins over budget exhaustion on the last allowed review.

COMMANDS
  init       create a fresh protocol or import an existing review
  status     recover state, integrity, budget, and next action
  claim      atomically claim the available configured role
  wait       bounded read-only wait for an actor's role
  handoff    validate owner or reviewer immutable artifacts and transfer the turn
  continue   add human-approved turns after mandatory interception
  Run: npx aitm co-review help <command>

OPTION GLOSSARY
  --dir local ignored protocol directory; --artifact authoritative tracked file;
  --owner/--reviewer configured identities; --actor exact acting identity;
  --max-turns total reviewer responses, including imported R1;
  --decision accepted|changes-requested; --summary required on final requested-changes turn;
  --additional-turns additive budget; --approved-by declared human provenance;
  --focus optional immutable human refocus file; --timeout bounded 0..60 seconds.

ARTIFACT FORMAT
  Reviewer findings: [finding:F-001]
  Owner responses:    [finding:F-001] [disposition:accepted]
  Dispositions: accepted | accepted-with-modification | rejected | deferred
  Rejected also uses [evidence:<repo-path-or-command>].
  Deferred also uses [follow-up:#N] and [safe-boundary:<text>].
  A handed-off review, response, summary, or focus file is immutable.

EXIT CODES
  0 success or help; 1 runtime/integrity/protocol refusal; 2 invalid usage; 3 bounded wait timeout.

FRESH EXAMPLE
  npx aitm co-review init --dir .tmp/design-review --artifact docs/design.md --owner owner-agent --reviewer reviewer-agent --max-turns 6
  npx aitm co-review claim --dir .tmp/design-review --actor owner-agent
  # Owner commits docs/design.md and writes .tmp/design-review/r1-owner-response.md
  npx aitm co-review handoff --dir <path> --actor <owner-identity> --response <response-file> --artifact <artifact-path> --commit <sha> --message <text>
  npx aitm co-review claim --dir <path> --actor <reviewer-identity>
  # Reviewer writes an immutable review of that exact SHA
  npx aitm co-review handoff --dir <path> --actor <reviewer-identity> --review <review-file> --review-of <sha> --decision <accepted|changes-requested> --message <text>
  # On changes-requested, the owner claims, revises, answers the exact review with --answers, and repeats.

IMPORTED R1 EXAMPLE
  npx aitm co-review init --dir .tmp/1117-review --artifact docs/design.md --owner codex --reviewer claude --max-turns 6 --import-review .tmp/1117-review/r1-claude-review.md --review-of <sha>
  The imported review consumes turn 1; used=1, max=6, remaining=5.
  # If the last allowed review requests changes, the reviewer supplies --summary and both agents stop.
  npx aitm co-review continue --dir <path> --additional-turns <N> --approved-by <human-identity> [--focus <file>]
  # Only explicit human approval may run continue; it adds turns and returns control to the owner.

COMMON REFUSALS
  Wrong role/claim, malformed state, missing/drifted immutable artifact, dirty index/artifact, branch/commit drift, incomplete dispositions, implicit decision, exhausted budget without summary, or surviving lock. Every refusal leaves the attempted transition unapplied and prints a recovery action.

CONTEXT-RESET CHECKLIST
  1. Run: npx aitm co-review status --dir <path>
  2. Confirm the configured artifact, exact commit, role identity, lifecycle, and budget.
  3. If available, claim with the displayed actor command.
  4. If claimed by you, complete only your role's immutable artifacts and handoff.
  5. If intervention-required, stop and ask the human; do not invent approval.
  6. If accepted, stop; the protocol is terminal.
  7. If locked or drifted, preserve files and escalate with the printed diagnostics.

Help is safe before init and performs no repository discovery, lock acquisition, network access, or write.
`;
}

export function renderHelp(commandName = null) {
  return commandName ? renderCommandHelp(commandName) : renderTopHelp();
}
