# #1393 Governed Squash Attribution Verification Design

## Problem

Governed squash delivery authorizes a title containing the top-level issue token and a message whose final line contains the complete attribution-token set. After PR #1391 merged with those exact bytes, receipt verification failed because `verifyLiveDelivery` asked the generic subject-only `attributingCommits` engine to find every body token on trunk.

That engine is correct for commit-trace and close gates. It is the wrong evidence source for a delivery receipt that has already fetched trunk, proved the merge commit reachable, inspected that exact commit, and checked its authorized bytes.

## Design

Add a delivery-local assertion over `inspection.commitMessage` and the verified intent:

- require exactly one `Attribution:` line;
- derive the canonical line from the top-level issue token followed by the intent's remaining sorted attribution tokens;
- require byte equality with that canonical line;
- fail with `delivery-verification:attribution` for a missing, duplicated, reordered, malformed, or unauthorized token line.

Run the assertion after live merge inspection and merge-method classification. For an ordinary intent, the existing exact-byte comparison remains authoritative. For external recovery, the assertion constrains the observed bytes before they are recorded in the recovered intent.

Remove the per-token subject-only trunk lookup from delivery verification. Keep the injected dependency and generic attribution module unchanged for API compatibility and for their existing non-delivery consumers.

## Safety Properties

- The merge commit must still be reachable from freshly fetched `origin/trunk`.
- PR head, local HEAD, Test receipt, and accepted Review SHA must still agree.
- Merge method and merge commit structure must still verify.
- Ordinary delivery must still match the previously authorized title and message exactly.
- External recovery must still record inspected live bytes rather than synthesized bytes.

## Verification

Add focused unit coverage for a valid multi-token squash message and for missing, duplicated, reordered, malformed, and unauthorized attribution lines. Retain the existing generic commit-attribution tests and full repository verification.
