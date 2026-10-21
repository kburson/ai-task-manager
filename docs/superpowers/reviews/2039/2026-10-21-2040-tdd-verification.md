# #2040 native observation TDD record

The accepted wave-2 slice owns `observeContent` and its targeted unit verifier. Native Plan approval, singleton assignment to the current owner, deep-dive mirroring and Develop admission preceded implementation. The local estimate remains 3h. No cloud historical-task lookup or provider mutation was used by the module or its tests.

## Observed test sequence

The first exact verifier invocation failed with the expected missing production-module error. The minimal implementation then passed 32 of 33 tests. The remaining failure was an author typo: the expected A digest contained 65 hex characters. An independent `printf A | shasum -a 256` confirmed the correct 64-character literal; only the erroneous expected value was corrected. The next run passed 33/33. This fixture correction is not claimed as a production regression fix.

Three additional tests exercised explicit partial empty-history metadata: contradictory continuation, a null page-info object and missing continuation metadata. All three failed with missing expected exception against the initial implementation. Optional page metadata is now validated when present, while the accepted zero-edit seed without pageInfo remains supported and an edited first:1 result may report older history. The exact verifier then passed 36/36. After the lint-compatible control-character regex refactor, it passed 36/36 again.

The cases exercise explicit unedited issue/comment observations, opaque current edit identity, diagnostic-only counts, exact byte-sensitive hashes, missing/invalid history fields, timestamp disagreement, tombstones, ambiguous latest ordering, target identity validation, mismatched payload/kind and isolation from caller mutation. The implementation does not traverse older history, silently fall back to digest-only, contact GitHub, claim ownership or publish anything. Every observation begins read-only; validated native capabilities in later slices own write eligibility.

## Checks and limits

Full repository lint passed after correcting its reported regex syntax and two checkpoint-document issues. Full formatting passed before the final evidence record; native exact-head CI and Test will verify the committed tree again. Targeted verifier: `node --test scripts/tests/unit/task-tracker/lib/story-cache/native-observation.test.mjs`, 36 passed, zero failed. `git diff --check` passed. These observations do not claim native Test, Review, delivery or story completion.

The regex preserves rejection of whitespace and control characters using a Unicode category rather than literal control-code escapes. The one retained opaque provider ID has a one-line spelling suppression in its test fixture; no global dictionary exception was added. The parent prerequisite checkpoint received prose-only corrections: a paragraph beginning with an issue number was parsed as an invalid heading, and its redundant opaque intent text was replaced by a reference to the native recorded exact-head intent. The receipt itself remains in native durable authority. No product scope was expanded.

## Interface rulings

Pure observation validates the supplied full canonical target identity and determines issue versus comment from the issue node ID, checking typename when supplied. Snapshot transport and cross-resource host/repository census remain #2052's responsibility; complete input is not an authorization token. Optional pageInfo absence remains compatible with the accepted concrete seed. Explicitly contradictory or incomplete pageInfo is unavailable. The latest-node connection is bounded to one; extra nodes are unsupported ordering rather than an invitation to guess. Calendar-valid UTC timestamps are compared as instants; counts are never arithmetic revision versions. The returned baseline uses copied, frozen identity and revision objects.
