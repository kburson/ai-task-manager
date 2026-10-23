# Verification record

Commands retain AITM_GRAPHQL_USAGE=1 and TT_FULL_AUTO=1. Native lifecycle calls, including bootstrap/doctor, are retained in the owning app transcript; this file is an index and does not manufacture raw transcripts or attestations.

Focused declared command (vc:1):

`node --test scripts/tests/unit/task-tracker/verbs/refine-verb.test.mjs scripts/tests/unit/task-tracker/verbs/refine-stage-completion.test.mjs scripts/tests/unit/task-tracker/verbs/refine-fields-cache-refresh.test.mjs scripts/tests/unit/task-tracker/verbs/refine-fresh-body-retry.test.mjs scripts/tests/unit/task-tracker/gh/lib/project-tether.test.mjs`

The importing harness executes real runRefine, publication ownership, actual tether and snapshot validation. Provider responses are test fixtures; these tests are not cloud-write probes or production acceptance.

Full outputs will be retained in .scratch/2091, with deterministic gzip copies plus SHA-256 and byte lengths in tracked collateral where raw whitespace would otherwise fail diff checks. No diff check exclusion or raw output truncation is authorized.

Native Test, Review, approval, Close, source adoption and #2089 recovery remain pending the owning chat's serialized acceptance.
