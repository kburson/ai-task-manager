# #2145 canonical approval runtime qualification

This report records Task 1 of the accepted six-hour completion plan. It is not a delivery or closure receipt for #2145 or #2169.

## Defects and bounded repair

The legacy transcript reader could not resolve the real host item for #2169's existing approval. Shared exception-record validation also rejected its authentic line breaks. The new strict v2 authorization source names a canonical thread, turn, session, item and statement hash. The fixed `codex app-server --stdio` reader initializes, reads the thread and pages the named turn; it never resumes a chat or sends input. It rejects foreign identity, nonhuman/injected content, missing/duplicate items, changed text, malformed replies, repeated cursors, timeout and oversized output.

The ordinary v1 exception record preserves the actual host reference and multiline statement. Delivery-v2 requests and records explicitly refuse this adapter. Legacy transcript sources remain supported.

## Actual native observation

On 2026-11-08, the production transport read the original user approval from thread/session `01a1b283-8514-7192-9ef4-5f878fd2f9ee`, turn `01a1b78b-3bce-7dd3-a1d7-c9bdbfbfda46`, item `01a1b78b-3da5-7bb3-bdf0-a0f5e6cd36a9`. The result was role `user`, statement length 1,014, and `sha256:ff3e90b12f15f126da3e429a67fb98c5fd8388fdc05db40f9ae7b722035da785`. This read wrote no workflow exception. The original #2169 source remains a separate subject.

## Verification

The source/reference and multiline regression cases failed before the repair and passed afterward. The delivery-v2 refusal cases initially showed missing exceptions and then passed. Transport tests exercise pagination, identity, injection, ambiguity, malformed output, timeout, output bounds, fixed command and refusal of mutating RPC methods. Existing ordinary exception and delivery-waiver suites remain green.

The package test packs the actual runtime, verifies archive integrity and selected source bytes, installs it in a distinct Git subject, and keeps an old unscoped self-link present. It runs the packaged native authority resolver, shared record reader, real CLI and generated bash guard. V8 coverage confirms the installed package paths. The subject's original HEAD and clean tracked status remain unchanged. Host messages in this package fixture are explicitly synthetic; only the native observation above refers to the owner's real approval.

The transition-tail qualification reproduced a mixed-runtime defect: the installed operator selected the retained unscoped `task-tracker.mjs` for `end`, which dispatches Close and imports the old workflow-policy reader. The helpers now prefer the invoking runtime's own scripts, retaining the legacy fallback. The same package test verifies both tail selections, and existing cache/unpark integration tests pass.

Package qualification is not yet live #2169 activation, Review, delivery or Close. Those require separate native operations against its unchanged approved source and existing bounded waiver.
