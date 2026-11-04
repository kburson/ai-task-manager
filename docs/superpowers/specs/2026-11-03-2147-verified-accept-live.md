# Verified accept-live reconciliation for #2147

An operator uses accept-live to record the current board state on the issue. A successful exit means that an authoritative read confirmed the repaired state before the session cache or reconciliation audit recorded success.

## Write and readback

Preserve the initial recorded state and stage visit history as preconditions. A missing state may be normalized from a known live board state. Accept a single supported current marker or a valid legacy representation. Reject malformed, duplicate or conflicting state evidence. The existing reader deliberately selects a preferred match, so callers needing uniqueness must inspect the complete marker family before using its normalized value. Preserve old entries byte-for-byte and use the existing visit-aware append rule once per transition. Preserve existing demotion evidence invalidation for Test or Review to Develop.

Derive edits from the writer's fresh body so independent prose changes survive. Check the preconditions at every retry, including a three-way rebase that can reuse a previous edit without invoking the original transform. A competing state or visit change requires fresh operator investigation. A retry must recognize this operation's previously confirmed result without appending a second visit.

Handle the retry helper's failure result and retain its diagnostic comment. A rejected or unconfirmed write exits nonzero. A confirmed write followed by an unavailable or disagreeing authoritative read exits nonzero with an explicit partial result. Identify the issue, proposed state and reason. Preserve any remote effect and leave the prior local state and success audit alone. Verify the unique persisted state and expected visit and check that the live board still agrees. Unrelated remote prose changes alone do not invalidate the result. Subsequent remote edits remain possible.

## Qualification

Use real public entry in a repository created through the physical test fixture helper. Constrain the provider double to its local issue, endpoints and requests. Observe the command result, provider body, writes, failure comments, success audit and local record independently. Run rejected-write, acknowledged-but-dropped, post-confirmation mismatch, fresh-base concurrent edit and verified success cases. Preserve existing visit, legacy and demotion regressions.

Branch admission belongs to B2. Recovery of the frozen attempt and runtime activation have separate authority. See the [published specification and tested evidence](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618563606).
