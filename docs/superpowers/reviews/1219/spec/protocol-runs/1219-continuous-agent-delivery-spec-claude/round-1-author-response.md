# Round 1 Author Review Package — #1219 Specification

## Authority

- Protocol review artifact: `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
- Protocol artifact commit: `c685199a0729d4792c4c120b2d30d41716a1b077`
- Current trunk comparison baseline: `07984e5137ba53f56fe062a351e5dd4111fb87bd`
- The artifact bytes at the protocol commit and current trunk are identical.
- PR #1511 merged the #1219 planning documents at `91e65af227047f0c7e846c3ea75fe652f35b8dab`.
- #1512 implementation commit `99bec143fd3c6401076da84ab78fefe65d054d60` is included in the current trunk baseline.

Review the immutable protocol artifact at `c685199a...`. Inspect all comparison code and documents at `07984e...` with `git show 07984e5137ba53f56fe062a351e5dd4111fb87bd:<path>` so the governed branch's two-commit lag does not hide #1512.

## Review scope

Be skeptical and read-only. Check the specification against:

- `docs/superpowers/specs/2026-09-01-1219-cloud-test-stage-design.md`
- `docs/superpowers/plans/2026-09-01-1219-cloud-test-automation.md`
- `docs/superpowers/plans/2026-09-02-1219-cloud-test-portfolio-wbs.md`
- `docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md`
- #1219 and the live #1220-#1247 hierarchy and pinned child contracts
- #1512's issue contract, design, plan, `skill/shared/rules/full-auto.md`, `gate-resolve.mjs`, `manual-code-review.mjs`, `deliver.mjs`, and `review.mjs`
- #1485's design and delivered `merge-back.mjs` / `resolve-epic-lineage.mjs` repair
- #1486's live issue scope and graph/dependency position
- #1488 where its Review-bind repair affects lifecycle assumptions

Validate these boundaries:

1. Full-Auto remains the default while manual plan, manual code, and manual task review remain independent and additive.
2. Spawned-agent flow review is not confused with requested human exact-head PR approval. Determine precisely what manual code review replaces and whether any spawned review remains authoritative or even runs.
3. Test owns authoritative CI, code-review disposition, merge, readback, and delivery receipt. Review is collateral-only and cannot change repository files, run functional tests, merge, or demote to Develop.
4. Candidate-controlled code cannot parse, validate, or execute its own authorization. A runtime identity field or candidate-loaded resolver is not sufficient; trace the real `npx aitm` / self-link execution path.
5. Source, base, PR head, target ref/head, review, merge action, and receipts remain exact-generation authority.
6. Child stories deliver to their immediate epic, nested epics to their parent, and root/standalone work to trunk. Reconcile the amendment's per-issue PR language with the preserved non-trunk `merge-back.mjs` path and #1485's opaque custom-branch authority.
7. Recovery and migration remain append-first, idempotent, exact-head, and unable to manufacture authority from trailers or projections.
8. Parent epics aggregate immutable child receipts but still run one combined target-boundary verification cycle.
9. The actual custom target `cloud-test-automation` is protected by the intended target-branch policy rather than assumed to match `feature/epic/*`.
10. Cross-provider assurance remains post-close, append-only, non-blocking, and bounded against speculative defect chains.

## Live evidence snapshot

- #1219 and #1220: Develop.
- #1226: Review.
- #1221-#1225, #1227, #1228: Ready for Planning.
- Remaining #1229-#1247 children: Backlog.
- #1485, #1488, #1512: Done.
- #1486: Backlog, no parent, no children, and no recorded #1219 dependency.
- The live repository currently exposes only the active `Protect trunk` branch ruleset.
- #1219 still declares the original six-sub-epic, 22-child decomposition.

Treat these as leads requiring verification, not inherited findings:

- the specification's binary Full-Auto/human language may conflict with #1512's three independent controls;
- mandatory flow review before human approval may conflict with manual-code-review replacement semantics;
- the trusted-runtime section may lack an executable non-candidate bootstrap in the plan/current runtime;
- the hierarchical section may silently replace or omit governed non-trunk merge-back;
- custom epic protection may omit `cloud-test-automation`;
- migration through #1237 may be circular because #1237's contract is itself replaced.

## Finding standard

Do not edit anything or create issues. A blocker requires direct repository evidence, material impact on #1219, and the smallest sufficient correction. Do not daisy-chain speculative defects. Give every finding a stable marker such as `[finding:F-001]` so the author can answer it through the mux. Cite exact pinned-SHA file and line references; for GitHub-only evidence, cite the issue and exact section/field.

Use this review structure:

1. Verdict: ACCEPT or REVISE
2. Blocking findings
3. Non-blocking follow-ups
4. Optional improvements
5. #1486 sequencing verdict: REQUIRED BEFORE #1219, ADVISABLE CLEANUP NOT A PREREQUISITE, or UNRELATED
6. #1512 compatibility verdict: COMPATIBLE or INCOMPATIBLE
7. Questions for the author
8. Reviewed SHA and evidence inventory

For each blocker, name the violated invariant, evidence, concrete failure mode, smallest sufficient correction, and owning artifact. Map ACCEPT to the protocol `accepted` decision and REVISE to `changes-requested`.
