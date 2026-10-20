# #2073 specification SAR — round 1

Reviewed input: [spec.r0.md](spec.r0.md). SHA256: `d25c897e85a6d4dedcdc217bcc6974b5cb7aa60a5b5ad4c52958b5326f61702e`.

Verdict: **Revise.** Eight actionable findings. Full document read; source-backed review of admission, publication, recovery and measurement. This is single-agent review/revision, not an independent reviewer or CLI acceptance. Requested dispatch identity is recorded in [parent-workflow.md](parent-workflow.md); requested `gpt-6-astra` / `high` is dispatch evidence, not a per-turn provider attestation.

## F1 — P1: Define the leaf decision using the actual strict kind contract

The draft forbids an assumed default kind but does not distinguish legitimate unmarked code issues from malformed kind markers. `issue-kind.mjs:parseIssueKind` defaults both absence and invalid values to code; the complete collector's `decomposition-authority.mjs:genuineKind` instead marks duplicate, invalid or misplaced markers unavailable while treating genuine absence as code. Merely moving the existing permissive parse before the query risks either rejecting ordinary issues or bypassing malformed parent classification. A full-query fallback alone is insufficient: the current hook still maps children only for `parseIssueKind(...) === 'epic'`.

Required revision: explicit fresh-body classification and structural decision table; use the strict collector semantics without weakening them. Preserve normal unmarked code behavior. For non-epic structural parents, choose a safe explicit refusal instead of collecting then ignoring their children. Test valid unmarked code, malformed/duplicate/misplaced kind markers and child-bearing non-epics.

## F2 — P1: Make phased continuity and the bounded failure route executable

“Validate identity and relevant body/context continuity” leaves the implementation free to compare only an issue number, while the proposed split introduces a new gap between kind/structure classification and child enumeration. `decomposition-hook-authority.mjs:issuePage` currently checks only number on root continuation; field continuation reads do not echo item identity. The new phase must not reuse the first body's classification after the body, parent membership or child inventory changed.

Required revision: specify the root evidence compared across phases, identity checks on every continuation, a final bounded root fence for a multi-phase read and an explicit refusal policy (no hidden internal retry). Include kind change, child add/remove, membership replacement and ownership/status drift fixtures. Preserve stated non-atomic limitations; do not promise complete isolation of concurrent children.

## F3 — P1: Specify typed targeted reads, complete absence evidence and body parsing

The draft asks for narrow reads and explicit nulls but does not specify how to prove field absence versus missing pages, deleted configuration, wrong union types or a malformed field block. Existing scalar readers use `?? null`; `parseIssueFieldDb` returns the last recognizable block, does not reject duplicate blocks and can return `ok:false` without `.values`. Replacing the collector with these routines alone would make malformed values appear unset or silently choose an ambiguous block. Field names alone are not authoritative IDs.

Required revision: name exact item/project/content/issue identity checks, configured field-ID/type proof, complete bounded field enumeration, duplicate handling, scalar domains and explicit absence semantics. Describe the body block contract including legacy support, duplicate/malformed refusal and missing-key compatibility. Do not claim unsupported GraphQL filtering capabilities or bypass current authorization when checking the target.

## F4 — P1: Define the checkpoint lifetime at actual call sites

`executeEstimateWriter` constructs before records with concurrent `Promise.all` reads, loops all business reads in `checkpoint(owner)`, and installs that checkpoint through `withDecompositionEffectCheckpoint`. `publishEstimateRevision` invokes it before effects and `assertDecompositionPublicationOwner` invokes it again within ownership checks; the provider writer may check ownership again. A generic “same checkpoint” cache can accidentally survive nested checks, `beforePublicationEffects`, metadata writes or immediate post-write readback. Conversely, demanding one transport request even for legitimate pagination is inconsistent with preserving completeness.

Required revision: each initial-before-record batch and each actual checkpoint invocation is its own short read scope; nested invocations are distinct. Sharing is only a single-flight pair observation within that scope and must end before callbacks/writes/persistence/post-write reads. Require fresh recovery and post-write observations. Count a bounded paginated logical observation separately from its provider dispatches; the unpaginated fixture may require one combined project read.

## F5 — P2: Bound shared-adapter and recovery impact explicitly

`publishFieldEstimateRevision` is also called by `apply-reevaluate.mjs` and `decomposition-migration-writer.mjs`; `executeEstimateWriter` has additional forecast, audit, cancellation and shelving consumers. `decomposition-writer-registry.mjs` uses a separate complete-authority path for predecessor effects. “Actual runtime entrypoints” and “compatible recovery” do not identify which of these change or must remain conservative.

Required revision: state optimization ownership for the three concrete field adapters and prohibit replacing authorization/registry reads wholesale. Test changed and unchanged refine paths, current-operation pending/completed retry, cross-writer predecessor reconciliation and at least compatibility coverage for other callers affected by shared code. Existing complete registry observations may remain complete; do not count their savings.

## F6 — P1: Retain a reproducible baseline and prevent fixture bypasses

The baseline requirement permits recording totals without preserving executable baseline inputs, and “production refinement/admission orchestration” could be interpreted as using `scripts/tests/fixtures/refinement-orchestration.mjs`, which replaces `publishRefinementRevision` with a success double. The native hook fixture also returns an unconditional large snapshot rather than answering requested selections. Both can hide a missing optimized connection. Existing composition fixtures use real writers but often replace collector ports rather than measure all dispatched provider operations.

Required revision: exact baseline source/fixture/config provenance and an offline re-run recipe, separate measured entrypoint boundaries, query-aware provider responses, production collector/writer/admission execution, and no injected authority verdict. Declare transport coverage and make accidental real networking fail. Pre-register family ceilings, fail unclassified requests, prove extra-request detection for each budget boundary, compare business results and safety outcomes as well as counts.

## F7 — P2: Separate leaf shape reduction from aggregate dispatch reduction

The initial hook query is one request with excessive nested selections. Removing those selections can reduce shape/bytes without reducing request count; safe parent phasing can add a request. The draft's final success statement and case 7 can be read as requiring every optimized route to have fewer dispatches. That encourages skipping required continuity checks or presents an impossible leaf-only count claim. The 27-point example is an actual measured query cost, not a deterministic offline estimate for the new shape.

Required revision: leaf no-nested-selection invariant and bounded count, explicit parent phase overhead, strictly fewer aggregate dispatches for a changed refinement field-publication fixture, independently declared per-family ceilings, comparable accepted results, and unknown live cost claims. Report bytes only at the measured layer; do not fabricate savings in points.

## F8 — P2: Record the concrete challenge to the four-hour scope

The 0.75/1.25/1/1h allocation has no implementation evidence. The four primary modules alone total 1,184 lines; the changed read behavior interacts with the 600+ line ownership projection, strict kind parsing, body parsing, multiple callers and two separate recovery paths. Current fixtures lack the exact query-aware combined budget boundary, and no explicit read-scope API exists. This is integration and new test-harness work, not just moving a query literal.

Required revision: retain four hours as an unvalidated owner budget, record local complexity and assumptions that would have to hold, and add a Refine/Plan readiness gate requiring a scoped file/test/seam inventory and justified estimate. If five hours cannot be supported, obtain a governed scope split before implementation. This SAR cannot silently split ownership, validate the estimate or waive safety criteria to fit the cap.

## Full review coverage and limitations

Read the entire specification and compared its evidence claims to the retained #2039 attribution and usage records. Read the complete hook collector, concrete field writer, writer publication and publication orchestration; inspected strict kind/body parsing, authority and ownership checkpoints, registry recovery, refine orchestration, activity/plan admission consumers and native/composition/recovery fixtures. The measured historical numbers are correctly qualified; source-template matches remain inference rather than runtime stack attribution.

No Git, network, task binding, timing, lifecycle or implementation actions were performed. No product tests ran. Memory quick-pass was denied by the scope hook and yielded no memory content. The findings above are document requirements for future implementation, not claims that code has been repaired. Author dispositions and next reviewed snapshot are recorded separately.
