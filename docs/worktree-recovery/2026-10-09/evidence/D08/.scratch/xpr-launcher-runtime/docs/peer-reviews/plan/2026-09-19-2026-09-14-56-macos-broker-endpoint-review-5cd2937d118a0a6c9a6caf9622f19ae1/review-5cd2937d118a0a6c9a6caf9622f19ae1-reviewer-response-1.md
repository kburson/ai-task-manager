<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5cd2937d118a0a6c9a6caf9622f19ae1"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-56-macos-broker-endpoint.md"
artifact_commit: "6a388d2439d46e4c8a5200d65097c887855dae2b"
artifact_blob: "cfa4e35b99359cc3d0dcd4de02d142c07ac84330"
artifact_digest: "sha256:49083dfc9c8c713c758d878e7e8c3eb56f7563bebe04c3f54a5ec50454e25b5d"
agent:
  host: "grok"
  provider: "xai"
  model_id: "grok-4.6"
  model_display: "Grok 4.6"
  session_fingerprint: "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
  identity_source: "runtime"
started_at: "2026-09-19T21:25:49.317Z"
submitted_at: "2026-09-19T21:29:56.057Z"
finding_ids: ["R1-F001","R1-F002","R1-F003"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent plan review of `docs/plans/2026-09-14-56-macos-broker-endpoint.md` (blob `cfa4e35b99359cc3d0dcd4de02d142c07ac84330`) against the accepted design `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` and the current path-layer code in `src/broker/paths.mjs` plus `test/unit/broker-identity.test.mjs`.

The plan’s scope split is correct. `brokerPaths` remains the only routing derivation; Windows keeps the historical named pipe; issue #43 keeps root/parent validation, locks, handshake, cleanup, and the ten new ownership errors. No native, ownership, IPC, or schema implementation is scheduled. Task 3’s Darwin-gated `node:net` round trip, unique digest, refuse-if-exists, and `t.after` unlink of only `paths.endpoint` while leaving `aipr` / `aipr/v1` in place match the design’s integration and safe-cleanup rules.

Three defects block TDD execution and path-layer coverage. The Task 1 golden Darwin object pins the wrong `maxEndpointRootBytes`. The accepted TOO_LONG recovery is neither tested nor implemented as specified, including on Windows. The existing `limit: 20` assertion will keep Task 2 red after a correct below-63 `LIMIT_INVALID` change.

## Findings

### R1-F001 — Task 1’s golden Darwin object pins `maxEndpointRootBytes: 451`, not Darwin’s injected 42

Task 1 Step 1 tells the worker the Darwin result is exactly an object whose `maxEndpointRootBytes` is `451`. It never states the injected `platform.maxEndpointLength`.

451 is `512 - 61`. `512` is the current test double default in `test/unit/broker-identity.test.mjs` (`limit = 512`), not Darwin’s usable pathname limit. The accepted design requires POSIX `maxEndpointRootBytes = platform.maxEndpointLength - 61`, Darwin 103 usable bytes, and an explicit unit assertion that an injected Darwin limit returns `maxEndpointRootBytes: 42` and an injected Linux limit returns `46` (design lines 137–138, 288–291, 833–835). This plan’s own global constraints and Task 1 Step 3 use those same 103/107 budgets.

A worker who copies the golden object and the existing `platform({ kind: 'darwin' })` helper will lock 451 into the contract. Task 1 then never asserts the design’s 42/46 field values. Step 3’s 42/43-byte-root cases imply limit 103 but still do not pin the returned `maxEndpointRootBytes` field. Linux has no corresponding golden object at all.

That is not a cosmetic sample. Task 1 Step 1 is the exact frozen return shape Task 2 is required to implement.

### R1-F002 — TOO_LONG recovery is untested and the Windows instruction contradicts the accepted design

The accepted path-layer contract for `APR_BROKER_ENDPOINT_TOO_LONG` is (design 715–725, 827–829, 813–815, 984–986):

- POSIX recovery: configure a shorter validated `AI_PEER_REVIEW_ENDPOINT_ROOT` without moving authority; Darwin names the 42-byte root maximum and Linux the 46-byte maximum.
- Windows recovery: invalid platform limit or unsupported runtime, with `details.maxEndpointRootBytes: null`, because the 108-unit pipe fits the supported 256-unit limit.
- The shipped sentence “broker endpoints are never truncated or redirected” / “use a shorter supported user cache path” must go.
- Unit tests must prove a 21-byte `/Users/<short-name>` (or 28-byte home) default fails, then the same home succeeds with a short configured endpoint root.
- The macOS integration test must assert that exact recovery text, not only numeric details.

This plan does not encode that contract:

- Task 1 Step 3 asserts `error.details` fields only. It never asserts recovery text, never forbids the shipped “never redirected” sentence, and never composes the 21-byte short-name refusal with a succeeding short `AI_PEER_REVIEW_ENDPOINT_ROOT`.
- Task 2 Step 6 tells the implementer to “retain the existing Windows cache-root recovery.” That existing string in `src/broker/paths.mjs` is exactly the text the design retired: “Use a shorter supported user cache path; broker endpoints are never truncated or redirected.”
- Task 3 Step 2 asserts `limit` and `maxEndpointRootBytes` on the overlong default and does not assert the recovery text the design’s integration paragraph requires.

Because Task 1 never fails on recovery text, Task 2 can keep the shipped POSIX and Windows recoveries and still go green.

### R1-F003 — Existing `limit: 20` TOO_LONG assertion makes Task 2’s expected PASS unreachable

`test/unit/broker-identity.test.mjs` currently expects `APR_BROKER_ENDPOINT_TOO_LONG` for `platform({ kind: 'linux', limit: 20 })`. The accepted design and this plan require a POSIX limit below 63 to throw `APR_BROKER_ENDPOINT_LIMIT_INVALID` before digest or root validation (design 139–140, 712–714; Task 1 Step 3; Task 2 Step 4).

Task 1 says to add new failing tests and replace the legacy POSIX *layout* object. It does not change this isolation-test assertion. After Task 2 implements the below-63 rule, that existing case must throw `LIMIT_INVALID`. Task 2 Step 7 still says `node --test test/unit/broker-identity.test.mjs` is expected to PASS. A correct implementation cannot satisfy that step without an unstated edit to a test the plan never schedules.

The same file also still matches POSIX endpoints against `/<64-hex>/broker.sock`. Task 1 does not say to retire that legacy layout assertion, so it too stays red after a correct compact-path implementation.

## Required changes

1. Make the Task 1 golden POSIX objects use explicit injected limits (R1-F001). The Darwin exact result must call `platform({ kind: 'darwin', limit: 103 })` and pin `maxEndpointRootBytes: 42`. Add the matching Linux injected-107 object with `maxEndpointRootBytes: 46`. Keep Step 3’s 42/43 and 46/47 root-length cases, and assert the returned field, not only endpoint byte length.

2. Specify the accepted TOO_LONG recoveries in Task 1 tests and Task 2/3 implementation (R1-F002). POSIX recovery must name `AI_PEER_REVIEW_ENDPOINT_ROOT` and the derived 42/46-byte root budget, must not claim endpoints are never redirected, and must not recommend moving the authority cache. Windows recovery must report an invalid platform limit or unsupported runtime with `details.maxEndpointRootBytes: null`. Add the composed unit case: 21-byte short name or 28-byte Darwin home fails, then succeeds with a short configured endpoint root while authority paths stay put. Task 3’s overlong-default branch must assert that same recovery text.

3. Schedule replacement of the legacy assertions that a correct Task 2 cannot leave passing (R1-F003). In Task 1, change the `limit: 20` case to `APR_BROKER_ENDPOINT_LIMIT_INVALID` and retire the `/<64-hex>/broker.sock` layout match so Task 2’s focused suite can actually pass.

## Optional suggestions

1. Keep the existing “versions do not affect routing” assertion when replacing the macOS/Linux layout test. The design still requires it, and `brokerPaths` currently ignores a `versions` argument.

2. Define the `posix` fixture used in Task 1 Step 2 (`...posix`) with explicit `platform`, `env`, and `home`. The snippet is not executable as written.

3. Add the design’s `endpointDirectories` UTF-8-prefix assertion: each frozen entry is a byte prefix of `endpoint`.

## Decision

revisions-requested

