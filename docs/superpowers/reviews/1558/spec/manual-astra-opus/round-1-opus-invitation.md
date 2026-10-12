# #1558 Ask-the-Script — independent manual architecture review, round 1

Author-side coordinator: **Astra 6**. Independent reviewer: **Opus 5**.
The human owns transport between these participants and the terminal acceptance
decision. This is a fresh review of the trunk-published specification. Review
publication is not specification acceptance, and this invitation authorizes no
implementation or AITM lifecycle transition.

## Immutable source and sandbox pins

- Repository: `kburson/ai-task-manager`.
- Required resolved project root: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1558-ask-the-script-review-r1`.
- Local sandbox branch: `codex/1558-ask-the-script-review-r1`.
- Pinned trunk baseline / initial sandbox HEAD: `a650be5a090f28325e03f47a22b7495674cf5011`.
- Published PR: <https://github.com/kburson/ai-task-manager/pull/1644>.
- Published merge: `b3f3671efb39c482f31671801abe555e4999639e`.
- Specification relative path: `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`.
- Exact specification path: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1558-ask-the-script-review-r1/docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`.
- Complete-file specification SHA-256: `317ed52e378f1276e45fa58de062d02b7b6aef44432b79d5dedf735be91a932a`.
- Exact invitation path: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1558-ask-the-script-review-r1/docs/superpowers/reviews/1558/spec/manual-astra-opus/round-1-opus-invitation.md`.
- Exact reviewer response path: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1558-ask-the-script-review-r1/docs/superpowers/reviews/1558/spec/manual-astra-opus/round-1-opus-response.md`.
- Suggested scratch directory: `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1558-ask-the-script-review-r1/.tmp/manual-review-1558-r1/`.

The published merge is an ancestor of the pinned trunk baseline. Astra fetched
origin/trunk, verified ancestry and all 48,243 specification bytes, and created
this new worktree at that baseline. PR #1644 was independently observed as merged
into trunk with the merge commit above.

Before publishing this invitation, Astra ran
`./scripts/dev-env/setup-local-worktree.sh`, verified installed dependencies,
verified that `node_modules/ai-task-manager` resolves to this exact root, and
confirmed an empty Git status. The environment and self-link tests passed
(16 tests, zero failures); this is not a claim that the full suite passed.
The dependency install reported zero vulnerabilities; npm blocked Puppeteer's
postinstall under the existing install-script policy, so browser-binary
availability is not established. Do not install software to work around this
without the human arranging a compliant environment.

This invitation is the only intentional post-baseline review artifact at
handoff. Its complete-file SHA-256 is supplied separately by Astra so it does
not contain a self-referential digest. It is immutable after publication.

## Human launch gate and mandatory capability preflight

The human must start a **new Opus 5 session with this sandbox as its actual
project root**, with its initial working directory resolving to the exact root
above. Adding an external-folder Read grant to a session rooted elsewhere is
insufficient. Do not continue in such a session or attempt to compensate merely
by using absolute paths or changing a single Bash command's directory.

Astra has not launched Opus, inspected a future session's tool inventory, or
attested that its runtime restrictions are active. This file is a review
invitation and runtime contract, not an installed security mechanism. The human
must supply an enforced runtime satisfying the boundary below before review
begins; Opus must verify the effective configuration and report its evidence.

The repository's `.claude/settings.json` contains AITM lifecycle hooks and
permissions allowing mutations. Its defaults alone are not a review boundary.
The launching runtime must prevent automatic startup, prompt, tool, compaction,
and stop hooks, plugins, or integrations from causing prohibited effects. Apply
the effective restrictions before startup, not after an unsafe hook has run.
Do not modify tracked repository settings or global settings to achieve this.
If a compliant runtime cannot be established, return the failure marker below.

Before architecture analysis:

1. Confirm the actual session project root using runtime-provided session
   metadata, then use Bash `pwd -P` and `git rev-parse --show-toplevel` to verify
   both resolve to the pinned root. Record all three observations. A working
   directory check alone does not prove the session's project root.
2. Confirm that the effective tool inventory and permissions provide **Read,
   Glob, Grep, Bash within the sandbox, and Write within the sandbox**. Exercise
   Read against the specification, Glob across repository files, and Grep on a
   known specification heading. Reading one externally granted file is not a
   substitute for repository search. Do not replace missing Glob/Grep with a
   Bash search and claim the required capabilities passed.
3. Exercise Bash with read-only commands. Exercise Write by creating a fresh,
   uniquely named probe inside the scratch directory, then Read it back. Never
   overwrite an existing probe. Disclose this scratch file in the response.
4. Inspect and record the effective filesystem, process, tool, and network
   enforcement. Verify that descendants and hooks are covered; prompt text,
   permissions labels, and a Git command denylist alone are not evidence of
   enforced isolation. Do not test prohibitions by attempting a real external
   write, remote mutation, or repository mutation. Use runtime policy evidence
   or a safe runtime-supported policy check.
5. Confirm the pinned HEAD and branch, merge ancestry, complete-file
   specification digest, invitation digest against Astra's handoff, dependency
   self-link, and initial Git status. Expect only this invitation as an
   untracked review artifact before your probe. Report any other state rather
   than cleaning or resetting it. Refuse a mismatched source or baseline.
6. Confirm the exact response path does not exist, including a dangling
   symlink. If it exists, stop and ask the human for a new round/path; do not
   truncate, append, replace, or choose another response path yourself.

If Read plus Glob and Grep are unavailable, stop immediately with the exact
marker:

`REVIEW_ENVIRONMENT_INADEQUATE`

Use the same marker if another required capability, project-root identity,
integrity pin, or enforced runtime boundary is unavailable or unverifiable.
Explain the failed check to the human; do not produce a partial architecture
recommendation or silently weaken the contract. If Write is unavailable,
report failure in chat rather than attempting to create the response.

## Required runtime boundary

The runtime must enforce all of the following for every tool, shell command,
subprocess, hook, plugin, and integration:

- No filesystem effects outside the **resolved** sandbox root. This includes
  writes through symlinks, traversal, alternate working directories, caches,
  temporary directories, history, telemetry/log files, and child processes.
  Configure runtime state and temporary/cache output inside the sandbox before
  launch. Reads needed for tools and Git history are permitted.
- Treat the worktree's `.git` pointer and all resolved Git metadata as
  read-only. A linked worktree shares Git metadata outside its root; being
  inside the worktree does not confer permission to write there. No commit,
  push, index/ref/config change, or other Git mutation is permitted by any
  executable or library. Use `GIT_OPTIONAL_LOCKS=0` for read-only Git evidence
  where appropriate; it is not a substitute for enforcement.
- No GitHub mutation, AITM lifecycle mutation, or authenticated external write.
  Block credential-bearing mutation paths through CLI tools, direct HTTP,
  libraries, hooks, MCP/connectors, and arbitrary subprocesses. Restrict
  authenticated GitHub access to read-only queries, with GET-only REST API
  access and query-only operations for permitted view/list/check commands.
- The specification and this invitation remain immutable, including through
  delete/recreate, rename, formatting, or symlink replacement. Protect them in
  the effective runtime. Do not alter their permissions or protection.
- No escaping the runtime, escalating permissions, altering its controls, or
  disabling protections to get a command to pass.

**Read-only Git is explicitly permitted. There is no blanket Git prohibition.**
Permit `git status`, `log`, `show`, `diff`, `blame`, `grep`, `ls-files`,
`rev-parse`, `merge-base`, and branch/tag listing. Permit their read-only forms
only: options invoking external helpers, writing output outside the root, or
changing state are not authorized. Suppress external diff/textconv helpers
when they would introduce unverified effects.

Permit GitHub issue and PR **view/list/diff/check** queries and GET-only GitHub
REST API queries, including provenance for #1558 and PR #1644. `gh api` fields
can implicitly change the HTTP method; explicitly use GET for REST evidence.
GraphQL mutations and other authenticated external writes remain prohibited.

Block Git mutations including `commit`, `push`, `fetch`, `pull`, `checkout`,
`switch`, `reset`, `restore`, `clean`, `merge`, `rebase`, `cherry-pick`, `stash`,
`add`, branch/tag creation/deletion/renaming, config mutation, remote mutation,
and worktree mutation. Block equivalent aliases, wrappers, library operations,
and direct metadata writes. Block GitHub comments, edits, merges, issue/PR
creation, labels/state changes, and all AITM binding, time/lifecycle/state,
approval, delivery, or issue mutations. Do not invoke task startup or review
submission workflows that would record or mutate authority.

## Authorized investigation

Search and read the full repository in this sandbox. Inspect local Git history
and read-only GitHub issue/PR provenance. Run local tests and diagnostics when
their effects are confined to the sandbox and cannot contact mutating external
services. Inspect unfamiliar scripts before executing them; a test label does
not prove a command has no external effects. Redirect temporary/cache output
inside the sandbox. If a test requires forbidden writes or missing external
resources, record that limitation rather than bypassing the boundary.

You may create scratch material and make **disclosed experimental edits** to
other sandbox files solely to test an architectural claim. These edits are
non-authoritative, must not change the published specification or invitation,
must not be committed or pushed, and must not become implementation delivery.
Record each edited path, hypothesis, experiment, result, and remaining diff.
Leave the final experiment state available for Astra's inspection. Do not hide
it with Git cleanup or discard any pre-existing changes.

## Independent architecture review request

Read the complete pinned specification. Independently assess whether its
architecture is sound, complete, compatible with actual repository behavior,
and sufficiently specified for later planning. Do not assume publication,
author confidence, a passing probe, or an acceptance criterion proves a claim.
Seek concrete counterexamples and missing contracts without implementing the
feature.

Separate evidence into four explicit categories:

- **Current behavior:** code, tests, and actual observations at the pinned
  baseline; cite repository-relative paths and line numbers.
- **Historical evidence:** past commits, issues, PRs, or measurements; cite exact
  commits or URLs and distinguish historical state from current behavior.
- **Planned work:** proposed contracts, acceptance criteria, and future changes
  in the specification; cite its sections and do not describe them as shipped.
- **Assumptions:** unverified inferences, missing evidence, and environmental
  limitations, with the verification needed to resolve them.

At minimum, investigate these areas, expanding beyond them where warranted:

1. Shared explain/execute decision authority, exact guard equivalence, refreshed
   state under locks, and protection against time-of-check/time-of-use races.
2. Package/project source resolution, whole-catalog shadowing, fail-closed
   validation, recovery when guidance is invalid, and closed instruction and
   remediation vocabularies as protection against executable injection.
3. Cache identity, concurrent compilation/publication, corruption recovery,
   symlink/trust boundaries, and stale-data risks in the warm path.
4. Live-context receipt provenance, content suppression, source changes, and
   compaction invalidation without mistaking durable storage for live context.
5. Read-only explanation versus idempotent GitHub annotation, preserving
   executable guard authority and non-mutating diagnostic behavior.
6. Compatibility with existing hooks, command dispatch, package installation,
   skill loading, and policy preflight; migration and measurable equivalence.
7. Honest cumulative, repeated-query, and post-compaction context budgets and
   testability of runtime/performance claims.
8. Scope and supersession relative to #680 and #1559–#1561; dependency cycles,
   sequencing feasibility, and whether Child B needs further decomposition.
9. Completeness of failure behavior, acceptance criteria, and tests required
   to establish each important invariant.

## Response and immutable publication

Write a standalone Markdown response **only** at:

`/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1558-ask-the-script-review-r1/docs/superpowers/reviews/1558/spec/manual-astra-opus/round-1-opus-response.md`

Do not overwrite an existing response. Prepare a draft in unique in-sandbox
scratch if useful, then publish the final response with exclusive creation
(e.g. an `O_CREAT | O_EXCL` write); an existence check followed by an ordinary
truncating write is insufficient. Do not edit the published response afterward.
Return its exact path and complete-file SHA-256 to the human in chat.

The response must include:

1. Reviewer identity (Opus 5), coordinator (Astra 6), round 1, actual project
   root, branch, pinned baseline, exact specification path/digest, and verified
   invitation path/digest.
2. Capability and enforced-boundary preflight evidence, commands/tool probes,
   initial state, repository/history/GitHub coverage, and any limitations.
3. Findings with stable IDs such as `ASK1558-R1-001`. Preserve these IDs in
   future discussion. For every finding provide severity (P0 critical, P1
   high, P2 medium, or P3 low), concise claim, specification section, concrete
   repository/history/experiment evidence, risk or failure scenario, required
   correction, and explicit acceptance impact (blocking or nonblocking).
   Separate optional improvements from correctness defects. If no findings
   exist, say so explicitly rather than inventing one.
4. Distinct current-behavior, historical-evidence, planned-work, and assumption
   classifications; clearly label inference and explain conflicting evidence.
5. This round starts with no imported findings. State that the prior-finding
   disposition is not applicable; later rounds must account for every finding
   by stable ID and disposition.
6. Test/diagnostic commands with outcomes; every experimental edit and scratch
   file, including ignored material; the final `git status`, tracked diff
   summary, and explicit non-authoritative status of experimental changes.
   Recheck specification/invitation digests and HEAD, and confirm no commit,
   push, Git/GitHub mutation, lifecycle mutation, or external write occurred.
7. A required terminal recommendation with **exactly one** of:
   `accept`, `accept-with-nonblocking-notes`, or `revise-and-review-again`.
   State whether another review round is required and identify all blocking
   findings. Acceptance recommendations must have no unresolved blockers;
   `revise-and-review-again` requires a subsequent review of a newly pinned
   source after author corrections.

Your recommendation is advisory. The **human owns transport and the terminal
acceptance decision**. Astra will inspect the response and final sandbox diff.
Neither silence nor your recommendation alone records terminal acceptance.
Do not modify issue #1558, submit an automated peer review, create a plan,
commit an artifact, push the review branch, start implementation, or start
another reviewer session. Stop after publishing your response and handing its
path and digest to the human.
