# #2053 full-vector comparison verification

The initial 31 comparator behavior tests preceded snapshot-compare.mjs. The named verifier failed with ERR_MODULE_NOT_FOUND for that module. Implementation made all 31 pass. Two added metadata tests then failed with missing expected exception: empty transport coverage and an impossible observed calendar date. Complete coverage validation and reuse of the existing strict native timestamp parser made all 33 comparator tests pass.

The native observation module has only an additive export alias, parseNativeContentTimestamp, for its existing unchanged parser. Its public observeContent behavior remains unchanged. The combined run passed 33 comparator + 57 manifest + 38 observation + 52 reader = 180 tests, no failures.

Actual fixtures exercise foreign/nondirty comments, additions/deletions and same-count replacement; unchanged token with different exact bytes; changed token with equal bytes; title, assignee and configured field inventory/value changes; absent versus null; malformed identities, incomplete inventories and unsupported native metadata; equivalent timestamp representations; detached immutable output; and actual reader output persisted through the manifest validator. No fixture makes a network call.

Comparison supports inline observations and previously integrity-validated persisted references. Inline bytes must match their exact hash. A reference is checked lexically but never opened; the manifest/store owner establishes its actual bytes and containment. Equality describes the complete supplied vector, not current cloud freshness, filesystem safety, mutation permission or provider atomicity. Provenance clocks, transport byte counts and local ownership annotation do not act as cloud versions.

Changes are stable detached records with kind/key/before/after. Resource descriptors retain both supported native tuple and exact digest, including unchanged-content edits. Field descriptors retain configured identity/type/value. Differences do not dispatch, increment counters, mutate snapshots or automatically merge. Unsupported revisions refuse rather than silently downgrade.

The package baseline is adjusted only for the one new runtime module, with an explicit presence assertion; the export alias adds no package file. Independent review, full CI and native exact-head acceptance remain pending. The local engineering estimate remains S/2.5h/rank4 without cloud history inputs.
