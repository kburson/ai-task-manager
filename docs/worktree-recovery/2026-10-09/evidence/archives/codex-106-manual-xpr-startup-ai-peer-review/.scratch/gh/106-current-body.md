<!-- aitm-last-known-state state="test" ts="2026-09-27T00:35:15.003Z" -->
<!-- aitm-refine-complete ts="2026-09-26T23:32:17.406Z" -->

## User Story

As a peer-review operator using Codex as author and Claude as reviewer
I want to run manual XPR startup, launch, and join that honor the selected transport and capture genuine provider evidence
So that a review can reach an authoritative reviewer submission without environment surgery or weakened identity checks

## Scope

Repair the three integration failures reproduced while starting the issue #102 design XPR from Codex with Claude Opus 5. Manual broker startup must register authority and return the supported handoff without dispatching to a worker that cannot launch. The CLI Claude launcher must capture the genuine stream observation required by runtime-assured join, using the existing production stream machinery. Explicit manual participation must remain manual despite inherited official resume configuration, including declared-identity joins. Preserve exact permissions, session separation, reviewer selection, same-session resume, and event-authoritative submission.

## Reproduction

1. Start a clean tracked spec with Codex author, reviewer-provider claude, reviewer-model claude-opus-5, reviewer-effort medium, transport-mode manual, using an installed current package and built broker helper.
2. Observe APR_TRANSPORT_UNAVAILABLE: Broker worker has no validated reviewer launch capability. Authority remains awaiting-reviewer, startup stage registered.
3. Use the generated launch-reviewer command with runtime model metadata. Claude starts but join fails APR_CLAUDE_SESSION_INVALID: Claude stream observation cannot be read safely. No reviewer is registered.
4. Configure supported declared Claude model identity instead, with an inherited official Claude resume command. Join fails APR_TRANSPORT_UNAVAILABLE: A declared reviewer registration cannot claim an unverified non-manual transport.

## Root Cause

activateStartup dispatches broker launch whenever the adapter exposes launch, even for manual mode; createProductionReviewWorker deliberately makes manual workers recovery-only. The launch-reviewer CLI supplies plain execFile to runClaudeReviewerLaunch while the production Claude adapter supplies createClaudeStreamingExec plus createClaudeStreamRecorder; runtimeObservationForJoin therefore has no observation to read. CLI join selects resume-only from configuredResume even when sealed startup transport is manual, conflicting with the declared-identity guard.

## Fix Direction

Use the sealed transport to choose manual registration versus automatic dispatch and participant capability. Share the existing stream-capture path for actual CLI launch/resume instead of synthesizing observations or disabling checks. Add failing regression tests at public startup and CLI boundaries; preserve automatic behavior, independent session checks, exact command/response permissions, and explicit declared evidence labeling. Validate one live manual review before completion.

## Out of Scope

The #102 installation-policy design and its unfinished XPR content; replacing the broker; broad config schema redesign; global installation changes; fabricated identity/session/submission evidence; weakening reviewer Git or permission boundaries.

## Story Origin

- **kind**: code
- **discovered-from**: issue #102 design XPR startup
- **trigger**: manual startup refused broker launch; Claude join refused missing stream evidence, then inherited resume capability
- **review-id**: review-7e2f728a783cebdbe3659714f0dc0480
- **source-head**: 71133938e8de94958facab026d43a1c3f87a80a3
- **authorization**: User requested filing the defect and delivering it to Done in this chat.

## Plan Metadata

- **Delivery-boundary**: Manual Claude XPR startup, exact-session stream capture, and transport-consistent join.
- **Plan-source**: Current Deep-Dive Analysis on this issue.
- **Verification**: Targeted production-path regressions, full deterministic suites, and a real manual reviewer submission.

## Pickup Directive — MANDATORY, DO NOT SKIP

> Follow: `.ai-task-manager/templates/pickup-directive.md`

<!-- aitm-deep-dive-posted ts="2026-09-26T23:34:58.783Z" -->

<details>
<summary>Deep-Dive Analysis (collapsed on plan approval — expand if revisiting scope)</summary>

## Deep-Dive Analysis (2026-09-26)

> Mirrored from comment #issuecomment-5850942262 (https://github.com/kburson/ai-peer-review/issues/106#issuecomment-5850942262). Comment is the diff-history canonical; this body copy is the gate-canonical source.

### Scope and observed failures

This bounded repair implements the user-approved three-part correction to manual Claude XPR startup. Issue #102 is the affected consumer; its design and review state stay untouched in the original e7c0 worktree. The defect branch starts from origin/trunk and contains only review-tool repair and evidence. The real launch reached Claude Opus 5 successfully, so authentication is not the failure.

### Story Intent

- **Beneficiary:** Peer-review operator using Codex as author and Claude as reviewer.
- **Capability:** Start a manual XPR and reach an attributable reviewer decision with the selected transport and genuine provider identity evidence.
- **Need:** Broker startup dispatches an unsupported manual-worker launch, CLI launch omits the stream observation required by join, and inherited resume settings contradict manual participation.
- **Value or failure prevented:** Independent reviews can proceed without repeated failed launches, manually constructed permissions, or weakened identity validation.

### Source analysis and implementation

1. In `src/startup/runtime.mjs`, keep runtime pinning, authority creation, and broker registration. Once the selected transport is manual, persist the existing manual startup journal state and return the sealed invitation. Do not request a broker launch for the recovery-only worker. Preserve automatic-required dispatch and refusal behavior. Existing tests that intentionally model broker launching must select an automatic transport rather than depending on the incorrect manual dispatch.
2. In `src/cli/run.mjs`, wire actual launch-reviewer execution through `createClaudeStreamRecorder` and `createClaudeStreamingExec` from `src/providers/claude-stream.mjs`, using `claudeJoinCommand` and the exact review ID. Capture real provider init/tool-use events before executing join. Keep the public runner, outcome classifier, exact Bash/Edit permissions, private session state, and same-session resume unchanged. Avoid hand-written observations and keep injection seams limited to the existing process boundary. Actual model metadata must reflect the requested/observed Claude model; inherited author identity stays removed.
3. In the CLI join capability selection, derive manual capability when the sealed review explicitly selected manual, even when configuration includes an official resume command. Do not disable resume for reviews that selected resume-only, and retain declared-identity rejection for non-manual modes. Apply consistent startup capability selection where necessary.
4. Add `test/integration/manual-xpr-startup.test.mjs` for the real startup/CLI paths. First reproduce all three failures. Tests must not inject pre-created stream observations or force the transport capability being tested. Use a provider-process fixture for deterministic stream events and actual protocol join; retain explicit identity mismatch, malformed stream, and resume coverage in the existing suites. Update narrowly affected fixtures where their incorrect manual-launch assumption is exposed.
5. Run a real manual review with the installed repaired package, a native helper matched to this Node version, Codex as author, and Claude Opus 5 at medium effort. Only an event-authoritative reviewer decision proves success. Record a privacy-safe durable evidence document with artifact/response hashes and role/model facts; never commit raw provider handles or scratch authority. Add `scripts/verify-manual-xpr-evidence.mjs` to validate the committed evidence and linked durable response content, refusing missing or inconsistent evidence. Repeat or repair until the true live path succeeds.

### Verification strategy

Run the new regression file before implementation and confirm expected failures. Then run targeted startup/CLI/identity/stream tests. Complete unit/golden, integration/MCP/smoke, packaging, lint, and formatting verification at the final committed shape. The governed Test boundary owns the final exact-SHA verification receipt. The live proof is separate from deterministic fixtures and must be labeled accordingly.

### Risks and mitigations

The CLI and provider adapter currently duplicate launch wiring; reuse the existing recorder/streaming executor rather than inventing another observation format. Stream capture must arrive before join and use the exact command and session. Structured provider errors must still produce bounded diagnostics, and successful process exit alone is never acceptance. Manual mode must not silently grant automatic capability. Existing automatic broker behavior is protected by its regression tests. Native addon availability and installed-package layout are environment prerequisites, not reasons to weaken package runtime checks. Production provider access may fail independently of code; preserve receipts and report a genuine blocker if it occurs.

### Dependency map

Depends on: none; the required provider recorder and identity protocol already exist on trunk.
Blocks: #102 design XPR startup.
Sibling sub-issues: none; the three failures form one manual-start-to-submission integration path.

### Full-Auto Plan-Approval Audit — #106

The user explicitly requested filing this defect and delivering it to Done. Scope remains the three diagnosed startup defects and their verification. Stakeholder: real review operator. Capability: manual review reaches an attributable submission. Need: reproduced startup/join refusals. Counterfactual value: reviews no longer stall or demand unsafe environment/permission surgery. Source grounding: current production startup, worker factory, launcher, identity and transport code plus observed errors. Sibling distinctness: #102 is installation policy design and #91 addressed later-turn declared identity, rather than this initial manual-start path. Standalone readability: the issue story and reproduction describe actor, failure and expected outcome without a linked plan. All seven semantic questions pass. No workflow exception or fabricated evidence is requested.

<!-- aitm-owned-comment key="deep-dive.analysis-v1" -->

</details>

## Acceptance Criteria

- [x] Manual broker-owned XPR startup completes registration and returns a manual handoff without dispatching an automatic launch; automatic startup retains its validated launch behavior. <!-- aitm-verified exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (node --test test/integration/manual-xpr-startup.test.mjs)" key="f3e26be3" vc-list="vc:1" worktree="/Users/kpburson/.codex/worktrees/106-manual-xpr-startup/ai-peer-review" branch="codex/106-manual-xpr-startup" bound-issue="106" -->
- [x] CLI Claude reviewer launch records genuine provider stream evidence before join and supports authoritative join/submission while preserving exact permissions and same-session resume. <!-- aitm-verified exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (node --test test/integration/manual-xpr-startup.test.mjs)" key="086c4d4b" vc-list="vc:1" worktree="/Users/kpburson/.codex/worktrees/106-manual-xpr-startup/ai-peer-review" branch="codex/106-manual-xpr-startup" bound-issue="106" -->
- [x] Explicit manual reviews join using manual participant capability even when official resume commands are inherited; declared identities remain labeled declared and non-manual identity gates remain enforced. <!-- aitm-verified exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (node --test test/integration/manual-xpr-startup.test.mjs)" key="4e2af64b" vc-list="vc:1" worktree="/Users/kpburson/.codex/worktrees/106-manual-xpr-startup/ai-peer-review" branch="codex/106-manual-xpr-startup" bound-issue="106" -->
- [x] A real Codex-author / Claude Opus 5-reviewer manual review reaches an event-authoritative reviewer submission and its privacy-safe evidence is documented. <!-- aitm-verified exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (node scripts/verify-manual-xpr-evidence.mjs)" key="510d7352" vc-list="vc:4" worktree="/Users/kpburson/.codex/worktrees/106-manual-xpr-startup/ai-peer-review" branch="codex/106-manual-xpr-startup" bound-issue="106" -->

## Verification Commands

- [x] `node --test test/integration/manual-xpr-startup.test.mjs` <!-- id=1 --> <!-- aitm-verified cmd="node --test test/integration/manual-xpr-startup.test.mjs" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (node --test test/integration/manual-xpr-startup.test.mjs)" -->
- [x] `npm run test:slow` <!-- id=2 --> <!-- aitm-verified cmd="npm run test:slow" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (npm run test:slow)" -->
- [x] `npm run test:packaging` <!-- id=3 --> <!-- aitm-verified cmd="npm run test:packaging" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (npm run test:packaging)" -->
- [x] `node scripts/verify-manual-xpr-evidence.mjs` <!-- id=4 --> <!-- aitm-verified cmd="node scripts/verify-manual-xpr-evidence.mjs" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (node scripts/verify-manual-xpr-evidence.mjs)" -->
- [x] `npm test` <!-- id=5 --> <!-- aitm-verified cmd="npm test" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (npm test)" -->
- [x] `npm run lint` <!-- id=6 --> <!-- aitm-verified cmd="npm run lint" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (npm run lint)" -->
- [x] `npm run format:check` <!-- id=7 --> <!-- aitm-verified cmd="npm run format:check" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (npm run format:check)" -->
- [x] `git log --oneline -1` <!-- id=8 --> <!-- aitm-verified cmd="git log --oneline -1" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" evidence="sandbox exit 0 (git log --oneline -1)" -->

## Definition of Done
<!--
Each item below MUST be individually verified by running the declared
verifier. Do not bulk-check. Do not preemptively check. The visible checkbox
is the sign-off; the hidden `aitm-dod-evidence:<key>` marker is the evidence
trail. `/task check` refuses to tick a stampable Functional DoD item without
its marker; run `/task dod-stamp <key>` to produce one. The two derived keys
(`acs`, `checkboxes`) are auto-stamped by `/task close` from the body itself.
See `skill/shared/rules/functional-dod.md` for the full contract.

Lifecycle items are verified during Review. Housekeeping items are finalized
during Close; their separate headings make the owning workflow phase explicit.

Kind-aware items (#681): append a `dod:kinds` HTML-comment annotation to scope
an item to a set of issue kinds. `exclude="spike,research"` renders the item for
every kind EXCEPT those listed; `include="code"` renders it only for the listed
kinds; an item with no annotation applies to every kind (the default). The
`tests` item is excluded for the no-code kinds `spike` and `research`, which ship
findings rather than code and would otherwise carry a test-suite DoD item and a
`npm run test:all` verification command they can never satisfy. Filtering happens
at render time in `preflight-issue.mjs`; a filtered-out item is simply absent, so
no phantom evidence marker is ever required for it.

Diff-decides for `docs-only` (#865): the `tests` item deliberately does NOT
static-exclude `docs-only`. A `docs-only` issue can quietly touch code, so the
kind alone must not launder it out of the suite. Instead the `tests` item is
dropped only when the render is `--kind docs-only` AND a supplied
`--changed-paths-file` proves the `trunk...HEAD` diff is documentation-only
(default-deny: any unclassified/empty/mixed diff keeps the item). "The kind
declares, the diff decides."
-->

### Functional (verified at Test)

- [x] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" --> <!-- dod:functional:tests --> <!-- dod:kinds exclude="spike,research" -->
- [x] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" --> <!-- dod:functional:lint -->
- [x] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" exit="0" sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" --> <!-- dod:functional:commits --> <!-- dod:kinds exclude="epic" -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

### Lifecycle (verified at Review)

- [ ] Agent Review Passed
- [ ] Final Review Passed

### Housekeeping (verified at Close)

- [ ] Story closed and moved to Done
- [ ] Timing data flushed to issue

## AITM Progress Markers

<!-- aitm-entered-backlog ts="2026-09-26T23:30:19.948Z" -->

<!-- aitm-worktree-location worktree="/Users/kpburson/.codex/worktrees/106-manual-xpr-startup/ai-peer-review" branch="codex/106-manual-xpr-startup" sid="01a0df1d-306f-76d2-bf84-3629b0cd5909" ts="2026-09-26T23:31:07.051Z" -->
<!-- aitm-entered-refine ts="2026-09-26T23:31:49.138Z" move="move:507a5175-1496-4b95-9245-093c3bf3baaa" -->

<!-- aitm-refinement-snapshot schema="3" digest="9e3cb37761174c409c9a95535c3968bfc2188d98c404c1037d2e7a898f2df988" provenance="7a10d3664cb0a574dd509204b4c08c776e5df599fa341fb4e892c5e38280c31e" priority="P1" size="M" estimate="5" rank="1" ts="2026-09-26T23:32:17.413Z" -->
<!-- aitm-entered-ready-for-plan ts="2026-09-26T23:32:29.861Z" move="move:dccb665c-1e69-4ba1-bd6d-57ef27fa7598" -->

<!-- aitm-entered-plan ts="2026-09-26T23:32:59.083Z" move="move:5c743bb6-0447-41f0-9148-04aaef63ea9f" -->

<!-- aitm-deep-dive-complete ts="2026-09-26T23:34:58.783Z" -->

<!-- aitm-estimation-forecast-ready record-id="01M3G15ATVA81PZS92JFWZSYH8" -->
<!-- aitm-plan-approved ts="2026-09-26T23:35:54Z" story-digest="64039bf5873bc166f66efee32629ee5f91133189d256990259571b6274e52196" story-intent-digest="7c014576235e451e6f289e04cd1e3644e927fb7ce6fe20193b51466b280d0d71" story-intent-source="deep-dive" forecast-record-id="01M3G15ATVA81PZS92JFWZSYH8" trunk-sha="b7fbf455125e92cc3bbe073fc7e585cb0c623bc9" mode="human" -->
<!-- aitm-entered-develop ts="2026-09-26T23:37:09.232Z" move="move:5f3b2839-612e-4f7f-950b-4f5eed830732" -->

<!-- aitm-entered-test ts="2026-09-27T00:27:03.402Z" move="move:9b6a1afa-879a-4ce7-97e5-de4c9bcdd940" -->

<!-- aitm-entered-develop-2 ts="2026-09-27T00:31:18.943Z" move="move:2497940b-e56d-43ac-8e58-11b910658292" -->

<!-- aitm-verification-receipt stage="develop-final" data="eyJjb21tYW5kcyI6W3siYXJncyI6WyJydW4iLCJsaW50Il0sImNsYXNzaWZpY2F0aW9uIjoibGludC1mdWxsIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0yN1QwMDozNTowMC42NjdaIiwiZHVyYXRpb25NcyI6NTA3NiwiZXhpdENvZGUiOjAsImtpbmQiOiJsaW50IiwicHJvdmlkZXJJZCI6Im5vZGUiLCJzdGFydGVkQXQiOiIyMDI2LTA5LTI3VDAwOjM0OjU1LjU5MVoifSx7ImFyZ3MiOlsicnVuIiwiZm9ybWF0OmNoZWNrIl0sImNsYXNzaWZpY2F0aW9uIjoiZm9ybWF0LWZ1bGwiLCJjb21tYW5kIjoibnBtIiwiY29tcGxldGVkQXQiOiIyMDI2LTA5LTI3VDAwOjM1OjAzLjY2NFoiLCJkdXJhdGlvbk1zIjoyOTc1LCJleGl0Q29kZSI6MCwia2luZCI6ImZvcm1hdCIsInByb3ZpZGVySWQiOiJub2RlIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0yN1QwMDozNTowMC42ODlaIn1dLCJjb21taXRTaGEiOiI3ZTFiMmRlZTdmOTMyMWIyZjYyOGExNGRjODJlOTk5YzdhODMwNWY4IiwiY29tcGxldGVkQXQiOiIyMDI2LTA5LTI3VDAwOjM1OjAzLjY2NFoiLCJlbnZpcm9ubWVudCI6eyJjb25maWdIYXNoZXMiOnsiLm1hcmtkb3dubGludC1jbGkyLmpzb25jIjoic2hhMjU2OmE4OTkwNjc2OWRkN2ZmZmVlOTRlMTVmNDlhNGJhODZhNTgyYjA0NzJhNDJiOWE2MzM1MGI2YjU5ZWVjZWI3NzUiLCIucHJldHRpZXJyYy5qc29uIjoic2hhMjU2OjBiMGVjMWM2MjQ2YWNmZDQwMTE4OTY1MzQxYWJkYjgzYjA5MzVkOGFiN2JhYjBhMjQxOTdkZGFmOTMzMTg2NGYiLCJjc3BlbGwuanNvbiI6InNoYTI1NjowODhlYzE2NThlY2MyYmUyZGU5OWQyMmIxM2QxMDVkMDAxNmM2ZmJjZTA1Njc1YTU4ODFhYjExODc1ZjM1NDY0IiwiZXNsaW50LmNvbmZpZy5tanMiOiJzaGEyNTY6YTBiZjYzMTY1NWJiZmJkMjY2N2EwYjliZTdjODY0NDc2MWM1MjU2NzNhOTk5ZDY0YmNjOWJjZWY5ZjY0MmVhZiIsInBhY2thZ2UuanNvbiI6InNoYTI1Njo1NTJlZDY0NmE1YmI0MThiZGU5YTEzMTIwMzhhYWZjYjk1ZmIwYmZiNjljMDJlZWRlN2ZmYzI2MjVjZTdmMmY1In0sImxvY2tmaWxlSGFzaCI6InNoYTI1NjpkNzdlZTZjNjM2MDk1NzYwZDFhMjdmNzhjY2Y4Mjc3NzU0ZDMwM2UwYmFiOTdiYjc4ZWM5ZTE5MDI4MzIyZTAyIiwibm9kZSI6InYyNi44LjEiLCJwbGF0Zm9ybSI6ImRhcndpbi1hcm02NCIsInNhbmRib3giOnsiY2xlYW4iOnRydWUsImlkZW50aXR5IjoiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvMTA2LW1hbnVhbC14cHItc3RhcnR1cC9haS1wZWVyLXJldmlldyIsImtpbmQiOiJ3b3JrdHJlZSJ9fSwiaXNzdWUiOjEwNiwicHJvdmlkZXIiOnsiaWQiOiJub2RlIiwicmVxdWlyZWRDbGFzc2lmaWNhdGlvbnMiOlsibGludC1mdWxsIiwiZm9ybWF0LWZ1bGwiXX0sInJlY2VpcHRJZCI6IjAxTTNHNEpWQkdaQ0o3QzhDOUhWTVY0MU1TIiwic2NoZW1hIjoiYWl0bS52ZXJpZmljYXRpb24tcmVjZWlwdC92MSIsInN0YWdlIjoiZGV2ZWxvcC1maW5hbCIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6MzQ6NTUuNTkxWiIsInN1cGVyc2VkZXMiOiIwMU0zRzQzVzRYSFlaVEI4MDM4TTkxMjFCVyIsInZlcmlmaWNhdGlvbkNvbW1hbmRzIjpbWyJnaXQiLCJsb2ciLCItLW9uZWxpbmUiLCItMSJdLFsibm9kZSIsIi0tdGVzdCIsInRlc3QvaW50ZWdyYXRpb24vbWFudWFsLXhwci1zdGFydHVwLnRlc3QubWpzIl0sWyJub2RlIiwic2NyaXB0cy92ZXJpZnktbWFudWFsLXhwci1ldmlkZW5jZS5tanMiXSxbIm5wbSIsInJ1biIsImZvcm1hdDpjaGVjayJdLFsibnBtIiwicnVuIiwibGludCJdLFsibnBtIiwicnVuIiwidGVzdDpwYWNrYWdpbmciXSxbIm5wbSIsInJ1biIsInRlc3Q6c2xvdyJdLFsibnBtIiwidGVzdCJdXX0" -->
<!-- aitm-entered-test-2 ts="2026-09-27T00:35:14.524Z" move="move:bf833715-e959-49bf-b85c-3857981c2bab" -->

<!-- aitm-move-complete state=test ts=2026-09-27T00:35:19.552Z move=move:bf833715-e959-49bf-b85c-3857981c2bab -->
<!-- aitm-test-started sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:35:26.244Z" -->
<!-- aitm-dod-verified sha="7e1b2dee7f9321b2f628a14dc82e999c7a8305f8" ts="2026-09-27T00:44:25.855Z" -->
<!-- aitm-verification-receipt stage="test" data="eyJjb21tYW5kcyI6W3siYXJncyI6WyJydW4iLCJsaW50Il0sImNsYXNzaWZpY2F0aW9uIjoibGludC1mdWxsIiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0yN1QwMDozNTowMC42NjdaIiwiZHVyYXRpb25NcyI6NTA3NiwiZXhpdENvZGUiOjAsImtpbmQiOiJsaW50IiwicHJvdmlkZXJJZCI6Im5vZGUiLCJyZXVzZWRGcm9tIjoiMDFNM0c0SlZCR1pDSjdDOEM5SFZNVjQxTVMiLCJzdGFydGVkQXQiOiIyMDI2LTA5LTI3VDAwOjM0OjU1LjU5MVoifSx7ImFyZ3MiOlsicnVuIiwiZm9ybWF0OmNoZWNrIl0sImNsYXNzaWZpY2F0aW9uIjoiZm9ybWF0LWZ1bGwiLCJjb21tYW5kIjoibnBtIiwiY29tcGxldGVkQXQiOiIyMDI2LTA5LTI3VDAwOjM1OjAzLjY2NFoiLCJkdXJhdGlvbk1zIjoyOTc1LCJleGl0Q29kZSI6MCwia2luZCI6ImZvcm1hdCIsInByb3ZpZGVySWQiOiJub2RlIiwicmV1c2VkRnJvbSI6IjAxTTNHNEpWQkdaQ0o3QzhDOUhWTVY0MU1TIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0yN1QwMDozNTowMC42ODlaIn0seyJhcmdzIjpbInJ1biIsInRlc3Q6dW5pdCJdLCJjbGFzc2lmaWNhdGlvbiI6InRlc3QtdW5pdCIsImNvbW1hbmQiOiJucG0iLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMjdUMDA6MzU6NDMuMTY3WiIsImR1cmF0aW9uTXMiOjEyOTkwLCJleGl0Q29kZSI6MCwia2luZCI6InRlc3QiLCJwcm92aWRlcklkIjoibm9kZSIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6MzU6MzAuMTc3WiJ9LHsiYXJncyI6WyJydW4iLCJ0ZXN0OmludGVncmF0aW9uIl0sImNsYXNzaWZpY2F0aW9uIjoidGVzdC1pbnRlZ3JhdGlvbiIsImNvbW1hbmQiOiJucG0iLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMjdUMDA6Mzc6MjQuNTQwWiIsImR1cmF0aW9uTXMiOjEwMTM3MiwiZXhpdENvZGUiOjAsImtpbmQiOiJ0ZXN0IiwicHJvdmlkZXJJZCI6Im5vZGUiLCJzdGFydGVkQXQiOiIyMDI2LTA5LTI3VDAwOjM1OjQzLjE2OFoifSx7ImFyZ3MiOlsicnVuIiwidGVzdDpzbG93Il0sImNsYXNzaWZpY2F0aW9uIjoidGVzdC1zbG93IiwiY29tbWFuZCI6Im5wbSIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0yN1QwMDo0NDoxOC4wOTJaIiwiZHVyYXRpb25NcyI6NDEzNTUyLCJleGl0Q29kZSI6MCwia2luZCI6InRlc3QiLCJwcm92aWRlcklkIjoibm9kZSIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6Mzc6MjQuNTQwWiJ9LHsiYXJncyI6WyItLXRlc3QiLCJ0ZXN0L2ludGVncmF0aW9uL21hbnVhbC14cHItc3RhcnR1cC50ZXN0Lm1qcyJdLCJjbGFzc2lmaWNhdGlvbiI6InRlc3QtdGFyZ2V0ZWQtMSIsImNvbW1hbmQiOiJub2RlIiwiY29tcGxldGVkQXQiOiIyMDI2LTA5LTI3VDAwOjQ0OjIzLjE2OVoiLCJkdXJhdGlvbk1zIjo1MDc2LCJleGl0Q29kZSI6MCwia2luZCI6InRlc3QiLCJwcm92aWRlcklkIjoibm9kZSIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6NDQ6MTguMDkzWiJ9LHsiYXJncyI6WyJydW4iLCJ0ZXN0OnBhY2thZ2luZyJdLCJjbGFzc2lmaWNhdGlvbiI6InRlc3QtdGFyZ2V0ZWQtMiIsImNvbW1hbmQiOiJucG0iLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMjdUMDA6NDQ6MjQuOTM4WiIsImR1cmF0aW9uTXMiOjE3NjksImV4aXRDb2RlIjowLCJraW5kIjoidGVzdCIsInByb3ZpZGVySWQiOiJub2RlIiwic3RhcnRlZEF0IjoiMjAyNi0wOS0yN1QwMDo0NDoyMy4xNjlaIn0seyJhcmdzIjpbInNjcmlwdHMvdmVyaWZ5LW1hbnVhbC14cHItZXZpZGVuY2UubWpzIl0sImNsYXNzaWZpY2F0aW9uIjoidGVzdC10YXJnZXRlZC0zIiwiY29tbWFuZCI6Im5vZGUiLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMjdUMDA6NDQ6MjQuOTg4WiIsImR1cmF0aW9uTXMiOjUwLCJleGl0Q29kZSI6MCwia2luZCI6InRlc3QiLCJwcm92aWRlcklkIjoibm9kZSIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6NDQ6MjQuOTM4WiJ9LHsiYXJncyI6WyJsb2ciLCItLW9uZWxpbmUiLCItMSJdLCJjbGFzc2lmaWNhdGlvbiI6InRlc3QtdGFyZ2V0ZWQtNCIsImNvbW1hbmQiOiJnaXQiLCJjb21wbGV0ZWRBdCI6IjIwMjYtMDktMjdUMDA6NDQ6MjUuMDAyWiIsImR1cmF0aW9uTXMiOjE0LCJleGl0Q29kZSI6MCwia2luZCI6InRlc3QiLCJwcm92aWRlcklkIjoibm9kZSIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6NDQ6MjQuOTg4WiJ9XSwiY29tbWl0U2hhIjoiN2UxYjJkZWU3ZjkzMjFiMmY2MjhhMTRkYzgyZTk5OWM3YTgzMDVmOCIsImNvbXBsZXRlZEF0IjoiMjAyNi0wOS0yN1QwMDo0NDoyNS4wMDJaIiwiZW52aXJvbm1lbnQiOnsiY29uZmlnSGFzaGVzIjp7Ii5tYXJrZG93bmxpbnQtY2xpMi5qc29uYyI6InNoYTI1NjphODk5MDY3NjlkZDdmZmZlZTk0ZTE1ZjQ5YTRiYTg2YTU4MmIwNDcyYTQyYjlhNjMzNTBiNmI1OWVlY2ViNzc1IiwiLnByZXR0aWVycmMuanNvbiI6InNoYTI1NjowYjBlYzFjNjI0NmFjZmQ0MDExODk2NTM0MWFiZGI4M2IwOTM1ZDhhYjdiYWIwYTI0MTk3ZGRhZjkzMzE4NjRmIiwiY3NwZWxsLmpzb24iOiJzaGEyNTY6MDg4ZWMxNjU4ZWNjMmJlMmRlOTlkMjJiMTNkMTA1ZDAwMTZjNmZiY2UwNTY3NWE1ODgxYWIxMTg3NWYzNTQ2NCIsImVzbGludC5jb25maWcubWpzIjoic2hhMjU2OmEwYmY2MzE2NTViYmZiZDI2NjdhMGI5YmU3Yzg2NDQ3NjFjNTI1NjczYTk5OWQ2NGJjYzliY2VmOWY2NDJlYWYiLCJwYWNrYWdlLmpzb24iOiJzaGEyNTY6NTUyZWQ2NDZhNWJiNDE4YmRlOWExMzEyMDM4YWFmY2I5NWZiMGJmYjY5YzAyZWVkZTdmZmMyNjI1Y2U3ZjJmNSJ9LCJsb2NrZmlsZUhhc2giOiJzaGEyNTY6ZDc3ZWU2YzYzNjA5NTc2MGQxYTI3Zjc4Y2NmODI3Nzc1NGQzMDNlMGJhYjk3YmI3OGVjOWUxOTAyODMyMmUwMiIsIm5vZGUiOiJ2MjYuOC4xIiwicGxhdGZvcm0iOiJkYXJ3aW4tYXJtNjQiLCJzYW5kYm94Ijp7ImNsZWFuIjp0cnVlLCJpZGVudGl0eSI6Ii9Vc2Vycy9rcGJ1cnNvbi8uY29kZXgvd29ya3RyZWVzLzEwNi1tYW51YWwteHByLXN0YXJ0dXAvYWktcGVlci1yZXZpZXcvLnNjcmF0Y2gvLnRhc2stdGVzdC0xMDYtN2UxYjJkZWUtODM3MTUtZWM5YWQxMDIiLCJraW5kIjoid29ya3RyZWUifX0sImV4ZWN1dGlvbkNvbnRleHQiOnsiYm91bmRJc3N1ZSI6MTA2LCJicmFuY2giOiJIRUFEIiwid29ya3RyZWVQYXRoIjoiL1VzZXJzL2twYnVyc29uLy5jb2RleC93b3JrdHJlZXMvMTA2LW1hbnVhbC14cHItc3RhcnR1cC9haS1wZWVyLXJldmlldy8uc2NyYXRjaC8udGFzay10ZXN0LTEwNi03ZTFiMmRlZS04MzcxNS1lYzlhZDEwMiJ9LCJpc3N1ZSI6MTA2LCJwcm92aWRlciI6eyJpZCI6Im5vZGUiLCJyZXF1aXJlZENsYXNzaWZpY2F0aW9ucyI6WyJsaW50LWZ1bGwiLCJmb3JtYXQtZnVsbCIsInRlc3QtdW5pdCIsInRlc3QtaW50ZWdyYXRpb24iLCJ0ZXN0LXNsb3ciXSwic2V0dXAiOnsiYXJncyI6W10sIm5hbWUiOiJucG0tY2kifX0sInJlY2VpcHRJZCI6IjAxTTNHNTNaSEFYMTRDRTk3UEhHUzRNQ0FOIiwic2NoZW1hIjoiYWl0bS52ZXJpZmljYXRpb24tcmVjZWlwdC92MSIsInN0YWdlIjoidGVzdCIsInN0YXJ0ZWRBdCI6IjIwMjYtMDktMjdUMDA6MzQ6NTUuNTkxWiIsInN1cGVyc2VkZXMiOm51bGwsInZlcmlmaWNhdGlvbkNvbW1hbmRzIjpbWyJnaXQiLCJsb2ciLCItLW9uZWxpbmUiLCItMSJdLFsibm9kZSIsIi0tdGVzdCIsInRlc3QvaW50ZWdyYXRpb24vbWFudWFsLXhwci1zdGFydHVwLnRlc3QubWpzIl0sWyJub2RlIiwic2NyaXB0cy92ZXJpZnktbWFudWFsLXhwci1ldmlkZW5jZS5tanMiXSxbIm5wbSIsInJ1biIsImZvcm1hdDpjaGVjayJdLFsibnBtIiwicnVuIiwibGludCJdLFsibnBtIiwicnVuIiwidGVzdDpwYWNrYWdpbmciXSxbIm5wbSIsInJ1biIsInRlc3Q6c2xvdyJdLFsibnBtIiwidGVzdCJdXX0" -->

<!-- aitm-fields: {"schema":1,"values":{"priority":"P1","size":"M","disposition":null,"estimate":7,"engagedTime":63,"sessionTime":63,"reviewTime":0,"planTime":4,"rank":1,"startTime":"2026-09-26 18:31:10 -05:00"}} -->
<!-- aitm-stage-rollup: {"schema":2,"perStageSec":{"backlog":89,"refine":41,"ready-for-plan":29,"plan":250,"develop":3230,"test":256,"review":0,"done":0},"totalSec":3895,"visits":[{"stage":"backlog","visit":1,"durationSec":89},{"stage":"refine","visit":1,"durationSec":41},{"stage":"ready-for-plan","visit":1,"durationSec":29},{"stage":"plan","visit":1,"durationSec":250},{"stage":"develop","visit":1,"durationSec":2994},{"stage":"test","visit":1,"durationSec":256},{"stage":"develop","visit":2,"durationSec":236},{"stage":"test","visit":2,"durationSec":0}]} -->

<!-- aitm-body-version version="36" -->

