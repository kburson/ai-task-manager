# Reviewer response — plan review, round 2

Artifact: `docs/superpowers/plans/2026-09-22-1755-delivery-attribution-exception-reviewed-spec.md`

Spec pin: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md` at `0fc890a9`

Author response: `docs/peer-reviews/plan/2026-09-22-1755-delivery-attribution-exception-plan-review/author-response-1.md`

Reviewer: Claude Opus 5 (anthropic, claude-code)

Disposition: revisions-requested, final round. All five required findings and all five optional findings from round 1 are resolved. Three residual items remain, each a one-to-three sentence addition with no rework. I will accept on sight once they are in.

Protocol note: manual exchange document; claims no `peer-review` protocol event.

## Round-1 findings — all closed

- **P1-F001 — Closed, and I verified the four sites are sufficient.** I checked whether `bin/aitm-registry.mjs` is a fifth required edit: it is not. `command-manifest.test.mjs:57-61` asserts `[...VERBS].sort()` equals `[...taskVerbNames()].sort()` and that `groupedListing().verbs` matches, so the registry derives from the catalog rather than duplicating it. The revised Task 4 list — `task-tracker.mjs` dispatch, `command-surface/routing.mjs`, `command-surface/catalog.mjs` with all three metadata maps, `verbs/help-data.mjs` — is complete, and adding both parity tests to the Red and Green runs is the right placement. Dropping `scripts/lib/self-doc.mjs` is correct.
- **P1-F002 — Closed.** `npm run test:integration` is in the Task 7 gate, and the explicit note that `npm test` and `npm run quality` omit the integration lane prevents the gap from being reintroduced.
- **P1-F003 — Closed.** `// @story #1755` is now required at creation in Tasks 1, 3, 4, and on each of the new Task 5, 6, and 7 test files.
- **P1-F004 — Closed.** `node scripts/task-tracker/verify-develop.mjs` precedes every commit in all seven tasks.
- **P1-F005 — Closed, and the conservative option is the right one.** A dedicated exceptional-path reader leaves `inspectCommitObject`'s `'\n'` split — and therefore `matchesInspectedCommitTitle` and `inspectMergeCommit` — untouched, so the change stays additive. The CRLF fixture asserting parity with GitHub's `/\r?\n/` split is exactly the coverage that was missing.
- **P1-F006 — Deferral accepted.** Your reasoning holds: `git cat-file --batch` adds framing and length-prefix parsing to a security-sensitive verifier, and 222 spawns in a human-gated, once-per-delivery operation is a different cost profile from a test lane. Per-oid simplicity is the correct default here, and the measure-then-optimize condition is the right trigger. No further change requested.
- **P1-F007 — Closed, and the chosen path matches existing precedent exactly.** `scripts/tests/integration/task-tracker/lib/package-workflow-exception-smoke.test.mjs` already exists at the sibling path with the same naming shape, so `package-delivery-attribution-exception-smoke.test.mjs` needs no layout justification. The four-way split keeps each file well under the 800-code-line hard cap.
- **P1-F008 — Closed.** The named `buildCommitTextFromTokens({ issueNumber, prNumber, expectedHeadSha }, attributionTokens)` signature with both byte caps retained is precisely right.
- **P1-F009 — Closed.** Task 5's interface paragraph now states the `commitText` separation and cites the rest-spread that would otherwise leak keys into the exact-key intent builder.
- **P1-F010 — Closed; your refusal is better than my suggestion.** Rewriting `f761a9cc` and `0fc890a9` would invalidate the plan's own spec pin and the `artifact_commit` binding in the sealed round-1 spec review. Preserving the SHAs and auditing at Task 7 is the correct call. See P2-F003 for the one piece I would still like named.

## Residual findings

### P2-F001 — `PREFLIGHT_MODE` is the one registration knob still unnamed (required)

The four command-surface sites are complete for catalog and routing parity, but a new verb also has a runtime behavior knob the plan does not mention: `PREFLIGHT_MODE` in `scripts/task-tracker/task-tracker.mjs:75-120`.

`workflow-exception` deliberately has **no** entry there — I checked the map, and it is absent, so it dispatches without issue preflight (`task-tracker.mjs:174-176` returns early when the mode is null). By contrast `deliver: 'target-required'` (line 85) runs `preflightVerb` with binding and timer side effects.

This matters because the plan tells the implementer to follow `workflow-exception` for registration but to model the verb's `#N` positional on the delivery surface. An implementer adding `'delivery-attribution-exception': 'target-required'` by analogy with `deliver` would make read-only `prepare` and `show` trigger issue preflight and binding — side effects the spec explicitly forbids for `prepare` ("This inspection is read-only") and for `show` on non-Codex hosts. The parity tests will not catch it: `command-manifest.test.mjs` asserts `PREFLIGHT_MODE` only for the specific verbs it names, so a wrong new entry passes.

Fix: one sentence in Task 4 stating that the new verb takes **no** `PREFLIGHT_MODE` entry, matching `workflow-exception`, so `prepare` and `show` remain free of issue preflight and binding side effects.

### P2-F002 — Resolve the `package.json` conditional instead of leaving it open (required, small)

Both the file map and Task 7 say "`package.json` only if the packed file list needs it." That is answerable now, and leaving it conditional invites a late discovery during the package smoke step.

The `files` array already packs `bin/`, `skill/`, `scripts/` (with `!scripts/tests/**`, `!scripts/maintenance/**`, `!**/*.test.mjs`), and `docs/guides/`. Every artifact this plan creates or modifies for packaging — the new verb, both new libraries, `skill/shared/rules/deliver.md`, and `docs/guides/workflow.md` — falls inside those entries. **No `package.json` change is required.**

The one case that would require one is the workflow-exception precedent: that feature added its design spec as an explicit per-file `files` entry (`docs/superpowers/specs/delivered/2026-09-14-1624-workflow-exceptions-design.md`), and the existing smoke test asserts it in `REQUIRED_FILES`. If Task 7 intends to ship `2026-09-22-1755-delivery-attribution-exception-design.md` the same way, that needs both a `files` entry and a matching `REQUIRED_FILES` line in the new smoke test.

Fix: replace the conditional with the decision — "no `package.json` change is required; the new paths are covered by existing `scripts/`, `skill/`, and `docs/guides/` entries" — plus one sentence stating whether the design spec is packed like `workflow-exception`'s, and if so naming both edits.

### P2-F003 — Name the self-delivery route, do not leave it to merge time (optional)

Task 7's new audit bullet correctly flags that the earlier spec revisions lack `[#1755]`, but it stops one step short of the consequence, and that step is not obvious.

Traced concretely: `f761a9cc` ("docs: respond to delivery attribution exception spec review") and `0fc890a9` ("docs: address second delivery attribution spec review") contain neither `[` nor `#`, so `isUnattributedMergeCandidate` returns true and `classifySourceCommitSubjects` inspects them; each has a single parent, so neither is a verified merge, and both stay in the attributable set. `tokensFromSubject` then finds no `[#N]` marker and throws, and `sourceAttributionDiagnostic` reports `source-attribution-conflict` because other subjects on the branch *do* carry `[#`. **This branch cannot pass its own governed delivery gate.**

The remedy is mechanically available — AITM executes from the branch's own checkout, so the evaluator exists by the time delivery runs — but it means the feature's first production use is on the branch that introduces it, before it has landed on trunk. That is a defensible choice; it just should not be discovered at merge time.

Suggest Task 7 name the chosen route explicitly: self-application with its own recorded exception and its own Codex user authorization, or deferral until the documentation commits are re-attributed on a later branch. Whichever you pick, the bullet should also note that a self-applied exception's `record` step still requires a live Codex user message, so the delivering session's host is a planning constraint, not just an implementation detail.

## Required changes for round 2

1. **P2-F001** — State in Task 4 that the new verb takes no `PREFLIGHT_MODE` entry, matching `workflow-exception`, keeping `prepare` and `show` free of issue preflight and binding.
2. **P2-F002** — Replace the `package.json` conditional with the decision that no change is required, and state whether the design spec is packed as `workflow-exception`'s was (which would need a `files` entry plus a `REQUIRED_FILES` line).

## Optional suggestion

1. **P2-F003** — Name the self-delivery route in Task 7 and note the Codex-host constraint on the delivering session.

## Decision

revisions-requested — final round. Two one-sentence additions and one optional clarification; nothing in the task structure, interfaces, ordering, or test strategy needs to change. The plan is otherwise accepted as a faithful, implementable decomposition of the pinned spec.
