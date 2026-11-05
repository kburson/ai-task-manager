<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-853bbccf4ac330aae187dbb5415a02c8"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-12-project-local-review-lifecycle-and-learning-design.md"
artifact_commit: "d02ba9794a33054bc794cf5607662224d47669b4"
artifact_blob: "325467d1f0bc8d5c713a1fda869518fb752f28d8"
artifact_digest: "sha256:3f99d0e6767dc4713fe28769e841c78fe469ec90fb7e6febaee08ae2cc4f5cff"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:8f5a5f852b719e2d196820236ca4ffe322579efa31dc31a5431eeab08ce0d127"
  identity_source: "runtime"
started_at: "2026-09-12T23:27:02.627Z"
submitted_at: "2026-09-12T23:29:47.391Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revisions requested. The separation of canonical artifacts, tracked evidence,
committed learning events, and disposable SQLite is coherent. The explicit
non-delivery experiment mode and independent lesson evaluation are useful scope
boundaries. Three lifecycle and compatibility gaps need resolution before this
design is ready for implementation planning; one additional receipt-ordering
clarification is optional.

This review assessed the pinned design and the current 0.2.2 repository source.
It is a design review, not implementation validation. No artifact edits, direct
Git commands, commits, or pushes were performed. The local runtime record
identified this reviewer as gpt-6-astra; that value supplied the missing model
environment metadata before doctor passed and the distinct session joined.

## Findings

### R1-F001 — High: Concurrent linked-worktree reviews conflict with the retained-ref seal

**Design references:** Concurrency, lines 658–670; experiment isolation and
non-delivery behavior, lines 806–827; preserved guarantees, lines 99–100 and
927–931.

The design permits several reviews in linked worktrees, including experiment
arms that commit their revisions independently. However, the current
[reviewer boundary](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/git/repository.mjs:339)
hashes the clone-wide ref inventory, excluding only Codex's private checkpoint
namespace. [Reviewer submission](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/cli/run.mjs:1836)
rejects any other ref drift. If reviewer A is active when author B commits in a
second worktree, B's branch ref changes and A's otherwise valid response fails
with APR_REVIEWER_GIT_VIOLATION. SQLite row isolation and short transactions do
not resolve this Git-level conflict.

**Required resolution:** Define the Git coordination contract before claiming
concurrent reviews: for example, serialize incompatible Git mutations across
reviewer intervals, or design a narrowly authorized, attributable ref-transition
mechanism that preserves reviewer non-mutation. Do not broadly exempt other
branches from the seal. Add a conformance scenario where one arm submits an
author revision while another reviewer is active, together with a negative
control for an unauthorized retained-ref change. State which phase introduces
this prerequisite.

### R1-F002 — Medium: Changed approved artifacts have no defined current-authority rule

**Design references:** Intake, lines 341–354; approval and delivery, lines
367–385; catalog indexes, lines 393–408.

The lifecycle explains initial intake, proposed revisions, one approval move,
and stable approved paths after delivery. It does not say what happens when an
approved or delivered document changes or is submitted for another review. For
example, a delivered plan at digest D1 can be edited and committed at D2 while
its catalog still says delivered and its stable link opens D2. Existing receipt
digests preserve history, but no stated rule prevents the indexes or downstream
consumers from treating the unaccepted D2 as the currently approved plan. Intake
also gives an in-place rule only for proposed documents.

**Required resolution:** Choose a bounded post-approval policy. Either prohibit
in-place revision of approved artifacts and require an explicit successor, or
define a review generation/reopening transition that separates historical D1
approval and delivery from the readiness of D2. Bind current readiness to the
accepted digest, define the behavior of intake on an approved path, and require
index/consumer handling for digest drift. Test a change after approval and a
change after delivery without falsifying either historical receipt. This need
not add a second canonical copy or move delivered paths again.

### R1-F003 — Medium: Lifecycle intake and finalization lack a no-commit exception

**Design references:** Intake, lines 346–350; no-commit revision storage, lines
362–365; approval, lines 369–375; compatibility and Phase 2, lines 929–931 and
950–956.

Intake unconditionally moves a root Superpowers artifact using a Git transaction
and requires the moved file to be committed. Approval likewise unconditionally
moves the FUR and commits a finalization bundle. The only concrete no-commit
special case covers transient revision bytes in SQLite. Applying the lifecycle
rules to a no-commit review therefore either creates a commit or prevents the
test from reaching the normal dialogue/finalization path. That contradicts the
retained contract: the existing
[no-commit finalization test](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/test/integration/finalization.test.mjs:259)
requires unchanged HEAD and index and the accepted-uncommitted terminal state.
A test acceptance must also not become production approval in the new catalog.

**Required resolution:** Specify no-commit behavior for intake normalization,
approval movement, catalog/index writes, and delivery eligibility. A simple
option is to retain the original path and emit explicitly test-only,
uncommitted lifecycle evidence with no production readiness effect. Whatever
policy is chosen, add tests beginning with an artifact directly under the
Superpowers root and proceeding through acceptance while HEAD and index remain
unchanged. Apply the rule in Phase 1, when lifecycle movement first appears,
rather than deferring it solely to SQLite parity in Phase 2.

## Required changes

1. Resolve R1-F001 with an explicit Git coordination contract and concurrency
   acceptance tests.
2. Resolve R1-F002 with a post-approval revision or successor policy and
   digest-bound current readiness.
3. Resolve R1-F003 with end-to-end no-commit lifecycle semantics starting in
   Phase 1.

## Optional suggestions

### R1-F004 — Specify the ordering of commit receipts and manifest checkpoints

**Design references:** Per-revision manifest fields, lines 442–450; checkpoint
recovery, lines 458–475; terminal immutability, lines 481–488.

The manifest records the commit containing the complete turn bundle, while
manifest receipts are themselves checkpointed as durable evidence. Clarify
whether the commit field names the earlier artifact/response/patch commit or a
later checkpoint commit, and how that receipt becomes tracked before terminal
immutability. A manifest cannot contain the hash of its own containing commit.
The current
[finalization fixture](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/test/integration/finalization.test.mjs:211)
explicitly expects the manifest's final_commit to name the prior artifact
commit. A brief ordered example and a crash point between commit creation and
receipt checkpointing would keep the new contract equally unambiguous without
requiring detailed SQLite DDL in this design.

## Decision

revisions-requested
