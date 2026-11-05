`scripts/task-tracker/lib/delivery-authority.mjs` pins the accepted SHA to the review or Test receipt in `resolveAcceptedDeliveryHead`, then in `resolveAcceptedDeliveryAuthority` selects the pull request by exact head equality:

```js
const matches = pullRequests.filter(
  (pullRequest) => isObject(pullRequest) && pullRequest.headRefOid === acceptedSha
);
if (matches.length !== 1) fail('ambiguous-pr');
```

Both halves are individually correct. Together they assume the pull-request head never moves between approval and delivery. Any post-approval push breaks that assumption, and a routine `merge trunk` to pick up a dependency is the most common way it happens.

The `headRelation` field already distinguishes `current` from `advanced`, but it is computed from `localHeadSha` against the accepted SHA — it describes the local checkout, not the pull request. There is no corresponding notion of a pull request whose head advanced past the accepted SHA.

The failure is terminal once the pull request merges:

- The current-head path in `delivery-preflight.mjs` requires `headRelation === 'current'` and a pull request matching the accepted SHA. The head cannot be moved back after merge.
- The historical-recovery path requires `headRelation === 'advanced'` AND a prior accepted-SHA delivery intent. No intent exists, because `deliver` never got past pull-request selection to record one.
- `close` calls the same authority resolver and therefore inherits the refusal.

The only reachable workaround is to demote to Develop and re-run the governed Test at the new head — which requires `demote --rework`, a flag whose stated contract is code rework. There is no code rework in this scenario; the code is final and already merged. Using it is a misuse of the flag's intent and it invalidates evidence that then has to be regenerated.
