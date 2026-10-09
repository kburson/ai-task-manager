<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "e22473f927cdb0629651cdc94c1204ea7e621ca5"
artifact_blob: "c66c11455859d1a427f12fe84d6b5ef76541bbca"
artifact_digest: "sha256:9d35c258971ff176b2f9c2fb378272703e167218c64a5765e04c341a70f351a8"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:a61332222cbe845c78d9129912204d46ab1a1b7f6a919d8a24716e4bb56821d5"
  identity_source: "runtime"
started_at: "2026-10-09T02:18:47.881Z"
submitted_at: "2026-10-09T03:16:37.603Z"
finding_ids: ["R3-F001","R3-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Decision: revisions-requested. One required finding remains, and it is narrow: the location chosen for the new shared receipt index sits inside a tree that the existing #1857/#1862 runtime migration treats as a legacy source and blocks on. Everything else in round 2 is resolved.

I read the author's turn-2 response, the new section "Concrete production authority and deferred-session recovery" (plan lines 87–101), the reconciled transfer-contract lines (72–83), the updated startup table (lines 128–141), and the corrected ownership sentence (line 116). I then checked every existing API and path the new section cites against current source. I ran no shell, Git or test commands.

Verification of round-2 dispositions:

- **R2-F001: resolved in substance, with one location defect (R3-F001).** The plan now names concrete production evidence for both gates.
  - Departure-successor: the owner's own operation receipt. It is checked with `readOccupancy` plus `sameBindingGeneration` and advanced only after canonical read-back. A bare row, a digest or caller-supplied JSON is explicitly insufficient, which reconciles line 72.
  - Takeover: a native Codex `response_item` user `input_text` message containing the exact standalone `timing-handoff recover` command. It is re-read independently through the real resolver and filtered by `isInjection`. Prompt timestamps or a `/task` bind alone are rejected.

  The scope limit is explicit: same OS user and host only, cross-host refused, Claude/other-provider takeover refused until an equivalent adapter exists. The visible deferred message, the explicit refusal codes, and the permanent non-credit of pre-authorization contender work are all specified. Generation-safe crash states and production-shaped end-to-end tests now cover both dominant paths, using real resolvers rather than an always-verified callback.

  I confirmed the cited APIs exist:
  - `fleet-registry.mjs::findMainWorktreePath` (line 58)
  - `lib/occupancy.mjs::readOccupancy` (line 44)
  - `lib/evidence-v2/binding-generation.mjs::sameBindingGeneration` (line 23)
  - `word-counter.mjs::isInjection` (line 263)
  - `lib/workflow-policy/authority-resolver.mjs`

  I also confirmed that the `on-stop.mjs` hook no longer stages a pause, so it does not need a departure receipt path.
- **R2-F002: resolved.** Line 116 now assigns the handoff/journal/authority tests to Task 5 and the measurement/native-normalizer tests to Task 6.
- **R2-F003: resolved.** The four registration suites I suggested were added to Task 10's verifier.
- **R2-F004: resolved.** Task 4 Files now spells out the full `scripts/task-tracker/hook-handler.mjs` path.

The estimate (112 hours), ranks and dependency graph are unchanged from turn 2. I re-checked them then and they remain arithmetically consistent.

## Findings

### R3-F001 — Move the shared handoff receipt index out of the legacy `.db/aitm` tree that the runtime migration inventories and blocks on

Severity: medium. Required.

Plan location: line 91 says "a private, restrictive-permission shared receipt index at findMainWorktreePath(projectDir)/.db/aitm/timing-handoff/<repository-digest>/<issue>/<operation-id>.json, reached through the existing … paths.mjs authority root".

That location conflicts with the current runtime-storage contract on three points.

1. **`paths.mjs` has no `.db` authority root.** Its roots are `.tmp/aitm/...` (lines 25–265). The current #1857/#1862 runtime authority is `runtime-storage.mjs::runtimeStoragePaths` (lines 230–249), which resolves `<mainRoot>/.ai-task-manager/runtime/store` as the shared store and `<projectRoot>/.ai-task-manager/runtime/store` as the local store. The `.gitignore` comment at lines 43–48 describes `/.db/` as retired ("not SQLite authority (ADR 0002 / #1048)"), kept ignored only for a residual #1217 journal.
2. **The runtime migration treats `.db/aitm` as a legacy source and blocks on anything it does not recognise.** `lib/runtime-migration-plan.mjs` lines 137–162 inventory `path.join(root, '.db', 'aitm')` as `kind: 'legacy-durable'`. Every file found there must be accepted by `adapters.classifyLegacy`, with a `family` registered in `FAMILY_SCOPES` (lines 27–43). Otherwise the plan records `block('unknown-source', source)`. The `FAMILY_SCOPES` list has no `timing-handoff` family. The first retained receipt written to the proposed path would therefore make the existing runtime migration refuse on that repository. That contradicts the plan's Scope ("Keep … #1857/#1862 runtime authority intact") and line 91 itself ("never replacement GitHub timing authority … no runtime-storage migration").
3. **The ownership matrix does not cover the fix either way.** Adding a registered family, or classifying the new files in the migration, means editing `lib/runtime-migration-plan.mjs` and probably `lib/runtime-storage.mjs`. Neither file is assigned to any task.

This is a location and ownership decision, not a redesign. Required: pick one of the following, state it at line 91, and assign any touched runtime-storage files to Task 5 (or another single owner) with focused tests.

- (a) Place the index in the current shared runtime store (`runtimeStoragePaths(...).sharedRoot`) as a newly registered `shared`-scope family. Update `FAMILY_SCOPES` and the migration classification so inventories stay green. Add the existing runtime-migration and runtime-storage suites, such as `integration/task-tracker/lib/runtime-migration.test.mjs`, `runtime-migration-transaction.test.mjs` and `runtime-storage.test.mjs`, to that task's verifier.
- (b) Justify a different, already-sanctioned non-inventoried location, and prove with a test that the runtime migration plan ignores it rather than blocking.

Either way, add a negative test showing that a written handoff receipt does not cause `unknown-source` (or any other block) in the real runtime migration plan.

## Required changes

1. Resolve R3-F001: relocate the shared handoff receipt index from `<main>/.db/aitm/timing-handoff/…` to a location consistent with current runtime-storage authority, or prove that the migration ignores it. Assign any runtime-storage or migration file edits to a single task, and add the runtime-migration non-blocking regression to that task's verifier.

## Optional suggestions

### R3-F002 — Make the deferred-startup message provider-accurate

The deferred message at line 99 tells every deferred session to "send: timing-handoff recover …". Under line 89, a Claude or other-provider successor that follows that instruction always gets `takeover-user-source-unsupported`. The message should either print the provider-specific supported route, or say directly that recovery is unavailable for this provider. Also document the actual workaround for an unpaused lost owner when the successor is not Codex, for example taking over from a Codex session on the same host and then releasing through an owned departure. That way the operator guide does not advertise a command that cannot succeed for the session reading it.

## Decision

revisions-requested
