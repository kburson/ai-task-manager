# #2056 implementation evidence

Base: `7fb170042a19bd42560b39ca0c2b487f6402d717`.

The accepted claim implementation moves into `writer-registry.mjs`; `writer-claim.mjs` preserves its three public exports. Registration validates an exact persistent acquired claim and returns a frozen pointer. Resolution uses complete native identity and validates registry identity, retained issue presence, canonical owner/cache paths, registered same-repository worktree membership and physical private cache directories. It never initializes missing evidence or reads/copies body, comment, timing, journal or payload contents. Fleet exports the APIs while retaining its separate observational storage and TTL behavior.

The deep dive records the conservative registration contract: this API does not create an owner from a plain tuple. Native locked acquisition remains the sole creation route. A resolved pointer is an observation; another session still fails local ownership assertion. Cache content integrity and cloud freshness remain the responsibilities of the existing store/manifest and transition validators.

TDD evidence: absent module initially failed both entrypoints (plumbing failure, no behavioral claim). A minimal empty interface then produced 56 behavioral failures and zero passes. The first implementation produced 55 passes and one failure: a duplicate JSON key was silently accepted by JSON.parse. Requiring the exact canonical encoding written by the native immutable writer removes that ambiguity. Focused final counts and review evidence will be added after actual completion.

The package inventory receives exactly one runtime module and an explicit presence assertion. No exclusions, cap changes or headroom were introduced. The extraction retains Task 7 claim and lock tests; new filesystem/process fixtures stay in integration, while the required unit entrypoint remains offline and pure.

No public lifecycle writer activation, explicit handoff, foreign-host adoption, remote lock guarantee, cache-content validation or cloud freshness is claimed. Task 9 owns handoff. No historical/comparable/corpus/rubric/adaptive estimation lookup was used. Native lifecycle and current-target reads remain bounded and captured. Raw collector and frozen baseline remain intact; the prior recovery capture gap and incomplete cost/HTTP/size coverage remain as recorded in the deep dive.

Focused verification completed: 132 tests passed, zero failures, across the new registry unit/integration tests, accepted claim unit/integration regressions and package-boundary tests. This includes the 56 new registry cases after the duplicate-key repair. Full fast suite, lint and independent review remain pending at this checkpoint.

A further concrete boundary test reproduced acceptance of an unknown registry-identity field after opening (one failing test). Revalidating the closed identity shape fixed it; the combined focused run is now 133 passed, zero failed. The governed command extension succeeded at native body version 38; its exact operation is retained alongside this audit. The full lint invocation exited zero before this last small guard/test addition; final-head verification remains required.

The full fast suite completed successfully: all 985 files passed. Full lint and full formatting completed with exit zero at implementation head. The independent round-1 reviewer separately verified 133 passing focused tests, found no runtime defects, and identified two coverage precision issues. Both are addressed in the test-only follow-up with no runtime change. The full report and all author dispositions are retained.

The strengthened coverage run completed with 141 passing focused tests, zero failures and zero skipped. It includes canonical semantic-corruption fixtures, seven malformed-native-identity cases against a valid registry, and stale owning-worktree refusal with the cache bytes retained. Production code remains byte-identical to the reviewed implementation commit.

Independent round 2 inspected the test-only correction, reran 65 registry tests with zero failures/skips, and confirmed both findings resolved with no remaining findings. Both complete reports and author dispositions are committed before final-head CI. No separate child delivery or aggregate merge is authorized by these bounded review verdicts.

Final reviewed-code verification completed: all 985 fast test files passed, full lint exited zero, full formatting exited zero, and whitespace checks passed. Subsequent edits add only this verification record, the verbatim follow-up report and its explicit dispositions; targeted formatting/spelling checks passed for those documents. A fresh origin fetch confirmed the published predecessor remains `7fb170042a19bd42560b39ca0c2b487f6402d717` and is an ancestor of this work. Final aggregate exact-head cloud CI and native acceptance remain outstanding at commit time.
