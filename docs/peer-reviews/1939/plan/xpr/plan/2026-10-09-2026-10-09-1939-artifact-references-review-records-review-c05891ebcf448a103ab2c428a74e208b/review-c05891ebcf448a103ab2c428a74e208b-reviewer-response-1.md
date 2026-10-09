<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-c05891ebcf448a103ab2c428a74e208b"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md"
artifact_commit: "092a51e74ce4a794d2b6240c5fee714c611ccae5"
artifact_blob: "ab77e9c259319275d0b1d4ec80fd5acdfa077995"
artifact_digest: "sha256:9995905f1f17a3e0c24928ed7a34a83d550d56d53f09889797c902f692a55ddd"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:7904a355245b72934b2c8e0064efb0a23665315d643f3533dd7bd4df785214e1"
  identity_source: "runtime"
started_at: "2026-10-09T18:13:10.058Z"
submitted_at: "2026-10-09T18:18:08.308Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010","R1-F011"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent cross-provider plan XPR of `docs/superpowers/plans/2026-10-09-1939-artifact-references-review-records.md` at the package-pinned commit/blob in protected frontmatter, read in full together with the accepted specification `docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md` (read in full from the local working copy).

The plan is thorough on contract shape, budgets, role/legacy parity, fail-closed resolution, the SPR-driven split between non-enabled components and Task 8 production assembly, and separately authorized backheal. However, it misses one hard repository contract that directly contradicts Tasks 5, 8 and 12: the #1592 peer-review decommission regression suite forbids AITM production sources, dependency manifests and current operator docs from referencing or loading `ai-peer-review`. As written, the plan cannot be implemented without either breaking that suite or silently overriding a prior governed decision. It also contains a critical-path arithmetic error, a preparation-recipe step that relies on capabilities this plan has not yet delivered, an unspecified retention anchor for the "published backup" that justifies irreversible comment deletion, and several ownership/verification gaps.

Decision: revisions-requested.

Verification performed (read-only, no Git, no edits outside this response):

- Confirmed existence of every named existing module and test suite with Glob: all 17 existing `scripts/task-tracker/lib/*.mjs` seams, `issue-mutator-lock.mjs`, `backfill-plan-metadata.mjs`, `verbs/split-plan.mjs`, `verbs/comment.mjs`, `evidence-v2/execution-context.mjs`, `evidence-v2/journal-authority.mjs`, `skill/adapters/{codex,claude}/SKILL.md`, and all 16 existing test files named in verification commands. None is missing.
- Confirmed `issue-body-mutate.mjs` already calls `findLostMarkers` and `validateMarkerAdvances` from `body-invariants.mjs` (lines 125–128), so Task 1's protection registration does reach the canonical transaction without Task 1 editing `issue-body-mutate.mjs`.
- Read `scripts/tests/integration/review/peer-review-decommission.test.mjs` in full (basis of R1-F001).
- Read `issue-mutator-lock.mjs` reclamation predicate (lines 182–216) and located existing lock suites (basis of R1-F006).
- Grepped AITM `scripts/task-tracker`, `skill`, `templates` for review-summary/round comment emitters and the installed standalone runtime `src/` for GitHub comment publication (basis of R1-F005).
- Located `workflow-policy/authority-resolver.mjs` human-authorization helpers and `lib/command-surface/catalog.mjs` (basis of R1-F009, R1-F010).
- Recomputed the dependency longest path from the table (basis of R1-F002).
- Not performed: raw SHA-256 recomputation of the artifact or specification (shell execution was unavailable in this session); no tests run; no live GitHub reads of #1939 comments.

## Findings

### R1-F001 — Required (P0): Tasks 5, 8 and 12 contradict the #1592 peer-review decommission contract

Locations: Global constraints line 29 (schema `ai-peer-review.review-publication/v1`); Task 5 files/steps (lines 225–237); Task 8 step 1 and step 6 (lines 312, 317); Task 12 files/steps (lines 419, 423); Context line 25.

`scripts/tests/integration/review/peer-review-decommission.test.mjs` (`@story #1592`) enforces, as a standing regression:

1. No `ai-peer-review` entry in `dependencies`, `devDependencies`, `optionalDependencies` or `peerDependencies`, and no `ai-peer-review` package key in `package-lock.json` (lines 96–104).
2. No non-test `.mjs`/`.json` file under `bin/` or `scripts/` may match `/ai-peer-review|peer-review-adapter|cachePeerReviewStatus/` (lines 109–119).
3. The task CLI must start when any `ai-peer-review` import is made to throw (lines 64–91).
4. `README.md`, `docs/guides/workflow.md`, `skill/shared/rules/review.md` and five other current operator docs must not mention `ai-peer-review` or "installed `peer-review`", and `review.md` must keep "Artifact review is independent of AITM" (lines 135–157).

Concrete conflicts:

- Task 5 creates production `scripts/task-tracker/lib/peer-review-publication-adapter.mjs` that must validate/negotiate the schema string `ai-peer-review.review-publication/v1` (Global constraints) — any such literal fails check 2. Task 6's `review-publication-contract.mjs` validating the same envelope fails it too.
- Task 8 step 1's production factory injects "Task 5's actual producer verifier" and a "real pinned producer package". Loading it in production implies an `ai-peer-review` import (check 3 risk) and, if declared, a manifest/lock entry (check 1). The plan never says how the production process obtains the verifier.
- Task 5/8 integration tests "use its verified packed tarball"; the plan does not say where the tarball lives or how it is installed. Installing it as a devDependency fails check 1.
- Task 12 updates "shared task guidance" and adapters for the compatible producer; mentioning the producer in the listed docs fails check 4.

Neither the plan's Context nor its inspected-seams list mentions #1592 or this suite, and the accepted spec does not either. This is a governed-decision conflict between the accepted #1939 spec and a prior shipped decision, not something a worker should resolve locally (e.g., by editing the regression test or obscuring identifiers).

Required resolution: surface this to the human as an explicit decision and record it in the plan before hydration. Acceptable shapes include (a) a sanctioned, recorded amendment of the #1592 contract scoped to exactly what #1939 needs (which files may reference the schema identifier, whether a runtime dependency or an out-of-process verifier invocation is permitted, which docs may mention it), with the decommission test updated by an owning task under that authority; or (b) a spec-level amendment that keeps AITM independent — e.g., an AITM-owned neutral envelope schema identifier and an out-of-process, operator-configured verifier boundary with no package import or manifest entry — with the standalone producer adapting to it. Either way, the plan must name the owning task for any decommission-test change, state where the pinned tarball fixture lives (under `scripts/tests/fixtures/` or equivalent, not in `package.json`/lock), state how production obtains the verifier, add `peer-review-decommission.test.mjs` to Task 5, Task 8 and Task 12 verification commands, and add this suite to the Context/inspected-seams evidence.

### R1-F002 — Required (P1): Dependency critical path is 90 hours, not 100

Locations: Plan Metadata Estimate basis (line 66); Cross-repository and estimate controls (line 439).

From the dependency table: 1(10) → 2(12) → 3(12) → 4(8) → 8(10) → 9(10) → 10(10) → 11(12) → 12(6) = 90. The alternative branches into Task 8 are shorter (1→2→6 = 32, 1→5→6 = 32, 1→7 = 22, versus 1→2→3→4 = 42). Task 9's other prerequisite (Task 7) and Task 12's others (3, 4, 5) are all earlier. The 124-hour sum and wave numbers are correct; only the longest-path figure is wrong, and it is repeated in the Estimate basis that feeds the forecast gate.

Required resolution: correct both occurrences to 90 hours (or show the edge that makes it 100 if one is missing from the table).

### R1-F003 — Required (P1): Preparation recipe step 3 relies on writers this plan has not built and risks an owned-key collision

Location: Plan review and preparation recipe step 3 (line 445); also step 1 vs. Global constraints line 31.

Step 3 says to "Update one stable plan SPR and one stable plan XPR summary and immutable accepted-plan metadata using governed writers". The governed consolidated writer (`publishReviewRecord`, Task 8), the protected v1 marker and validated writer (Task 1), and the Display- projection (Task 4) do not exist during preparation. The only governed writers available are the existing `aitm comment --key` and `aitm issue-body` lanes with legacy fields. The recipe does not say so, which invites two concrete failures:

- A preparer hand-writes an `aitm-artifact-references` marker or Display- fields into live #1939 before Task 1 registers protection; ordinary normalizers may then drop or mutate it without `MarkerLossError`, and Task 4 enrollment later meets an unvalidated pre-existing marker.
- A preparer creates owned comments using the spec's future keys (`review.implementation-plan.spr`, `review.implementation-plan.xpr`) in a pre-v1 format. Task 8 step 3/5 and the spec's publication step 4 refuse to overwrite owned-key comments with unrecognized bytes, so #1939's own summaries would block the first real publication and require backheal.

Required resolution: state explicitly which existing writers and legacy fields preparation uses; forbid writing the v1 marker, Display- fields or Task 8 owned keys on live issues before Tasks 1/4/8 activate; and either use a distinct pre-v1 owned key or declare #1939's preparation summaries as known backheal inputs with a recognized format fixture.

### R1-F004 — Required (P1): "Published at immutable origin" lacks a retention anchor before irreversible retirement

Locations: Task 8 step 2 (line 313); Task 9 steps 3–4 (lines 342–343); Task 10 step 4 (line 370); Task 11 step 4 (line 397).

The plan verifies that evidence and backups exist at an origin commit, but not that the commit stays reachable. A commit reachable only from a feature/worktree branch becomes unreachable after branch deletion, force-push or squash merge; GitHub blob URLs to such commits can stop resolving after garbage collection. Task 10 then deletes historical comments (unrecoverable numeric IDs, per Task 11 step 4) on the strength of a "backup-published" state whose bytes may later vanish. Summary/round links from Task 8 have the same durability gap.

Required resolution: define the retention anchor (for example: reachable from the configured trunk ref, or from a dedicated protected archival ref/tag created and verified through the API) as a precondition of `backup-published` and of durable-link rendering; re-verify reachability immediately before each retirement effect; add refusal tests for an evidence commit that exists remotely but is reachable only from a deletable branch.

### R1-F005 — Required (P2): Legacy emitters to be disabled are never identified

Locations: Task 8 step 6 (line 317); Acceptance Criteria item 4 (line 55); Task 12 step 3 (line 423).

The spec requires disabling "separate round, author-response, manifest and acceptance comment emitters" once compatible publication is active. AITM contains no such emitter code after #1592 (grep of `scripts/task-tracker`, `skill`, `templates` for review-summary/round keys returns nothing), and the installed standalone runtime writes review-record files locally rather than posting GitHub comments. The current per-round comments therefore come from agent/operator guidance and ad-hoc `aitm comment` usage. "Activate replacement emitters … Preserve legacy emitters otherwise" has no concrete target, so AC4's "legacy-only … do not enable replacement publication" is untestable.

Required resolution: make Task 1's inventory enumerate emitter sources explicitly (skill/adapter text, templates, workflow guidance, standalone skill text, operator recipes) and assign the task that changes or gates each; state whether "disabling" means guidance changes only, and how a test observes legacy-only versus compatible-v1 emitter behavior.

### R1-F006 — Required (P2): Lock and guard changes omit existing regression suites; lock-semantics change needs a stated discriminator

Locations: Task 7 step 3 and verification (lines 287, 296); Task 10 files and verification (lines 365, 378).

Task 7 changes `issue-mutator-lock.mjs` reclamation, but its verification omits the existing `scripts/tests/integration/task-tracker/lib/issue-lock-pid-liveness.test.mjs` and `scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs`. The current predicate (lines 182–216, #656) deliberately lets the mtime backstop fire beyond `ISSUE_LOCK_STALE_MS` for a same-host "live" PID as a PID-recycle defense. "An authenticated live holder cannot be reclaimed solely because its mtime exceeds the backstop" reverses that for all lock users, not just publication; the plan must state what authenticates liveness (e.g., the existing per-incarnation nonce) so a recycled PID still reclaims, and test both.

Task 10 modifies `gh-edit-guard.mjs` protection but its verification omits `scripts/tests/unit/task-tracker/lib/gh-edit-guard-body.test.mjs`, which Task 1 extends for the same file.

Required resolution: add those suites to the respective verification commands and state the liveness discriminator plus a recycled-PID regression case in Task 7.

### R1-F007 — Required (P2): No task owns flipping the activation switch, and the integration SHA topology is undefined

Locations: Task 3 step 5 (line 177); Task 4 interfaces (line 206); Task 8 interfaces (line 319); Task 12 steps 4–5 (lines 424–425); Acceptance Criteria 1–3.

Tasks 3/4 ship `readSupportEnabled: false`; Task 8 "completes assembly"; Task 12 "authorizes default read/writer rollout only from the resulting eligibility report" and "Record[s] rollout stages". No task names where the switch lives (code constant, `.ai-task-manager/task-tracker.json` key, installed config), who changes the default, or which test proves enabled-default behavior. If nobody flips it, the parent's AC1–AC3 (operational parity) are satisfied only in fixtures and the feature ships dark; if a worker flips it ad hoc, there is no gate. Separately, Task 12 runs full gates "after prerequisite children reach Review" — children in Review are not yet merged, so the plan must say which branch/SHA integrates them (trunk after each child's close, or a parent integration branch) for the "exact-SHA evidence" to be meaningful.

Required resolution: name the switch location and its owning task, the condition and test for enabling read support and dual-compatible writers by default, and the branch/merge topology Task 12 integrates against.

## Required changes

1. R1-F001: obtain and record an explicit human decision reconciling #1939 with the #1592 decommission contract; update Tasks 5, 6, 8 and 12 (files, tarball location, production verifier acquisition, docs scope) and add `peer-review-decommission.test.mjs` to their verification; cite the suite in Context.
2. R1-F002: correct the critical path to 90 hours in both locations.
3. R1-F003: restrict preparation step 3 to existing writers/legacy fields, forbid premature v1 marker/Display-/Task 8 owned-key writes, and resolve the owned-key collision.
4. R1-F004: define and verify a retention anchor for published evidence and backups; re-verify before each retirement; add refusal tests.
5. R1-F005: inventory and assign concrete legacy emitter sources and a testable disable/preserve contract.
6. R1-F006: add existing lock and guard suites to Task 7/Task 10 verification; specify the live-holder discriminator and recycled-PID test.
7. R1-F007: assign activation-switch location/ownership/test and define Task 12's integration topology.

## Optional suggestions

### R1-F008 — Optional: Rename Task 6's unit suite

Task 6's modules are `review-publication-contract.mjs`, `manual-review-record.mjs` and `review-summary-renderer.mjs`, but its suite is `scripts/tests/unit/task-tracker/lib/review-record-publication.test.mjs` — named after Task 8's `review-record-publication.mjs`, which also has an integration suite of the same basename. Rename Task 6's suite (e.g., `review-publication-contract.test.mjs`) to keep per-module ownership obvious.

### R1-F009 — Optional: Reuse the existing human-authorization source in Task 10

`scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs` already exports `hashAuthorizationStatement`, `validateAuthorizationSource`, `resolveWorkflowExceptionAuthority` and `createCodexSessionSourceLoader`. Name it as the basis for "fresh supported-host human transcript" verification. Note that only a Codex session loader exists today, so a Claude-hosted maintenance task would refuse authorization unless a loader is added; state whether that is in Task 10's scope.

### R1-F010 — Optional: Name the command-catalog files for Task 11

"Register the new governed verb/help through the current command catalog" should name `scripts/task-tracker/lib/command-surface/catalog.mjs` and `bin/aitm-registry.mjs`, and add `command-catalog-policy.test.mjs` / `command-catalog-parser-policy.test.mjs` to Task 11 verification.

### R1-F011 — Optional: Keep Task 1's writer unreachable from production until Task 8

`writeArtifactReferences` is exported by Task 1, well before Task 7 enrollment and Task 8 assembly. State that no verb, CLI or backfill path may call it until the Task 8 activation gate passes, and add a small guard test asserting no production caller exists before then; otherwise an early caller can create v1 markers on issues that have no durable enrollment, defeating `artifact-authority-lost` detection.

## Decision

revisions-requested
