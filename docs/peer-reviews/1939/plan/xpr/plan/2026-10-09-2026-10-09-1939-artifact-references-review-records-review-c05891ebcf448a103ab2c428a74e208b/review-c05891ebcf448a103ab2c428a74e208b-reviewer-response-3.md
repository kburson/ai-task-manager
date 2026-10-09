<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-c05891ebcf448a103ab2c428a74e208b"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
artifact_commit: "2a06a6a4f94ee8a2e61f1c528f585a8638509f8d"
artifact_blob: "86fdb87538c8ed59b5ab99135265d4a70dec5934"
artifact_digest: "sha256:6f48a829a2d8ecf657585416def0f972215ffa1915410021c65d187b6340e5a0"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7904a355245b72934b2c8e0064efb0a23665315d643f3533dd7bd4df785214e1"
  identity_source: "runtime"
started_at: "2026-10-09T18:13:10.058Z"
submitted_at: "2026-10-09T18:36:06.774Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round 3 of the independent plan XPR. I read author response 2 and re-read the changed regions of the revised plan at the package-pinned commit/blob in protected frontmatter: the Independence section (lines 77–79), Task 1 interfaces (line 139), Task 7 delivery (lines 297–313) and Task 12 (lines 436–444). I checked each R2 disposition against that text.

Disposition assessment:

- **R2-F001 (lock liveness): resolved.**
  - Strict reclamation is now scoped to holders carrying Task 7's branded publication/migration admission and a versioned holder policy (line 301).
  - Ordinary writers keep today's TTL/PID backstop, with an explicit legacy-policy diagnostic. This covers legacy `holder.json` files without incarnation, ordinary unobservable platforms and ordinary cross-host holders. So the existing #656 behavior in `tryReclaimStale` is preserved for every timing, state and body writer.
  - Strict holders capture an OS-observed incarnation at acquisition. If the platform cannot supply it, they refuse acquisition before any remote effect, so an unobservable strict holder can never exist mid-effect (line 302). Uncertainty yields the named diagnostic `artifact-publication-lock-uncertain`.
  - A governed `inspect|reconcile|recover-lock` path requires independently verified owner death or fencing plus effect reconciliation. A human statement alone cannot declare a live owner dead, there is no raw force/unlink flag, a durable audit precedes exact-holder release, and drift re-previews (line 303).
  - Tests now name the legacy-holder, unobservable, cross-host, strict-uncertainty and recovery/drift cases, alongside the existing pid-liveness and reentrancy suites (lines 304, 313).
- **R2-F002 (#1592 interpretation visibility, schema path): resolved.**
  - The interpretation is stated explicitly and routed into the Plan-approval audit (line 77).
  - Schema lookup is package-relative, beside the owning module. `templates/contracts/` is intentionally not mirrored, and the sync-templates scope and `templates.test.mjs` byte-identity guard stay unchanged.
  - Task 5 proves the packed asset in a disposable consumer, and Task 12 confirms mirror parity.
- **R2-F003 (staged-call-graph guard ownership): resolved.** Tasks 4, 8 and 12 each own a bounded extension of the guard, and it is retained rather than deleted (line 139).

All required findings from rounds 1 and 2 are closed. Every substantive point from my R1 review is now answered in the plan: the #1592 boundary, the 90-hour critical path, preparation writers and key collision, the retention anchor, the emitter inventory, the lock/guard suites, activation and integration topology, the human-authorization source, catalog files and the writer guard. The two items below are optional consistency notes and do not block acceptance.

Verification performed (read-only, no Git, no edits outside this response):

- Read author response 2 in full and the changed plan regions listed above.
- Grepped the plan for each R2 term (strict, incarnation, recover-lock, #1592, package-relative, allowlist, sync-templates).
- Relied on the round-2 reading of `issue-mutator-lock.mjs` lines 120–230 and `scripts/sync-templates.mjs` scope.
- Not performed: SHA-256 recomputation (no shell execution in this session), test runs or live GitHub reads.
- The author's checks (task extraction, split proposals, governed-plan policy, formatting) are their evidence, not mine.

## Findings

None required.

## Required changes

None.

## Optional suggestions

### R3-F001 — Optional: List Task 7's new verb file and catalog verification

Task 7 step 4 (line 303) adds `scripts/task-tracker/verbs/artifact-publication.mjs` with catalog, registry and dispatch parity. However:

- Task 7's **Files** line (297) does not list that verb, `lib/command-surface/catalog.mjs`, `bin/aitm-registry.mjs` or `task-tracker.mjs`.
- Task 7's verification (line 313) omits `command-catalog-policy.test.mjs` and `command-catalog-parser-policy.test.mjs`, which Tasks 3 and 11 include for the same surface.

Add them during hydration so the child's owned paths and declared VCs match its steps. Task 11 later edits the same catalog files; the DAG already keeps 7 before 11.

### R3-F002 — Optional: Note Task 7 scope growth and the Codex-only recovery limit in the estimate basis

The recovery control (human-source validation, owner-fencing proof, effect reconciliation, audit and receipt) is real additional work inside Task 7's unchanged 12 hours. Recovery also inherits Task 10's Codex-only authorization source, so a Claude-hosted operator cannot clear an uncertain strict publication lock without a Codex session. Ordinary writers are unaffected. Record both points in the Task 7 estimate notes or the rollout limitations, so the JIT forecast and operators are not surprised.

## Decision

accepted
