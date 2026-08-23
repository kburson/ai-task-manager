# Reviewer Full Review Permissions Design

**Issue:** #1406  
**Status:** Approved design, pending written-spec review  
**Date:** 2026-08-23

## Problem

AITM currently applies its co-review mutation policy to Bash while a reviewer
holds a live claim. The Bash target parser recognizes a deliberately small
single-command grammar and treats commands it cannot prove read-only as
ambiguous mutations. The reviewer policy then denies those commands before they
execute.

That boundary blocks ordinary evidence gathering such as pipelines, `sed`,
`find`, additional Git queries, Node scripts, and test commands. A reviewer can
fall back to Read, Glob, and a few simple shell commands, but cannot perform the
dynamic repository inspection required for a deep independent review. The
result is a constrained review that risks becoming a rubber stamp.

Issue #1365 added a narrow exception for exact co-review lifecycle commands. It
did not restore general review capability, and its boundary regression invoked
only `bash-guard.mjs` rather than the complete installed Bash hook chain.

## Design Goals

1. A claimed reviewer has the same Bash inspection and execution capabilities
   as a normal session in the same repository state.
2. Co-review adds no Bash allowlist, single-command grammar, or ambiguous-shell
   refusal.
3. Ordinary repository guards remain fully effective during reviewer turns.
4. Direct file-writing tools remain limited to the exact session-bound pending
   review artifact.
5. The reviewed artifact, protocol authority, provider/session ownership,
   locking, evidence hashes, and archive integrity remain authoritative.
6. The complete installed hook chain proves the permission boundary.

## Non-Goals

- Removing ordinary dangerous-command, path-scope, task-state, worktree,
  GitHub-governance, or installed-guard protections.
- Giving Edit, Write, NotebookEdit, or apply_patch authority over source files,
  the reviewed artifact, protocol files, or unrelated scratch files.
- Weakening protocol integrity, role separation, provider/session identity,
  immutable evidence, locking, or terminal archive validation.
- Hot-patching an active co-review worktree while another provider holds a
  reviewer claim.
- Treating a review completed under the old constrained boundary as equivalent
  to a review completed after this correction.

## Permission Model

### Bash

Co-review does not authorize or deny Bash. Bash flows through the same ordinary
guards used outside a reviewer turn:

- unconditional dangerous-command refusal;
- repository and home-directory path scope;
- active-task worktree binding;
- task-state activity classification;
- governed GitHub and issue-lifecycle command policy;
- AITM command-path policy;
- commit ownership and installed-guard self-protection.

This permits pipelines, compound inspection commands, `sed`, `find`, Git and
GitHub reads, Node scripts, test runners, and other repository-scoped commands
that the normal session policy permits. Bash may also produce the ordinary
repository-scoped side effects that those existing guards permit. Co-review
does not attempt to infer every shell process's filesystem effects.

The reviewed artifact remains protected independently: co-review records its
commit, blob, and SHA-256 digest, and lifecycle operations revalidate that
authority. A Bash mutation of the reviewed artifact must invalidate integrity
or artifact agreement rather than silently changing what is under review.

### Direct file-writing tools

Edit, Write, NotebookEdit, and apply_patch continue through
`evaluateCoReviewWrite()`. A live reviewer grant permits only the exact
canonical pending review artifact registered for that provider and session.
The policy continues to reject:

- the reviewed artifact;
- source or documentation outside the pending review file;
- protocol and fleet authority files;
- other `.tmp/**` paths;
- mixed targets;
- malformed patches;
- symlink aliases or drift; and
- wrong-provider or wrong-session writes.

These decisions run before ordinary scratch or activity allowances.

## Architecture Changes

### `activity-guard.mjs`

Stop extracting co-review mutation targets or invoking
`evaluateCoReviewWrite()` for Bash. Retain co-review evaluation for Edit, Write,
NotebookEdit, and apply_patch. Bash continues into the existing
`classifyBash()` and task-state decision path.

### `bash-guard.mjs`

Remove the reviewer-specific Bash target extraction, lifecycle-command
classification, and co-review write-policy decision. Keep every subsequent
ordinary Bash guard in its existing order.

### Co-review write-policy modules

Make the production contract explicit: co-review write authorization governs
direct file-writing tool envelopes, not arbitrary shell execution. Remove or
retire Bash-only policy branches and parsers when they have no production
consumer. Do not retain a hidden second Bash authorization path.

### Generated handoffs and documentation

Reviewer handoffs must say:

- normal Bash remains available under ordinary repository guards;
- direct Edit/Write/NotebookEdit/apply_patch writes are limited to the pending
  review artifact;
- the reviewer must not edit the reviewed artifact; and
- co-review lifecycle commands remain validated by the protocol itself.

Operator documentation must describe the same boundary without suggesting that
arbitrary reviewer Bash is prohibited.

## Command Flow

For Bash:

```text
Claude Bash request
  -> ordinary bash-guard policies
  -> ordinary activity-policy classification
  -> execute or refuse under normal repository rules
```

For direct writes:

```text
Claude Edit/Write/NotebookEdit/apply_patch request
  -> resolve live reviewer provider/session grant
  -> canonicalize every target
  -> allow only the exact pending review artifact
  -> otherwise refuse before ordinary allowances
```

For reviewer handoff:

```text
ordinary Bash permission
  -> npx aitm co-review handoff
  -> protocol role, claim, integrity, review hash, review-of SHA, lock,
     lifecycle, and archive validation
```

## Failure Handling

- An ordinary guard refusal remains a normal repository-policy refusal and must
  not be relabeled as a co-review mutation failure.
- Missing or invalid reviewer authority continues to fail closed for direct
  file-writing tools.
- Artifact or protocol-integrity drift refuses lifecycle progress.
- A lifecycle command from the wrong actor, provider session, runtime,
  review path, or reviewed SHA remains a protocol refusal.
- No fallback may impersonate the reviewer or mutate terminal evidence.

## Test Strategy

### Failing end-to-end regression first

Create an integration test that installs and invokes the complete Bash
pre-tool hook chain against a real temporary repository and a live claimed
reviewer protocol. Before the fix it must fail because representative deep
review commands are blocked.

The corrected test proves that the claimed reviewer can run:

- a Git or ripgrep pipeline;
- `sed` and `find` inspection;
- `git branch --show-current` or an equivalent Git query;
- a Node script or focused Node test; and
- the exact reviewer status and handoff commands.

The sequence must reach a durable accepted or changes-requested protocol state
and validate the immutable review evidence and archive.

### Write-boundary regression

Existing and focused policy tests must prove that direct file-writing tools can
write only the pending review artifact and still refuse source, reviewed
artifact, authority, protocol, mixed, malformed, symlink, and wrong-session
targets.

### Ordinary-safety regression

The combined hook test and existing focused guard suites must prove that removal
of the co-review Bash layer does not disable dangerous-command, path,
worktree-binding, task-state, governed GitHub, or self-protection controls.

### Repository verification

Run focused tests during development, followed by the fast suite, slow suite,
lint, documentation lint, and formatting before Test admission.

## Rollout

Implement and verify this change in the isolated #1406 worktree. Do not alter
the active #1381 review runtime or its worktree while Claude holds a reviewer
claim.

After the correction is integrated into the branch used for review, retire or
preserve the constrained runtime as non-authoritative forensic evidence and
start a fresh plan co-review. The fresh runtime must use the corrected hook
chain from its first reviewer claim.

## Acceptance Summary

The change is accepted when a claimed reviewer can perform normal deep
repository inspection and execute verification commands through the complete
installed hook chain, while direct file-writing tools remain bound to the exact
pending review artifact and all ordinary repository and protocol protections
remain intact.
