# SAR round 1: revise

Reviewer: one persistent GPT-6-astra agent, acting as both author and reviewer.
Input: `spec.r0.md`.
Input SHA-256: `a77f8d40a2bab115db5a7607c0f77bce2166a5cdb527a5142f5002e2a68a5745`.

## Review performed

Read the entire initial specification against the live issue body, packaged
guard, bootstrap generator, existing subprocess tests, and test runner.
Checked scope, acceptance coverage, policy containment, test observability,
delivery boundary, and the distinction between SAR and governed approval.

## Findings

### F1: lexical traversal can expand the new read scope

Severity: material. The selected change says to add a directory prefix without
qualifying containment. The guard matches raw tokens with `startsWith`; a token
such as `~/.codex/skills/../auth.json`, expanded to an absolute path, satisfies
that prefix while naming unrelated Codex data. This is newly enabled by the
proposed allowance and conflicts with the explicit issue scope. Require both a
raw descendant prefix and normalized lexical containment for the new skills
allowance, without replacing existing read-root behavior. Add escaping and
in-directory normalization cases to the verification matrix.

### F2: focused verification command is invalid

Severity: material. The issue lists `npm test -- --runInBand bash-guard` as VC1.
`package.json` delegates tests to `scripts/run-tests.mjs`; its argument parser
accepts lane and timing-report flags only, and returns exit 2 on unknown flags.
Specify a direct Node subprocess-test command and require the orchestrator to
replace VC1 through sanctioned issue-body tooling before stamping evidence.
Do not record execution of a different command as execution of the old VC1.

### F3: directory-root and parser limits are ambiguous

Severity: material. The issue reproduction names a descendant skill file, but
the initial spec does not state whether the directory root itself is newly
allowed. Existing prefix matching does not allow bare provider-root paths.
State that this fix enables extracted absolute descendant tokens and preserves
the bare-directory behavior. Clarify that shell expansion and real filesystem
containment via symlinks are not newly guaranteed.

## Disposition

Revise to r1 addressing F1-F3. No acceptance verdict, implementation result,
human approval, or governed Plan approval is recorded.
