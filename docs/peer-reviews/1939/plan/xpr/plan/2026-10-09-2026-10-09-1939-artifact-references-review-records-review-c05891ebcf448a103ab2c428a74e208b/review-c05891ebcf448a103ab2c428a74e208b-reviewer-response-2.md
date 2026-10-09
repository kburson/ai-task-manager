<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-c05891ebcf448a103ab2c428a74e208b"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
artifact_commit: "24529475b0135c06eef2007efdda887c0bb45eb2"
artifact_blob: "8ae4326c33492ce6862d2eb4ce273616e4bea1ce"
artifact_digest: "sha256:b96299a2f3508ba60e03536bcba73d434a47fb5fed7e6f70f1fbe445d7b2ccee"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7904a355245b72934b2c8e0064efb0a23665315d643f3533dd7bd4df785214e1"
  identity_source: "runtime"
started_at: "2026-10-09T18:13:10.058Z"
submitted_at: "2026-10-09T18:30:59.084Z"
finding_ids: ["R2-F001","R2-F002","R2-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 2 of the independent plan XPR. Re-read the revised plan in full at the package-pinned commit/blob in protected frontmatter, together with author response 1. I checked each disposition against the revised text and the current repository.

Disposition assessment of round-1 findings:

- R1-F001 (#1592 conflict): resolved acceptably. The revision preserves `peer-review-decommission.test.mjs` unchanged and adds it to the Task 5, 8 and 12 verification commands. Production has no package import, dependency or lock entry; it calls a configured read-only external verifier without a shell. The pinned tarball lives only under `scripts/tests/fixtures/artifact-records/producer/` and is installed into a disposable consumer. The wire identifier sits visibly in `templates/contracts/review-publication-v1.schema.json`. That location is outside the suite's `bin/` and `scripts/` string scan, and `templates/` ships through the package `files` list (`package.json` line 83). This matches the out-of-process boundary I offered in R1. It implements the accepted spec's mandated identifier without weakening the regression. Residual visibility note in R2-F002.
- R1-F002 (critical path): fixed. I recomputed the longest path: 1→2→3→4→8→9→10→11→12 = 90. The corrected value appears in both locations (lines 66, 453).
- R1-F003 (preparation writers / key collision): fixed. Lines 83 and 459 limit preparation to shipped `aitm comment --key` / `aitm issue-body` with legacy fields. They forbid the v1 marker, Display- fields and future writers, and declare #1939's pre-v1 summaries as known-backheal inputs with a `1939-pre-v1` fixture owned by Task 12.
- R1-F004 (retention anchor): fixed. Line 81 and Task 7 add `artifact-retention.mjs`, requiring configured trunk ancestry or a verified protected append-only archive ref. Tasks 8 and 9 require retention before durable rendering or backup-published, and Task 10 re-verifies immediately before each retirement. Branch-only refusal tests use a disposable remote.
- R1-F005 (emitters): fixed. Task 1 inventories emitter sources and records that no baseline production per-round emitter exists. Ownership is split across Tasks 5, 8 and 12, and Task 8 tests key routing, effect counts and generated guidance.
- R1-F006 (lock/guard suites): suites added. However, the newly specified reclamation predicate introduces a liveness regression for every issue writer (R2-F001).
- R1-F007 (activation/topology): fixed. The switch is staged in `scripts/task-tracker/config.mjs` and `config-init.mjs` by Task 3 and flipped by Task 12 on eligibility, with enabled/legacy/missing-verifier/disabled-override tests. Integration runs on the `cut-epic-branch` parent branch with `merge-back` ancestry proof. All four entry points exist (`scripts/task-tracker/{config,config-init,cut-epic-branch,merge-back}.mjs`).
- R1-F008 (rename): declined with a reason. The parent's vc:3 names `review-record-publication.test.mjs`, so I accept the decline.
- R1-F009, R1-F010, R1-F011: accepted and reflected in Tasks 10, 11 and 1. Task 10 limits the initial loader to Codex, and Claude/GitHub sources refuse as unsupported. Tasks 3 and 11 add the catalog policy suites. Task 1 adds a staged-call-graph guard.

One required change remains, so the decision is revisions-requested.

Verification performed (read-only, no Git, no edits outside this response): full re-read of the plan and author response 1. Glob confirmed `scripts/task-tracker/config.mjs`, `config-init.mjs`, `task-tracker.mjs`, `bin/aitm-registry.mjs`, `cut-epic-branch.mjs` and `merge-back.mjs`, and that `templates/contracts/` does not exist yet (it is a proposed deliverable). Read `package.json` `files`, `scripts/sync-templates.mjs` mirror scope, and `issue-mutator-lock.mjs` lines 120–230. I did not recompute SHA-256 digests (no shell execution in this session), run tests or read live GitHub state. The author's report that the decommission suite currently passes 7/0 is their evidence, not mine.

## Findings

### R2-F001 — Required (P2): The revised lock predicate can wedge every issue writer and has no legacy, cross-host or recovery path

Location: Task 7 step 3 (line 301).

`issue-mutator-lock.mjs` is the canonical lock for all AITM issue writers, not only publication. Today (`tryReclaimStale`, lines 197–220) it handles three cases through the mtime backstop:

- a live same-host PID older than `ISSUE_LOCK_STALE_MS`, as a #656 PID-recycle defense;
- PID-less holders;
- cross-host holders.

The `startToken` nonce is in-process random (`PROCESS_START_TOKEN`, line 135). The code comment at lines 140–143 says the OS probe cannot interrogate another process's token. So "OS-observed process incarnation" is new data that must be captured at acquisition.

The revision states three rules:

- "Unknown incarnation for an alive PID refuses reclamation."
- "Foreign-host ambiguity stays fenced pending explicit authority reconciliation."
- The age backstop no longer reclaims an exact live incarnation.

Concrete failures:

1. **Upgrade.** `holder.json` files written by the current version carry no OS incarnation. If such a holder's PID has been recycled to an unrelated long-lived process, the incarnation is "unknown" and the PID is "alive", so the lock is never reclaimable. Every writer on that issue — timing, move-state, comment, body — blocks indefinitely.
2. **Unobservable platform or permission.** Where start-time/incarnation observation fails (EPERM, container PID namespaces, unsupported platform), the same permanent refusal applies.
3. **Cross-host.** A shared runtime root reached from another host whose holder crashed now fences forever instead of falling to the TTL backstop.

The plan names no operator recovery verb, diagnostic or authorization for these states. It also does not say whether the stricter predicate applies to all lock users or only to publication-authority holders.

Required resolution:

- Scope the stricter predicate explicitly. Either restrict it to publication/migration authority holders, or justify applying it to every writer.
- Define legacy behavior for `holder.json` files without incarnation: for example, retain today's backstop for those files only, with a diagnostic.
- Define behavior when incarnation is unobservable, and for cross-host holders of ordinary (non-publication) writers.
- Name a governed, audited operator recovery path for a refused stale lock, with its diagnostic code.
- Add tests for the legacy holder file, unobservable incarnation and cross-host ordinary writer, alongside the existing pid-liveness and reentrancy suites.

## Required changes

1. R2-F001: specify scope, legacy/unobservable/cross-host behavior and a governed recovery path for the revised issue-lock reclamation predicate, with tests.

## Optional suggestions

### R2-F002 — Optional: Record the #1592 boundary interpretation where approvers will see it

The R1-F001 resolution relies on two facts: the decommission scan covers only `bin/` and `scripts/`, and the identifier lives in a shipped data asset under `templates/contracts/`. It is transparent and arguably within #1592's intent, since AITM runs fully without the package and nothing is imported or declared. Still, it is an interpretation of a prior human decision. Add one sentence to the Independence section (or the plan-approve audit) stating this explicitly, so the human approving Plan → Develop sees the interpretation rather than inferring it.

Separately, `scripts/sync-templates.mjs` mirrors only top-level `templates/` files and the `references/` subtree (lines 70–119). State whether `templates/contracts/` is mirrored into `.ai-task-manager/templates/`, and resolve the runtime schema path package-relative so validation does not depend on a consumer mirror. Also confirm that the `templates.test.mjs` byte-identity guard stays consistent.

### R2-F003 — Optional: Name who updates Task 1's staged-call-graph guard

Task 1's guard asserts that no production caller of `writeArtifactReferences` exists before Task 8 admission and Task 12 activation. Task 4 and Task 8 legitimately introduce callers. State which task updates the guard's allowlist, and that the update only permits callers behind the activation/admission gate, so the guard is evolved rather than deleted.

## Decision

revisions-requested
