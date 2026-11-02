### Scope and source

Task 28 implements explicit working/published story views and guard/Explain adapters. The native manifest already validates full identity, exact payload digests, immutable base snapshots, working references, dirty keys, timing cursors and retained batch/conflict records. Task 29 (#2070, Done) supplies timingAuthority; reuse that owner. Preserve #2073 fresh shallow leaf admission: cached integrity cannot grant freshness, completion, or session ownership.

### Implementation and dependencies

Consume completed #2059, #2063, #2069 and #2073. Create story-cache/views.mjs with the exact views.test.mjs root verifier. Consume one validated detached generation record, explicitly select working candidate or baseSnapshot bytes, and expose identity, content, fields, dirty/conflict/uncertain/pending effects. The projection grants no fresh-observation capability. Missing cache and remote-only consumers retain native fresh reads without inventing publication. Same-login competing sessions remain subject to occupancy and owner checks. No environment flag selects authority. Integrate the owned session, decomposition and Explain boundaries while retaining independently necessary native admission. Existing successor #2071 owns the complete public writer activation; this slice must not partially switch public mutation semantics.

### Verification

Begin with failing tests for staged versus published bytes, staged reviewed-scope changes, local edit after approval, absent proof, missing cache, corrupt payloads, retained conflicts, uncertain effects and competing session refusal. Test detached buffers/maps and reject accessor inputs before any publication decision. Exercise actual owned adapter entrypoints with offline ports; retain existing fresh-authority and source/edit/commit guard regressions. Re-export timingAuthority and preserve measured work, Unknown and historical actors. Run the exact root plus adjacent session/decomposition/Explain suites, lint/format, exact-head full cloud CI, independent whole-branch review and native Test/Review/integration/Close. No costly cloud estimation replay, hook bypass or new repair story.

### Estimate and risks

Retain Size S / 3.5h for this bounded slice; #2071 owns coordinated activation. No historical cloud comparables were consulted. Main risk: cached integrity mistaken for freshness. Views must label observation-only authority and require independently fresh native admission. Mutable input substitution is another risk: detach exact bytes before validation and use that same private record throughout. Changes to source scope after approval must affect working validation while published authority remains explicitly separate. Neither view alone proves a lifecycle visit complete.
