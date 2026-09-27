---
review_type: SAR
reviewer: Codex author, same session
issue: 1830
reviewed_artifact: https://github.com/kburson/ai-task-manager/issues/1830#issuecomment-5858358526
reviewed_comment_updated_at: 2026-09-27T18:00:43Z
local_plan_snapshot: .scratch/1830-deep-dive.md
local_plan_sha256: 69dc96df584fe56a4f35c58414b78a985aa5014263c42daf9bacaf49a169517a
source_commit: 32fc3a04b0cc3f738902aea0f1e6430e4888d579
plan_committed: false
turn_ordinal: SAR r1
finding_count: 4
verdict: changes-required
---

# Mutation guard plan: SAR round 1

## Scope and authority

Reviewed the complete implementation plan in the linked issue comment, its live
issue-body mirror, the six acceptance criteria, and the current guard source.
The local snapshot matches the comment's planning prose; the remote comment
also has its AITM ownership marker. Line references below refer to that local
30-line snapshot. The source checkout is on the recorded issue branch
`codex/1830-mutation-guard-context` at the commit above.

This is Single Agent Review by the author in the same session. It is not an
independent reviewer, cross-provider review, peer-review protocol acceptance,
Plan approval, or evidence that implementation passes. No model or effort
attestation is claimed. The plan has not been changed in this review.

## Findings

### SAR-01 — P1: A compound command can change the index after inspection

**Plan location:** implementation steps 1 and 3, lines 16 and 18; verification,
line 24.

Step 3 classifies the staged inventory before the tool executes and addresses
commit options that add unstaged content. It does not address earlier command
segments that change that inventory. With only a document staged and a modified
source file unstaged, `git add scripts/change.mjs && git commit -m "[#1830] fix"`
would be inspected against documentation but execute a source-bearing commit.
Sharing command segmentation does not by itself make that snapshot current.
Commands that change cwd, Git configuration, or the selected index before the
commit have the same inspection-versus-execution problem.

Current source grounds the execution boundary: `activity-guard.mjs` classifies
one complete tool command before execution. The existing worktree classifier
recognizes both segments, but only checks their worktree, not their effect on
the inventory inspected for a later commit. The pure classifier probe returned
`READ_*` for this compound command and `guarded: true` from the worktree layer.
This probe establishes current classifier behavior; the proposed staged-path
implementation does not yet exist and was not claimed to have been executed.

**Required correction:** Define which compound forms are eligible for
`COMMIT_DOCS`. Conservatively refuse the pre-Develop documentation exception
when a preceding segment can mutate the index, repository selection, cwd, or
relevant configuration. Alternatively, specify and enforce a separate commit
execution boundary that revalidates the actual inventory. Do not claim atomic
protection against concurrent index writers from a PreToolUse snapshot alone.

**Required regression:** Start with a staged document and an unstaged source
change. Exercise preceding `git add`, `git reset`, cwd/index changes, and multiple
commit segments. None may gain pre-Develop source-commit permission from the
original documentation-only snapshot. Keep a standalone documentation commit
as the positive control.

**Disposition:** Open; requires plan revision.

### SAR-02 — P1: Preserving ownership handling does not close alias and shell bypasses

**Plan location:** implementation step 1, line 16, especially “direct Git
parsing” and “Preserve ... alias/indirect-command refusals.”

There is no blanket existing alias or nested-shell refusal to preserve.
`bash-guard.mjs:397` expands nested shells, and its alias parser at lines 543-590
recognizes possible commits to inspect their attribution and check the owner.
A correctly owned attributed commit can pass this layer regardless of the
activity class. Meanwhile, the live pure probes classify both
`git -c alias.ci=commit ci -m "[#1830] fix"` and
`sh -c 'git commit -m "[#1830] fix"'` as `READ_*`, and the worktree classifier
reports both as unguarded. Repairing only direct Git global-option parsing
would leave these alternate forms outside the intended lifecycle enforcement.

**Required correction:** Make all mutation consumers use the same effective
commit discovery result, including resolved aliases and supported shell
wrappers. If a form cannot be inspected safely, refuse it as an opaque mutation;
do not leave it classified as a read. Pin repository-local and inline alias
resolution to the same effective worktree used for ownership and stage inventory.
Preserve the distinction between verifying the owner and authorizing an activity
in the current state.

**Required regression:** Check inline and repository aliases, alias chains,
shell aliases, nested `sh`/`bash`/`zsh` invocations, wrappers, dynamic arguments,
and recursion exhaustion. In Plan, a source-bearing commit must refuse even
when its issue attribution and owner are correct. Literal harmless text that
merely mentions a Git command must not be treated as an executed commit.

**Disposition:** Open; requires plan revision.

### SAR-03 — P1: Define documentation eligibility independently of broad path globs

**Plan location:** implementation step 3, line 18.

“Documentation/evidence-only inventory” is not defined precisely enough to
implement the new permission boundary. The natural existing classifier is
unsafe as its sole predicate: `activity-policy.mjs:35` includes `docs/**`, and
lines 180-189 give documentation globs precedence over code and configuration.
The live probe classifies both `docs/run.mjs` and `docs/package.json` as
`WRITE_DOCS`. Reusing that result to grant `COMMIT_DOCS` would allow executable
source or configuration through the pre-Develop documentation exception.
NUL-delimited names alone also do not describe staged file modes or both sides
of a rename; a code-path deletion/rename must not disappear behind a new
Markdown destination.

**Required correction:** Define an explicit eligible artifact contract,
including evidence types and their permitted locations. Code and configuration
must take precedence for this commit permission. Inspect staged change status
and modes as needed; reject unknown types, executable artifacts, symlinks,
gitlinks, and source-bearing rename/deletion sides from the documentation
exception unless the plan explicitly establishes a safe narrower rule.
Preserve `COMMIT_CODE` as the conservative classification for known mixed or
source changes, and distinguish that from an uninspectable mutation context.

**Required regression:** Include an ordinary specification and actual review
collateral as positive controls; JavaScript/configuration under `docs/`, a
Markdown-named executable or symlink, a code-to-document rename, a source
deletion, and mixed inventories as negatives. Test arbitrary valid filenames
without parsing them by whitespace or newline.

**Disposition:** Open; requires plan revision.

### SAR-04 — P1: Plan documentation edits remain blocked before the new commit path

**Plan location:** implementation steps 2 and 3, lines 17-18; intended positive
workflow, line 24.

The plan changes source-edit worktree resolution and introduces a non-code
commit class, but does not specify the source-edit lifecycle change needed to
create or revise those documents. `source-edit-gate.mjs:165` unconditionally
refuses every pre-Develop edit, including `docs/plan.md` in Plan. The live pure
probe returned `source-edit-state-gate` with matching owner and complete
deep-dive markers. The separate activity matrix already allows `WRITE_DOCS` in
Plan, so fixing context and commit classification alone leaves the guards in
disagreement and the intended authoring workflow unusable.

Simply bypassing the early refusal for docs is also insufficient:
`source-edit-gate.mjs:133` currently checks exclusive ownership only in Develop,
Test, and Review. A Plan documentation allowance must explicitly retain the
owner, issue, branch, physical-worktree and installed-guard checks promised by
acceptance criterion 4.

**Required correction:** Specify the exact edit/commit state matrix and guard
ordering for eligible planning artifacts. Include a narrow Plan documentation
edit path with the same identity and ownership checks as its commit path;
retain pre-Develop source refusal. Do not automatically enable documentation
commits in Review merely because that state permits documentation edits:
define how the chosen matrix preserves accepted-head evidence.

**Required regression:** Exercise the complete create/edit, stage, and commit
path through all installed hooks in Plan. Repeat for unassigned, foreign-owner,
wrong-issue, stale-branch, foreign-worktree, mixed/source, and installed-guard
cases. A unit test of `COMMIT_DOCS` alone cannot establish this workflow.

**Disposition:** Open; requires plan revision.

## Other checks and readiness

- The proposed exact-one-terminal-LF-or-CRLF patch normalization is appropriately
  narrow. Keep the negative boundary and unsafe-target tests listed in the plan.
- Branch identity must remain an explicit expected-versus-observed comparison.
  The current resolver replaces the recorded branch with live identity
  (`worktree-binding-guard.mjs:179-190`), and the comparator accepts matching paths
  without comparing branches (`bash-worktree-guard.mjs:195`). The plan already
  requires branch mismatch coverage; implement it against those actual seams.
  A pure probe confirmed that the current comparator accepts the same path on
  a different branch. This is supporting detail for the stated plan requirement,
  not an additional finding.
- The current issue remains in Plan. A fresh Explain reports
  `plan-exit-planned-estimate` and `plan-exit-plan-metadata`; the latter section
  is empty. The live fields contain a 6.5-hour estimate and an existing forecast
  record, so the outstanding estimate refusal needs investigation rather than
  assuming the prior successful forecast command cleared every Plan gate.
- Global Superpowers and memory files remained unavailable through the
  repository's access hook. This review used current repository evidence and
  its committed SAR examples.

## Verification and limitations

Ran read-only Node probes against the existing exported classifiers,
`decideSourceEdit`, and the worktree-binding comparator. Results are described
beside the relevant findings. Read the live issue and the original comment;
the comment remains at its recorded update time. No production source, guard
configuration, approval marker, or lifecycle state was changed by this review.

An additional temporary-Git index demonstration was blocked before execution by
the repository activity hook as `WRITE_OTHER`; it produced no experimental
result. SAR-01 is supported by the pre-execution hook structure and command
semantics, not by a claimed successful fixture. Full test suites were not run
for this documentation-only review.

## Verdict

**Changes required: four P1 findings.** Revise the plan to resolve SAR-01 through
SAR-04 and perform another complete SAR on the revised artifact. This review
does not authorize Plan approval or entry into Develop.
