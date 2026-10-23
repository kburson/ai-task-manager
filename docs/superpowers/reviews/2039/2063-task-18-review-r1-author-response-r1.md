# Task 18 / #2063: R1 author dispositions

R1 candidate: `5322cdcfb5264221059afd97dee86d2d21168c60`. The adjacent reviewer report is a byte-preserved copy of the raw report. This response records the repair scope and each finding/decline/limit; it does not grant lifecycle or delivery authority.

## Important: malformed configuration provenance

Accepted after physical reproduction. The real loader erased parse failure before mode resolution; the source hook inherited that fallback while activity parsed independently. Corrected physical RED recorded 24 failures / 15 passes, including direct task-hub, packaged CLI, source hook and activity hook subtests. The earlier raw RED also records the initial fixture assumptions; neither was overwritten.

`config.mjs` now retains frozen read validity in a private WeakMap while preserving enumerable merged values, defaults, precedence and `_sources`. Invalid selected JSON or non-object configuration is retained as invalid provenance rather than presented as a valid default. `configurationReadProvenance` is read-only; the mode resolver consumes it without transport. The existing general loader does not globally throw or impose estimation behavior on unrelated commands.

`runtime.mjs` adds only an estimation-purpose check during context configuration loading: invalid provenance produces typed unavailable/config-invalid before an initialization diagnostic can mask it. Human compatibility commands retain their ordinary path. Both estimator hooks use the same canonical loader with the observed project root, including ordinary user/project precedence. The source hook retains its native serialized decision/reason/code contract; tests check its unavailable diagnostic without inventing an extra native response field.

Parent explicitly authorized the minimal required provenance seam beyond the four original production paths. Newly touched production paths are `scripts/task-tracker/config.mjs` and `scripts/task-tracker/runtime.mjs`; hook and resolver changes remain in the original owned paths. No neighboring worker's files were edited.

The physical fixtures cover malformed project/defaults, valid user plus malformed project, malformed user plus valid project, array project plus valid user, and missing project plus valid local user. They execute actual CLI and hook processes with offline transport fixtures. A missing initialized project retains the existing `config-not-found` CLI refusal; it is not converted into permission to run. With a missing project, the pure loader and hooks still classify the valid user-local setting consistently. This is an explicit preservation ruling, not a deferral of malformed configuration handling.

## Minor dispositions

1. Collector soft-byte-cap / soft-file-cap diagnostics: accepted. Raw native outputs remain preserved. Native iteration was passing with diagnostics, not pristine output. Direct captured bootstrap reads also emitted invalid-inherited-context; no retroactive request-coverage proof is claimed. No telemetry/cap changes or availability probes were introduced.
2. Integration size advisory: accepted. Extracted only the synthetic retained-input preparation into new Task 18 helper `scripts/tests/helpers/task-2063-retained-plan-fixture.mjs`, with parent confirming no peer ownership. The actual maintained calculator remains the production implementation; all publication, outcome, claim and half-hour assertions remain in their original tests. The extraction's seven integration tests passed independently before the provenance repair.

## Checks and declined-finding rulings

- Required dispatch hunks in all four originally owned production files: retained and reverified through the current named pure/physical verifier; the provenance fix adds no broad allowance.
- Pure rubric cases versus loader provenance: agree with the distinction. Existing pure classification coverage remains; new physical layer fixtures close the separate loader gap.
- Actual predecessor calculator reuse: retained. Fixture extraction calls the same maintained local-runtime API; no replacement calculator or cloud fallback.
- Remaining adaptive-factory caller in `verbs/plan-estimate.mjs`: retained sealed refusal, with actual direct/package entrypoint coverage.
- Direct exported runner reading a local evidence file before factory refusal: agree with no additional transport finding; local file reading is not cloud historical discovery. No speculative scope expansion.
- Manual compatibility route: retained explicit human values, native ownership/state reconciliation and no automatic forecast calculation. Invalid-provenance early refusal is scoped to estimation calculation requests only.
- Evidence-file precedence: retained. Evidence plus compatibility remains a calculation refusal, matching the actual parser.
- Canonical command segmentation and quoted mentions: retained. Unsupported wrappers receive no allowance and the runtime remains sealed.
- Unchanged decomposition collection: retained; canonical estimation hook requests are refused before collection.
- Publication extraction authority: retained current-target projection, Refine baseline, equivalent forecast reuse, native claims, write/read-back delegation and half-hour assertions.
- Declined cloud-pagination-test finding: agree. That production cloud estimation entrypoint remains deliberately unreachable; pre-page refusal assertions remain.
- Declined migrated-claim-coverage finding: agree. Actual forecast claim races and unchanged close races remain exercised; fixture extraction does not substitute mock authority assertions.
- Declined positive-rubric legacy-calculation finding: agree. Positive selects local only; absent retained inputs remain unavailable. No claim of completed neighboring authority integration.
- Prior RED and receipt checks: accepted as historical R1 evidence, preserved unchanged. Fresh R2-candidate verification is separately recorded rather than inferred from these receipts.
- Reviewer ran no suites/mutations: accepted limitation. Author verification is independently recorded; review prose is not a test receipt.

## Cannot-verify rulings

1. Earlier absent self-link: accepted, never rewritten as established bootstrap proof. Ordinary canonical seeding restored the own-worktree link before R1 edits; realpath, native SID/worktree/branch, genuine Start, actual binding and actor were verified. After global quota recovery those same current identities and the still-active original timer were read again. No pause endpoint or retroactive source-link proof was fabricated. Current-source physical CLI/hook verification was rerun after restoration.
2. Aggregate CI / native Test / Review / approval / Close / delivery: accepted boundary. This repair grants none of them. The worker performs no such transitions, push or merge; exact aggregate CI and native completion remain with the orchestrator.
3. Exact hash/inventory, dirty-manifest, delayed-write and transition-only publication across neighboring slices: accepted scope limit. This repair establishes configuration provenance at this story's dispatch boundary only. It neither claims completed integration of the neighboring components nor weakens their authority.

## Operational audit

During R1, the orchestrator declared global GraphQL exhaustion. The worker immediately stopped all new writes/tests/CLI/mutations, collected only an already-running regression result (19 passes), and retained its genuine active binding/timer. No independent availability probe, cleanup, Pause or Stop was attempted. The orchestrator later supplied one coordinated recovery check; boot/adapter/router/preferences/current target/identity were reloaded and Explain was refreshed. A first batched Explain-output redirect was refused as WRITE_OTHER before execution. On the orchestrator's supported recovery instruction, ordinary reads and direct stdout Explain succeeded without policy changes or alternate APIs. The refusal remains an audit fact.

Final current-source checks, repair commit, trace and registered Stop read-back are recorded in the ignored Task 18 report and R2 review package. No test or lifecycle outcome is inferred from the quota recovery.

## Current repair verification

The current-source four-file targeted run passed 64 checks, including 54 checks in the named root verifier pair. The full fast lane passed all 990 files. Full lint and formatting passed; lint still emits the existing soft-size advisory for the now-782-code-line adaptive integration file, so this is not a claim of pristine output. The focused slow config-completeness invariant passed nine checks. The pre-R1 full slow result of 56 files remains historical evidence only; it is not relabeled as a full slow run of this repair. Complete exact aggregate CI and native Test remain orchestrator work.
