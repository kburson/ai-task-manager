# Historical Delivery Intent Reconstruction Design

## Problem

Issue #1562 added an explicit merge-method reconciliation lane for a merged pull
request whose observed topology differs from configured delivery policy. That
lane is reachable only while the local checkout still equals the accepted
review SHA. A pull request merged before #1562 cannot use that code at its
accepted SHA; advancing to current code changes delivery authority to the
historical path, which requires an intent that the original failed delivery
never wrote.

The result is a closed loop for genuinely delivered issues such as #680. The
fix must recover authority from durable provider and Git observations without
turning an operator's claim into evidence.

## Decision

Add one explicit historical reconstruction path beside, not inside, the
ordinary historical-intent validator.

The path is eligible only when all of the following are true:

- the accepted delivery authority reports an advanced local head;
- no live delivery intent exists;
- the operator supplied the existing `--reconcile-merge-method` flag and a
  substantive `--reason`;
- exactly one matching pull request is merged against the configured trunk;
- its recorded head equals the exact Test and accepted Review SHA;
- its merge topology unambiguously proves the declared merge method;
- its merge commit is reachable from the freshly fetched resolved trunk ref;
- the issue, owner, timer, review authorization, root lineage, attribution, and
  dirty-path checks pass.

Every value used to build the reconstructed intent comes from the pull-request
record, current configuration, accepted lifecycle evidence, or inspected Git
objects. The declared method is checked against observation and is not used as
proof. The operator supplies no intent, SHA, pull-request identity, branch,
base, or evidence method.

## Components

### Historical reconstruction preflight

`delivery-preflight.mjs` gains
`validateHistoricalReconstructionPreflight(input)`. Its exact input shape is
the existing historical input without `intent`. It reuses the same private
issue/binding, lineage, pull-request, accepted-head, dirty-path, configuration,
and attribution validators. It requires `headRelation === 'advanced'` and a
merged pull request, then returns a frozen preflight projection containing the
accepted SHA, observed local head, resolved configured method, and derived
commit text.

`validateHistoricalRecoveryPreflight` remains unchanged and continues to
require a prior non-external intent.

### Reconciliation evidence versioning

Existing `aitm.delivery-method-reconciliation/v1` bytes remain valid and keep
their exact key set. A reconstruction uses
`aitm.delivery-method-reconciliation/v2`, whose exact key set adds:

```text
intentOrigin: retroactively-reconstructed
```

The v2 visible record states that no delivery-time intent existed and that the
external intent was reconstructed from provider and Git evidence. Validation
accepts exact v1 or exact v2 records only; it rejects missing, extra, or
cross-version fields.

### Deliver routing

For an advanced local head:

1. If a live non-external intent exists, run the existing historical recovery
   path unchanged.
2. If no intent exists and reconciliation was not explicitly requested, retain
   the existing `delivery-preflight:historical-intent` refusal.
3. If no intent exists and reconciliation was explicitly requested, run the
   new reconstruction preflight and observe the merge topology.
4. Resolve the declared method against observed and configured methods.
5. Build the v2 reconciliation record and a prospective external intent.
6. Run the external delivery verifier in its existing recovery mode before any
   comment write. Its internal recovery flag is carried into the authority-SHA
   check so the truthful advanced local HEAD is accepted; the exact public input
   schema, trunk-reachability proof, topology inspection, and merge-method
   equality remain unchanged.
7. Append the reconciliation record, append/read back the external intent, and
   append/read back the receipt.

The receipt remains `aitm.delivery-receipt/v1`. The intent remains
`aitm.delivery-intent/v1` with provider `external`; the v2 reconciliation record
is what distinguishes its retroactive origin.

## Failure and Recovery Semantics

All failed proof paths mutate nothing. An unmerged pull request, stale accepted
SHA, wrong branch/base, dirty overlap, disabled provider-action configuration,
unattributable topology, declaration mismatch, no-op method, unreachable merge
commit, missing reason, or absent explicit flag refuses before any new issue
comment.

Comment creation retains the existing exact read-back checks for intent and
receipt records. A retry after an ambiguous write reconciles from provider
state using the established delivery-record projection. The reconstruction
record is written only after the complete read-only verifier succeeds.

## Testing

Focused tests cover:

- exact v1 compatibility and exact v2 origin validation;
- v2 visible wording and tamper/extra-key refusal;
- advanced-head/no-intent reconstruction preflight success;
- preflight refusal for current head, unmerged PR, mismatched evidence SHA,
  dirty overlap, wrong lineage, and invalid configuration;
- end-to-end reproduction of the current `historical-intent` refusal;
- explicit reconciliation producing a reconstructed intent and receipt;
- zero writes when the flag is absent, the reason is invalid, topology is
  unattributable or mismatched, or the merge is unreachable from trunk;
- focused RED/GREEN proof that external recovery accepts an advanced observed
  local HEAD without adding `recovery` to the exact public input schema;
- unchanged success for ordinary historical recovery with a prior intent;
- unchanged merge-method equality regression coverage in
  `delivery-verification.mjs`.

The governed issue commands run lint, format, unit, integration, fast, and slow
suites before review and delivery. After the fix is on trunk, #680 is the live
provider/Git proof target.

## Scope Boundaries

This change does not weaken `delivery-verification.mjs` merge-method equality,
add a generic close bypass, accept an operator-supplied intent or SHA, rewrite
historical records, or implement #1573's help-text work. The only verifier
change carries its already-selected internal external-recovery mode into the
authority-SHA check; it does not expand the public input schema.

## Dependency Map

Depends on #1562. Blocks #680. The operator has sequenced #1531 after #680.
