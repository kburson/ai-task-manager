### Source and scope

Task 23 at 0ad57329a5eb4e3aec395adb06a6216178e45c87 consumes original Task 8 at f2894455a97bb80f6afb82ce5ff722cad2a46c2b and spec dafb1d276036ddc17490f76329f6aa2c09732a15. Source c67d1dc49f44cef34991df5727273263b8074960 contains #2047 freezeStoryBatch/body-template contracts and #2073 createFieldEffectReaders. The latter scalar projection cannot replace native body metadata or full snapshots; reuse only where its Estimate/Size seam fits.

### Files and sequence

Product ownership is scripts/task-tracker/lib/story-cache/publisher.mjs, scripts/task-tracker/lib/story-cache/provider-adapters.mjs and scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs. Review collateral is docs/superpowers/reviews/2066. Shared package inventory stays read-only.
First write failing offline behavior tests using real store, acquired registry claim, native issue lock and frozen batch, replacing only remote transport. Implement publishResourceEffects({store,claim,batch,snapshot,ports}) with full verified generation/payload reads, exact batch reconstruction, native writer/lock validation and complete baseline equality including title/inventory/assignment/typed fields before mutation. Persist the frozen batch and dispatching journal before any transport. Process only declared effects in dependency order, once each. Materialize final issue from confirmed prerequisites and persist exact intended bytes/digest before dispatch. Validate exact content/native metadata/new IDs/typed field values; use complete mutation response or one bounded targeted observation. Creation needs complete unambiguous inventory. Persist each confirmed/uncertain result before the next effect. Never replay attempted or confirmed resources. Preserve baselines, pending dirty intent and conflict evidence; final completion and recovery remain other stories.

### Tests and proof

The named publisher.test.mjs covers incomplete snapshot, equal ID/different bytes, inventory addition/deletion, ownership drift, unregistered claims, wrong root/session, altered frozen batch, before/after-dispatch persistence failure, one attempt per resource, exact outcome/new-ID readback, missing fields, timeout/delayed landing, duplicate creation and replay refusal. Existing root AC cites node --test scripts/tests/unit/task-tracker/lib/story-cache/publisher.test.mjs. No new AC/scope is needed. Also run fast/slow suites and lint/format; report actual package inventory RED without changing the shared inventory. Native Test is controller-only.

### Story review and allocation

All seven semantic questions pass: delivery maintainer receives the safeguard; capability is single-attempt publication; independent partial writes/external overwrite is the need; truthful bounded outcomes are the benefit; pinned scope/spec support each claim; recovery #2067 and coordinator #2068 have distinct capabilities; prose stands alone. Retain owner-authorized S/3.5h with rubric 0: 1.5h implementation, 1h focused tests, 1h independent review/integration. No historical cloud comparable queries.

### Risks and dependency map

Depends on #2047 frozen batch/body template and completed #2073 target observations. Blocks #2067 recovery and #2068 coordination. No new sibling issues. Provider writes remain non-atomic; local locks/readbacks detect some races, cannot prove compare-and-swap/exactly-once creation. A failed local confirmation after a landed write must stop later effects. Keep original baseline/outcomes for recovery. Do not activate recovery/coordinator/public callers here. Preserve initial draft refusal and genuine canary hook/CLI evidence as local diagnostics, never cryptographic attestation or mutation authority.
