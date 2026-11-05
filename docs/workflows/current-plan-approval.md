<!-- cspell:ignore aaff WFFQSAYKTYJ precheck digestless handwaved -->

# Current Plan approval after a policy exemption

A completed historical `approval.plan` outcome of `not-required` records an
exemption, not approval. After reviewing the current scope, governed linked plan
and source, use this explicit command from the target issue's bound checkout:

```sh
TT_FULL_AUTO=1 npx aitm plan-approve 2153 --current-scope
```

Replace `2153` with the target issue. This lane supports Develop, Test and Review.
It requires authenticated immutable policy-exempt Plan-to-Develop completion,
substantive current Story Intent, current planning evidence, a clean Git tree and
a tracked regular plan whose bytes match `HEAD:path`. Directory authority and
epics are unsupported. It conflicts with `--repair-from-evidence`, which retains
its existing revoked-waiver reconstruction contract. Existing human, ordinary
Full-Auto and waiver approvals are preserved and refuse this lane.

Success returns `approved-current-scope` or `already-approved-current-scope`
(exit 0). Only the approval marker and canonical audit change. State, source,
Test evidence and visits are preserved. The `current-approval-digest` binds
current scope, source HEAD, plan content, Story Intent, forecast, recorded trunk
and historical admission references. Review checks its selected accepted source
HEAD, including an artifact subject, and the recorded provenance. It does not
substitute the operator checkout HEAD or a later live trunk.

Invalid, duplicate or conflicting arguments exit 2. Eligibility, drift,
persistence and audit failures exit 15 with blockers. An audit/readback failure
can leave a persisted marker. Inspect current readback, correct the reported
evidence and retry the explicit command; do not hand-edit approval or substitute
a manually posted audit. Identical evidence retains its timestamp and reconciles
the audit. Changed scope, source, plan, forecast or live trunk requires a new
digest and approval timestamp. Prior audits remain historical.

Approve final verification-stamped scope. If existing resident Review
normalization changes scope identity, inspect and explicitly approve that final
body, then retry Review. The supported sequence converges directly or after one
reapproval at the same source HEAD. Repeating drift is a defect; do not normalize
away substantive differences or waive the audit.

## Activating the delivered correction for #2147

Begin only after #2153 reaches verified trunk. The coordinator owns activation;
this document does not assert activation occurred.

1. Preserve the aaff checkout, accepted source
   `83cbc7d2afd6268cf9913079497a8b40654533a6`, Test receipt
   `01M6N4D6WFFQSAYKTYJ8HW3ZZ6`, CI `41974816469`, PR #2152 and sealed reviews.
2. At that checkout, use normal code-rework demotion with reason
   `Integrate delivered #2153 current-approval correction`. Integrate delivered
   trunk through the supported branch workflow, producing a genuinely new HEAD.
   Do not swap another checkout's runtime or self-link, manufacture changes or
   jump state.
3. Review current plan, scope and resulting source. Obtain current review for
   any substantive mismatch; the old exemption does not resolve it.
4. Re-run required native qualification, exact-head source review, Develop
   finalization, CI and Test at the new HEAD. Preserve old receipts as history;
   they cannot qualify newly integrated source.
5. Run `TT_FULL_AUTO=1 npx aitm plan-approve 2147 --current-scope` using the
   delivered runtime at the recorded checkout against final stamped evidence.
   Require fresh readback and canonical audit before normal Review. If
   normalization changes scope, inspect/reapprove that final body once and retry.

Transport-isolated tests exercise public command dispatch, immutable history,
real local Git, resident Review normalization/pass reuse and code integration.
They are not native host qualification or evidence of live #2147 changes.
