# Issue 1830: consistent mutation guards for governed worktrees

## Document control

- Revision: r3.
- Status: implementation plan; SAR verdicts are recorded in the review responses.
- Issue: https://github.com/kburson/ai-task-manager/issues/1830.
- Source baseline: `32fc3a04b0cc3f738902aea0f1e6430e4888d579`.
- Previous revision: [r2](../reviews/1830/plan/SAR/plan.r2.md).
- Revision-triggering review: [r3](../reviews/1830/plan/SAR/review-response.r3.md).
- Revision history: r1 closes SAR-01 through SAR-04 by defining command eligibility,
  artifact eligibility, Plan edit/commit permissions, and their verification seams.
  Revision r2 closes SAR-05 through SAR-07 with target ancestry, configuration
  constraints, and a canonical Story Intent section. Revision r3 closes SAR-08
  and SAR-09 by clarifying new-path ancestry and invocation input contracts.

## Scope

Repair the activity, source-edit, and Bash guard paths for issue 1830. Resolve
the worktree from the actual tool invocation, give equivalent Git commands the
same guarded interpretation, distinguish staged documentation from source, and
accept one optional patch terminator line ending. Retain ownership, lifecycle,
installed-guard, and unsafe-target protection. Do not modify ai-peer-review.

## Story Intent

- **Beneficiary:** repository maintainer governing work in linked worktrees
- **Capability:** consistently authorize planning documents and review evidence in their actual worktree
- **Need:** current guards resolve different checkouts and classify equivalent commits differently
- **Value or failure prevented:** prevent false refusals of legitimate planning work and alternate-command lifecycle bypasses

## Evidence and existing seams

The reviewed baseline has three separate command interpretations:
`activity-policy.mjs::classifyBash`, `bash-worktree-guard.mjs`, and the ownership
parser nested in `bash-guard.mjs`. The activity and Bash roots start from process
cwd; source-edit can prefer an environment root over payload cwd and uses the
global active pointer. The binding resolver substitutes a live branch for the
recorded branch; its comparator checks only the path. Source-edit unconditionally
refuses Plan edits even when the activity matrix permits documentation.

Current-code probes establish that Git aliases and nested shells can remain
`READ_*`, and that `docs/run.mjs` and `docs/package.json` classify as `WRITE_DOCS`.
These are evidence of the old behavior, not passing tests for the proposed repair.

## Shared invocation and binding context

Add a focused shared helper under `scripts/task-tracker/lib/`, consumed by all
three guards. Keep shell parsing, physical identity reads, and policy decisions
separate so each has testable pure or injected-I/O boundaries.

Resolve the tool working directory from `tool_input.workdir`, then
`tool_input.cwd`, then payload `cwd`, then process cwd. Resolve relative paths
against an explicit base: payload `cwd` is resolved against process cwd;
a relative tool directory is resolved against that payload directory, or process
cwd only when payload `cwd` is absent. The first supplied tool directory field
wins in the order above; invalid supplied values (empty, non-string, inaccessible,
or not a directory) refuse the new allowance instead of falling back. Preserve
Git's sequential `-C` semantics from the resulting invocation directory.
An environment project root may assist binding discovery but cannot replace an
explicit tool directory. Resolve physical Git root and branch before loading
policy, issue state, ownership configuration, or the index.

Compare that observed identity with the current session's recorded issue,
physical worktree path, and recorded branch. Do not replace the expected branch
with a fresh branch read. Missing, stale, conflicting, or unavailable binding
refuses the new Plan allowance. A different session's global active pointer
cannot grant authority to this session. Detached HEAD cannot satisfy a recorded
named branch. Preserve existing governed relocation as the recovery path.

Do not interpret the foreign-worktree override as permission for a Plan document
mutation. Leave existing task-verb override semantics intact outside this new
allowance. Read-only inspection remains available.

Retain both lexical and physical mutation target paths. For existing files,
resolve ancestry without forgetting whether the requested path traversed an
installed package; for new files, resolve the nearest existing parent and append
only validated remaining components. Require physical containment in the owned
worktree and reject either lexical or physical installed-guard ancestry. Apply
these checks to every edit and patch destination, including source/destination
of moves and deleted paths. New trailing directory components may be absent
when their nearest existing ancestor is a trusted directory and every suffix
component is validated. Broken links, existing non-directory intermediate
components, inaccessible ancestors, and resolution errors must not receive the
Plan allowance. This ancestry observation is a preflight snapshot; it does not
lock the filesystem against a later concurrent symlink change. Reject target traversal rather than silently
normalizing it into another path. Git index paths are repository-tree identities,
so classify their staged modes and statuses directly, not by following possibly
different working-tree symlinks.

## Git discovery and supported execution

Share one bounded discovery result across activity, worktree, and ownership
consumers. The result distinguishes read-only, known mutation, and unsupported
mutation context; parser failure never becomes `READ_*`.

Recognize literal Git executable invocations and supported `command`/`env`
wrappers, sequential `-C`, separate or attached `-c`, and known global option
arity. Resolve repository-local and inline aliases from the effective worktree.
Discover literal nested `sh`/`bash`/`zsh` invocations for mutation enforcement.
Bound alias and shell recursion and refuse cycles, opaque shell aliases,
dynamic command substitutions, and exhaustion when the invocation is a
commit-capable command. Quoted text printed by `echo` is not an executed Git call.

The Plan documentation allowance accepts only a single directly inspectable Git
commit invocation with literal configuration and a supported wrapper. Alias
or shell discovery must still enforce source-commit lifecycle checks, but those
forms do not receive the new documentation allowance. Compound commands,
pipelines, redirections, background execution, multiple commits, and preceding
cwd/index/config mutations must be split into separate tool invocations before
a Plan documentation commit can be considered.

Repository/index redirects such as `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`,
`--git-dir`, and `--work-tree` cannot receive the Plan allowance unless the shared
context proves they select the same ordinary worktree and index. Unsupported
or conflicting selectors refuse; do not inspect one index and execute another.
Options that select paths, include unstaged changes, amend prior commits, or
reuse an uninspectable message do not receive the Plan allowance. Preserve the
existing ownership inspection of literal message, message-file, and inherited
message forms, using each commit's effective directory.

For the Plan allowance, the initial command-level `-c` allowlist is `user.name`,
`user.email`, and `color.ui`, with literal values and normal Git option parsing.
Other keys, including hooks, aliases, repository selection, filters, and external
tools, refuse this allowance. Harmless `--no-pager` remains supported. Do not
execute alias/config payloads while discovering a command. Treat `--config-env`
and ambient or command-supplied `GIT_CONFIG_*` injection as unsupported for the
Plan allowance. Observe environment and configuration as supplied; never clear
selectors merely to manufacture a matching inspection result.

Existing repository/global configuration and installed hooks remain the normal
trusted Git execution environment. This repair neither installs/disables hooks
nor promises to constrain arbitrary programs a maintainer already configured.
The snapshot limitation described below includes such pre-existing hooks and concurrent
writers; supported-command parity is the claim. Any stronger execution-time
atomic guarantee requires a separate design, not a false checkmark in this issue.

## Staged artifact eligibility

Introduce a commit-specific predicate instead of reusing `classifyEdit` as the
permission proof. For the initial repair, eligible documents and textual review
responses are regular, non-executable `.md` files below `docs/` or
`.claude/plans/`. Other evidence formats remain conservatively `COMMIT_CODE`;
adding an evidence format later requires a named contract and tests rather
than broadening the existing `docs/**` glob. Root agent instructions, runtime
configuration, installed guard trees, and machine-local state are not eligible.

Read NUL-delimited staged change status and Git modes. Evaluate additions,
modifications, deletions, and both sides of rename/copy records. Every relevant
path and mode must qualify; a code-to-Markdown rename or source deletion keeps
the whole commit `COMMIT_CODE`. Symlinks, gitlinks, executable modes, conflicts,
unknown statuses, and an empty inventory cannot establish `COMMIT_DOCS`.
Do not alter the index while inspecting it. An unavailable/malformed index or
unresolved mutation context is a refusal, not a successful source classification.
Known mixed/source inventories retain `COMMIT_CODE` and existing Develop rules.

A PreToolUse index observation is a snapshot, not an atomic lock across shell
execution. Reject the compound forms above and detect changes across the local
inspection sequence. This repair does not claim to defend against an independent
process rewriting the index after the hook returns; a commit-time transaction
would require a separate execution-boundary design.

## Guard ordering and lifecycle matrix

For the new Plan document path, establish parseable targets and physical context,
then apply installed-guard and scope checks, exact session binding, fresh
singleton ownership and state, artifact eligibility, and the activity decision.
Installed-guard rejection precedes scratch and chore allowances. A policy read
or ownership read failure refuses this allowance. Never claim an unassigned
issue from inside a mutation hook.

Require exactly one assignee matching the authenticated owner, independently
of the generic early-state `ownershipDecision().ok`; that helper accepts
`team-unassigned`. Keep the bound issue as authority even if a commit message
has no issue token or references another issue. Preserve the existing attribution
inspection and refuse conflicting issue attribution for this Plan allowance.

| State                               | Eligible document edit                                     | COMMIT_DOCS                                | Source/mixed commit        |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | -------------------------- |
| Backlog, Refine, Ready for Planning | Existing restrictions                                      | Refuse                                     | Refuse                     |
| Plan                                | Allow only with the new complete identity/ownership checks | Same checks; single inspectable invocation | Refuse                     |
| Develop                             | Existing edit/deep-dive rules                              | Allow with existing commit authority       | Existing COMMIT_CODE rules |
| Test                                | Existing restrictions                                      | Refuse                                     | Refuse                     |
| Review                              | Preserve existing documentation-edit behavior              | Refuse; rework must return to Develop      | Refuse                     |
| Done                                | Refuse                                                     | Refuse                                     | Refuse                     |
| No active binding or unknown state  | No new permission                                          | Refuse                                     | Existing fail-closed rules |

Update source-edit to classify the eligible Plan document path before its
blanket pre-Develop source refusal. This narrow path does not require completed
deep-dive markers: planning documents must be editable while the deep dive is
being written. Source edits still require Develop and its normal markers.
Keep exact-head Test and Review evidence behavior unchanged.

## Patch envelope

Use one shared extractor for supported hook payloads: legacy object fields
`patch`, `input`, or `text`, and a freeform `tool_input` string when supplied by
the adapter. Require a nonempty string and reject conflicting supplied patch
fields. Preserve the extracted bytes. Add hook-entry fixtures using the actual
adapter-normalized envelope as well as pure parser fixtures; malformed inputs
must not silently become targetless or read-only. Confirm the transport with a
captured or adapter-defined fixture before claiming why an observed call failed.
This is guard input handling, not a redesign of the shared hook launcher.

Remove exactly one optional terminal LF or CRLF before checking the existing
exact Begin/End boundaries. Do not trim arbitrary whitespace or normalize body
contents or destination headers. Preserve rejection of traversal, backslashes,
NUL paths, unsupported headers, missing boundaries, and targetless patches.
Test no ending, one LF, one CRLF, doubled endings, trailing spaces, leading blank
lines, rename destinations, and multiple target operations.

## Implementation sequence

1. Add failing regression tables to the issue's five named test files. Add focused
   helper fixtures using the canonical test walker rather than another test root.
2. Implement shared invocation parsing and physical/recorded identity comparison;
   integrate activity, worktree, source-edit, and ownership consumers together.
3. Add staged status/mode classification and the explicit matrix. Remove parallel
   ad hoc parser decisions at the touched seams. Update block messages and
   relevant workflow documentation without widening unrelated activity policy.
4. Apply the minimal patch-ending change and retain existing unsafe-path tests.
5. Run targeted tests and the required package verifiers, commit with `[#1830]`,
   and use normal exact-head finalization, Test, Review, delivery, and Close.
   Resolve real refusals through their governed remediation; SAR does not approve
   these lifecycle actions or waive any requirement.

## Acceptance and regression mapping

| Issue criterion                | Required proof                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1: actual tool worktree      | Main-process/linked-payload fixture; tool workdir precedence and relative bases; absent versus invalid fields; environment disagreement; physical aliases; current-session binding; new nested targets, broken links, and symlink escapes |
| AC2: equivalent Git forms      | Plain, sequential/global-option forms; common discovery across all consumers; alias/shell/opaque negatives; harmless configuration positives; selector/hook/config-injection negatives; literal text control                              |
| AC3: staged artifact classes   | Markdown positive; code/config under docs; mixed files; rename/deletion sides; executable/symlink/gitlink/conflict/empty/unreadable index                                                                                                 |
| AC4: governed pre-Develop path | Full Plan edit-stage-commit through all hooks; every state row; wrong owner, unassigned, wrong issue, stale branch, missing binding, installed guard negatives                                                                            |
| AC5: patch terminator          | Shared transport extraction plus exact positive/negative envelope table through hook entry points, with all unsafe-target checks                                                                                                          |
| AC6: integration parity        | Real temporary linked worktrees; hook process/payload disagreement; all guards together; compound index/cwd mutation refusals                                                                                                             |

Run the issue's targeted `node --test` command, then `npm test`,
`npm run test:slow`, `npm run lint`, and `npm run format:check` as required by the
accepted workflow. Record actual results; existing probes are not substitutes.
No full implementation suite is required merely to review this plan.

## Estimate and readiness

The initial Refine estimate was three human hours. The existing Plan forecast
converged the issue fields to 6.5 hours. Before implementation, reassess the
revised parser/fixture scope through the normal estimate command and inspect
the still-reported planned-estimate and empty Plan Metadata refusals. Do not
rewrite the estimate to the original three hours or claim those gates passed.

This document's revision and SAR status are document properties. Only AITM can
record Plan approval or advance issue 1830. Keep original review evidence and
revision snapshots; publish the final reviewed revision and verify its issue
mirror without silently substituting old prose.
