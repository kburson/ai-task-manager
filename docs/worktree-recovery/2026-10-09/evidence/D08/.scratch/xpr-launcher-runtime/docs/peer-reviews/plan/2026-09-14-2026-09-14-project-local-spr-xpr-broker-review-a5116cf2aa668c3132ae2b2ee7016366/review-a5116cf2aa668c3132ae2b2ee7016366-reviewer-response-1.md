<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a5116cf2aa668c3132ae2b2ee7016366"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-project-local-spr-xpr-broker.md"
artifact_commit: "305953f55614bc93891ba11cea709c7d663cdb00"
artifact_blob: "1e6569185ba198965249cd15fee49fd4e5871cb7"
artifact_digest: "sha256:4742159c2d8abd2345096e034754a49012a91368228ec828841c5f77c35afba1"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:c77bb2adc0c8bf3a6a6ea59158ff7b58a1dc1acb75fa5b25d60adadcf1e3f929"
  identity_source: "runtime"
started_at: "2026-09-14T04:06:20.451Z"
submitted_at: "2026-09-14T04:22:24.898Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed `docs/plans/2026-09-14-project-local-spr-xpr-broker.md` against its linked
spec `docs/design/2026-09-14-project-local-spr-xpr-broker-design.md` and against the
repository source at the sealed artifact commit.

Strengths. The plan's architecture faithfully implements the design. Its twelve tasks
carry the design's fail-closed posture end to end: OS-lock plus peer-credential
ownership rather than PID or heartbeat liveness inference (Task 4), a root digest that
excludes version inputs so routing survives upgrades (Task 3), cross-version passive
provider-resource locks keyed independently of project and package version (Task 5),
runtime-image pinning so an upgraded installation cannot strand a draining broker
(Task 6), and reconciliation-before-delivery on every recovery path. The acceptance
coverage table maps all fourteen of the design's acceptance criteria onto tasks with
decisive evidence, with no criterion dropped. The plan resolves the design's one open
question (`spr`/`xpr` as help topics only), refuses to reuse issue #9 or #10 as the
delivery issue, and scopes itself to exclude implementation, issue mutation, and
publication. Task 12's registry re-audit before choosing a release number is the right
response to the design's dated, non-permanent npm observation.

Blocking problem. The plan states an execution contract it cannot satisfy: "Each task
follows red/green verification and ends with an exact-path commit," and each task closes
with "commit the exact files above." But the plan's own `Files:` lists omit files that
its changes provably break, in four places. The `start` grammar change is a breaking
change with wide fan-out that the plan under-counts; the golden help suite is
digest-pinned and goes red at Task 1; the coordinator removal in Task 10 breaks two
suites Task 10 does not own; and the packaging allowlist rejects the `native/` files
Task 4 adds. Under the plan as written, an implementer reaching the end of Task 1 must
either commit with `npm test` failing or violate the exact-path rule. These are
mechanical omissions in otherwise sound task decomposition, not architectural defects.

Second problem. Two items the plan depends on are unspecified rather than merely
omitted: how the native helper is built for an installed package (Finding 5), and what
mechanism serves a non-command help topic (Finding 6). Finding 5 is the more serious of
the two, because the plan's global constraints make broker availability a precondition
for all new XPR startup.

Verification performed. Read: the plan, the design, `package.json`, `src/cli/parse.mjs`,
`src/cli/help-data.mjs`, `src/errors.mjs`, `test/golden/help.test.mjs`,
`test/packaging/package.test.mjs`. Grep/Glob: existence of every source module, schema,
test module, template, and doc named in the plan's file map and task file lists; call
sites of `startReview(`; occurrences of `coordinator` across tracked files; exported
names `reconcileWake`, `runCoordinator`, `decideWake`, `reduceEvents`, `statusReview`,
`startReview`; the `review-created` payload shape in `src/protocol/events.mjs`; the CI
matrix in `.github/workflows/ci.yml`. I ran no tests and no Git commands. I did not
verify the plan's claim that the design's accepted artifact is blob
`4fafa9f821cf062282a845d20b64848355f02bd1`, since that requires Git.

Every path, line number, and count cited below was read in this session.

## Findings

1. **Task 1's breaking `start` grammar is not propagated to its fifteen call sites.**
   Task 8 states the rule plainly: "Direct new-start callers must also supply required
   selection." `startReview(` is called in fifteen test files: `test/integration/`
   `start-join` (21 calls), `phased-review` (4), `finalization` (3), `no-commit` (3),
   `automatic-required` (3), `status-resume` (2), `submit` (2), `claims` (1),
   `recovery` (1), `communication-policy` (1), `budget-intervention` (1),
   `setup-doctor` (1), `reviewer-boundary` (1), `review-record` (1), plus the shared
   helper `test/helpers/intervention-fixture.mjs` (1); `test/helpers/internal-api.mjs:13`
   re-exports it. Across all twelve tasks, only `start-join`, `status-resume`,
   `recovery`, and `phased-review` ever appear in a `Files:` list. Ten call sites plus
   the shared intervention helper are never listed anywhere in the plan. Because
   reviewer provider and model are required with no default (Global Constraints; design
   "Old startup commands missing reviewer selection fail before mutation"), each one
   fails at its first `startReview` call once Task 1 or Task 8 lands. The plan's
   instruction to "preserve existing test utilities rather than inventing a parallel
   protocol fixture implementation" is the right call, but it makes updating
   `intervention-fixture.mjs` mandatory and unlisted.

2. **The golden help suite goes red at the end of Task 1 and stays red until Task 11.**
   `src/cli/help-data.mjs:833-836` derives each topic's `flags` array directly from
   `COMMAND_FLAGS[command]`, so adding `--reviewer-provider`, `--reviewer-model`, and
   `--reviewer-effort` to `COMMAND_FLAGS.start` (`src/cli/parse.mjs:13-26`) changes help
   output with no separate edit. `test/golden/help.test.mjs:50-53` compares `topic.flags`
   to `COMMAND_FLAGS[command]` and still passes, since both sides move together, but
   `test/golden/help.test.mjs:100-105` hashes the full rendered `help --all` text against
   `test/golden/help/all.sha256.txt`, and that digest fixture is invalidated by any flag
   addition. Task 1 also changes `COMMAND_USAGE.start` (`src/cli/parse.mjs:81-82`),
   asserted at `test/golden/help.test.mjs:25`. Task 1 lists neither
   `src/cli/help-data.mjs` nor `test/golden/help/all.sha256.txt`, and its verification
   step runs only `test/unit/cli-parse.test.mjs test/unit/startup-selection.test.mjs`.
   Since `npm test` is `test:unit && test:golden` (`package.json:31`), the repository's
   default test command is red at the Task 1 commit and at every commit through Task 10,
   where Task 11 finally lists the golden fixtures. The plan never acknowledges this
   interval, so an implementer following the stated red/green rule stops at Task 1 with
   no guidance.

3. **Task 10 removes the `coordinator` grammar without owning the two suites that assert
   it.** Task 10 removes "coordinator command grammar/help/run dispatch in this same
   task." `test/unit/cli-parse.test.mjs` asserts that grammar at line 25 (the closed
   `COMMANDS` list) and lines 255-267 (`'coordinator accepts only the closed foreground
   command grammar'`, covering all four verbs and four usage rejections).
   `test/golden/help.test.mjs:92-98` is a dedicated test asserting that
   `helpRequest('coordinator', 'json')` returns durable-wake, zero-token,
   manual-fallback, and `ai-peer-review.coordinator-result/v1` fields; it throws once
   `coordinator` leaves `COMMAND_FLAGS`. Task 10's `Files:` list includes neither file.
   `test/unit/cli-parse.test.mjs` is listed only in Task 1, `test/golden/help.test.mjs`
   only in Task 11.

4. **Task 4's packaging change is rejected by an allowlist Task 4 does not own.** Task 4
   modifies `package.json` "for helper build tooling and package file inclusion," which
   requires adding `native/` and `scripts/build-broker-security.mjs` to the `files` array
   (`package.json:16-29`). `test/packaging/package.test.mjs:28-44` enforces a closed set:
   prefixes `bin/`, `docs/`, `provenance/`, `schemas/`, `skills/`, `src/`, `templates/`,
   plus exactly `LICENSE`, `NOTICE`, `README.md`, `package.json`,
   `scripts/verify-extraction.mjs`, `scripts/verify-release.mjs`. A `native/` entry or a
   third `scripts/` file fails the `files.every(...)` assertion at lines 45-50. Task 4
   does not list `test/packaging/package.test.mjs`; Tasks 10 and 12 do. `npm run
   test:packaging` is therefore red from Task 4 through Task 12.

5. **The native helper has no specified build trigger for an installed package, which
   makes new XPR startup unreachable for npm consumers.** Task 4 adds
   `native/broker-security/binding.gyp` and a pinned `node-gyp` devDependency, and
   requires "use installed local tooling only, no startup download/build." Task 12 asks
   for "OS helper source/build assets or verified platform binaries" and for validating
   "fresh install without unexpected network downloads or lifecycle execution beyond the
   documented helper build." Three problems compound:
   (a) npm auto-runs `node-gyp rebuild` only for a `binding.gyp` at the package root;
   under `native/` it is inert, and the plan adds no `install`/`postinstall` hook —
   `package.json:30-42` has no lifecycle scripts at all today.
   (b) No task produces, signs, verifies, or distributes prebuilt binaries, so the "or
   verified platform binaries" branch of Task 12 has no implementation anywhere in the
   plan. The choice is deferred to release time with no decision criteria.
   (c) `node-gyp` ordinarily fetches Node headers on first build, which contradicts
   Task 12's no-unexpected-network requirement, and it requires a C++ toolchain and
   Python on the consumer machine that the plan never states as a prerequisite.
   The consequence is not cosmetic. Task 4 says "Helper build failure makes broker doctor
   unhealthy while legacy manual commands still load," and the Global Constraints say
   "New XPR startup must use the project-local broker, including explicit manual
   transport." For a consumer installing from npm, the helper is never built, the broker
   is never healthy, and every new XPR start fails — the primary feature this plan
   delivers. This must be resolved before Task 4, because the answer determines Task 4's
   packaging shape and Task 12's CI matrix.

6. **`spr` and `xpr` help topics have no mechanism in the closed help catalog.** The
   plan's implementation choices resolve the design's open question by using "`spr` and
   `xpr` as help topics only for the initial release," and Task 11's Interfaces promise
   "Complete offline start help and `spr`/`xpr` help topics." But
   `helpRequest(name, format, options)` (`src/cli/help-data.mjs:936-959`) resolves only
   three shapes: search over `COMMANDS` (lines 937-944), `--all` over `COMMANDS`
   (945-950), and the index of `COMMANDS` (951-959); a named topic is a command lookup,
   and `topic(command)` (line 823) requires `POSITIONAL_GRAMMAR`, `COMMAND_USAGE`,
   `COMMAND_FLAGS`, `PURPOSE`, `ROLES`, and `STATES` entries. A non-command topic needs
   either a new topic registry or a command entry. Task 11's `Files:` list includes
   `src/cli/help-data.mjs` but not `src/cli/parse.mjs`, which owns the `help` grammar
   (`src/cli/parse.mjs:72, 104, 130`) and is claimed by Task 10. As written, Task 11
   cannot deliver its own stated interface within its own file list. Note also that
   `test/golden/help.test.mjs:9-61` iterates `COMMANDS` and requires all twenty-one topic
   fields, so a bare `COMMAND_FLAGS` entry for `spr` would need
   `PURPOSE`/`ROLES`/`STATES`/usage/grammar entries and would appear in the help index —
   arguably making `start` ambiguous, which design decision 2 forbids.

7. **Two new failure modes reuse existing error codes whose meanings do not fit.**
   Task 9's snippet asserts that `adapter.resolveModel({ model: 'missing', effort:
   'high' })` rejects with `APR_TRANSPORT_UNAVAILABLE`. An unsupported model is a
   selection error, not a transport-capability error, and Task 1 already uses that same
   code for its distinct meaning: "Missing policy/capability intersection fails with
   `APR_TRANSPORT_UNAVAILABLE`." One code for both makes the two conditions
   indistinguishable to an agent, and each code carries one recovery string
   (`src/errors.mjs:1-12` requires a non-empty `recovery` per construction;
   `src/cli/help-data.mjs:929-934` shows the usage-error shape). Separately, Task 6
   asserts that a conflicting broker registration throws `APR_OUTPUT_COLLISION`, which
   currently means a review-output path reservation collision — and Task 8 relies on that
   original meaning in the same plan ("Distinct new requests still use existing output
   collision rules"). The design names five new stable broker codes and says "Existing
   identity, integrity, and outcome-unknown errors pass through unchanged," which reads
   against overloading.

8. **"All ten existing flag groups" matches neither the spec nor the source.** Task 1's
   first step says to preserve "all ten existing flag groups from the spec." The design's
   disposition table has seven rows naming twelve flags; `COMMAND_FLAGS.start`
   (`src/cli/parse.mjs:13-26`) has exactly twelve entries. Ten is wrong on both counts,
   and this is the count an implementer will assert in a parser test.

9. **`startReview` is described in the wrong module.** Task 8's Interfaces say "Existing
   `startReview` remains the protocol creation service" and its `Files:` list modifies
   `src/protocol/service.mjs`. `startReview` is exported from `src/cli/run.mjs:626`.
   `src/protocol/service.mjs` exports `statusReview` (line 466), duplicated at
   `src/cli/run.mjs:1193`. Task 8 may well need both files, but the interface sentence
   points at the wrong one.

10. **Task 11's "existing generation pattern" for golden fixtures does not exist.**
    Task 11 says to "Regenerate only changed golden fixtures using the repository's
    existing generation pattern." There is no generator: `scripts/` contains only
    `run-secret-scan.mjs`, `verify-extraction.mjs`, and `verify-release.mjs`, and
    `package.json:30-42` defines no regeneration script. The fixtures under
    `test/golden/help/` are bare SHA-256 text files (`all.sha256.txt`,
    `submit.sha256.txt`) computed inside the test at `test/golden/help.test.mjs:102-105`.
    Updating them is a manual digest transcription, which the plan should state
    explicitly given its instruction to "inspect their diffs."

## Required changes

1. **Enumerate the full `startReview` fan-out (Finding 1).** Add the ten unlisted call
   sites and `test/helpers/intervention-fixture.mjs` to the `Files:` list of whichever
   task makes reviewer selection required (Task 1 or Task 8), or state an explicit
   default-supplying seam in the test helpers that keeps existing suites valid and name
   the file that provides it. Either resolution is acceptable; leaving them unlisted is
   not, because the exact-path commit rule then blocks the implementer.

2. **Own the golden help fallout in Task 1 (Finding 2).** Add `src/cli/help-data.mjs` and
   `test/golden/help/all.sha256.txt` to Task 1's `Files:`, and add
   `node --test test/golden/help.test.mjs` to Task 1's rerun step. If the intent is
   instead to defer all help regeneration to Task 11, say so explicitly in the plan's
   verification preamble, declare `npm test` red for Tasks 1-10, and state why that is
   acceptable — but the current silent contradiction with "Each task follows red/green
   verification" must be removed.

3. **Add the coordinator-removal test files to Task 10 (Finding 3).** List
   `test/unit/cli-parse.test.mjs` and `test/golden/help.test.mjs` in Task 10's `Files:`,
   and add both to its rerun command, which currently covers only phase, wake, packaging,
   and MCP suites.

4. **Add `test/packaging/package.test.mjs` to Task 4 (Finding 4).** The allowlist at
   lines 28-44 must be widened in the same commit that adds `native/` to `package.json`
   `files`, and Task 4's rerun step should include `npm run test:packaging`.

5. **Specify the native helper build trigger before Task 4 (Finding 5).** State, in the
   implementation-choices section or in Task 4, exactly one answer: an explicit opt-in
   build step (for example a `peer-review setup` action or a documented `npm run`
   invocation) that leaves the broker unhealthy until run; a lifecycle `install` script
   with its network and toolchain requirements stated; or prebuilt platform binaries with
   a task that produces and verifies them. Then reconcile the chosen answer with
   Task 12's "fresh install without unexpected network downloads" and with the Global
   Constraint that new XPR startup requires the broker, so the plan does not ship a
   feature that is unreachable from an npm install. If the first release intentionally
   supports the broker only for source checkouts, say so explicitly in the 0.3.0 release
   note scope named in Task 11 and Task 12.

6. **Define the `spr`/`xpr` help topic mechanism and its owning task (Finding 6).** Name
   the mechanism — a topic registry separate from `COMMANDS`, an extension to
   `helpRequest`, or routing through the existing `help search` path — and add the files
   it touches (at minimum `src/cli/parse.mjs` if the `help` grammar changes) to Task 11,
   coordinating with Task 10's ownership of `src/cli/parse.mjs`. Confirm the choice keeps
   `start` unambiguous per design decision 2 and keeps `test/golden/help.test.mjs:9-61`
   passing, since that test requires all twenty-one fields for every entry it iterates.

7. **Assign distinct error codes to the two new failure modes (Finding 7).** Give
   unsupported model/effort resolution its own code, distinct from
   `APR_TRANSPORT_UNAVAILABLE`, and give broker registration conflict its own code,
   distinct from `APR_OUTPUT_COLLISION`. Add both to the `explain` work already scoped in
   Task 10 ("Add exact error recoveries for all five design startup errors" becomes
   seven), and update the Task 9 and Task 6 snippets to match.

8. **Correct the flag count in Task 1 (Finding 8).** Replace "ten existing flag groups"
   with the actual shape — seven disposition rows covering twelve flags — so the parser
   test asserts the real `COMMAND_FLAGS.start` contents.

## Optional suggestions

1. Fix the Task 8 interface sentence to locate `startReview` in `src/cli/run.mjs:626`
   (Finding 9), and confirm whether `src/protocol/service.mjs` genuinely needs
   modification or was listed by association.

2. Replace Task 11's "existing generation pattern" with the actual procedure — recompute
   the SHA-256 of `helpRequest(null, 'text', { all: true })` and of
   `JSON.stringify(helpRequest('submit', 'json'))` and write them to
   `test/golden/help/all.sha256.txt` and `submit.sha256.txt` (Finding 10) — or add a
   small regeneration script to Task 11's `Files:` so "inspect their diffs" is meaningful
   for digest-only fixtures.

3. Align the two digest snippets: Task 3 uses `.update(JSON.stringify(tuple), 'utf8')`
   while Task 5 omits the encoding argument. Both are utf8 by default, but the design
   specifies "UTF-8 compact JSON," and a reader comparing the two snippets may infer a
   deliberate difference. Making them identical also documents that `JSON.stringify` is
   the compact serializer the design's "compact JSON array" means.

4. Task 3 injects a `platform` that "supplies canonical paths and the OS user ID through
   Task 4," but `src/broker/platform.mjs` is created in Task 4. The dependency injection
   makes this testable in the stated order, so no change is required; consider one
   sentence noting that `canonicalProjectIdentity` has no production platform until
   Task 4 lands, so a reader does not expect end-to-end identity resolution at Task 3.

5. Task 12 modifies "the existing CI workflow that runs the Node/platform matrix."
   `.github/workflows/ci.yml` has several distinct matrices — a Node 24 OS matrix (lines
   14-26), a Node-version matrix pinned to `ubuntu-latest` (lines 39-51), and an npm
   matrix (lines 64-83). Naming the specific jobs that must gain Windows and macOS lanes
   would prevent the required-platform coverage from landing in the wrong one, which
   matters given Task 12's rule that a skipped required platform cannot be called
   supported.

6. Task 2 adds `review-created.payload.startup.runtime`. `src/protocol/events.mjs` uses
   `exactKeys(context, contextFields, 'review-created startup context')` (line 367) and
   validates each `startup` field individually (lines 345-402). Task 2 already says to
   "Extend exact-key validators and JSON schemas together"; naming the `exactKeys` call
   site would make the optional-field addition unambiguous for the implementer.

## Decision

revisions-requested
