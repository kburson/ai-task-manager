# Ask-the-Script Action Contract

The shared lifecycle authority vocabulary is rooted in
`scripts/task-tracker/lib/lifecycle-policy/actions.mjs`. It enumerates twelve
bare action IDs. The seven version-one explanation lanes are `bind`, `resume`,
`promote`, `test`, `review`, `deliver`, and `close`. The remaining registered
actions (`refine`, `demote`, `shelve`, `park`, and `cancel-plan`) keep their
current execution policies but are not explanation-ready. Querying one of those
lanes returns `action-not-explain-ready`; an unknown ID returns
`unknown-vocabulary`. Registration alone never grants execution authority.

## Shared decision boundary

`scripts/task-tracker/lib/action-decision/contract.mjs` owns the complete
`aitm.action-decision/v1` contract, reserved boundary producers, authority
resource IDs, closed diagnostic definitions, validators, and canonical
vocabulary digest. `remediations.mjs` owns the closed typed remediation
registry. Commands remain action IDs plus validated argument objects; free text
never selects an operation.

Every blocked or indeterminate decision has a nonempty typed blocker set. A
blocker contains a registered producer, code, explicit `args`, and exactly one
registered remediation or `noAutomaticRemediation` disposition. Ready results
have no blockers or human request. Operational warnings and human requests use
closed shapes and preserve producer order, including duplicates.

Issue #1561 consumes these exact bare action IDs, the decision schema, the
remediation registry, and `vocabularyDigest()`. It may add conforming gate
producers through its reviewed extension boundary, but it must not introduce a
parallel action namespace, shell-string remediation, or an alternative decision
contract.

## Legacy refusal inventory

`legacy-refusals.json` freezes every currently registered guard and the seven
version-one verb boundaries at static source sites. A whole legacy guard maps to
one conservative `unclassified-refusal` only while all its reachable legacy
sites still match that inventory. Runtime normalization uses the registered
guard ID; it does not recover a static site ID or parse the diagnostic reason.
Typed results validate directly and never fall back to this adapter.

`npm run lint:action-refusals` parses sources with `espree`. It rejects new,
changed, or stale unclassified sites, incomplete registered-guard coverage,
undeclared action-decision codes, and illegal cross-domain code use. Migration
children replace frozen manual sites with reviewed typed codes and dispositions;
they do not expand the legacy allowance.

## Guard boundary behavior

`guard-registry.mjs` retains legacy `reason` and string `blockers` only as
diagnostic compatibility data. It additionally preserves every typed refusal,
ordered warning, and human request. Multiple typed branches from one guard keep
their distinct codes. Thrown guards become `guard-error`; malformed or invalid
typed results become `guard-result-invalid`. Both are indeterminate and carry a
closed investigation disposition rather than becoming legacy blocked text.
