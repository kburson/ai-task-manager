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

## Session and pickup protocol

Start the timer on the exact issue before source edits, tests, issue writes, or
commits. Set the role at bind (`orchestrator` for an epic, `agent` for a child),
honor the recorded worktree and project preferences, and pause for a blocking
question. Track new follow-up work with an issue before starting it. Use the
sanctioned issue writer; direct `gh issue create` or close and direct
`move-state.mjs` calls bypass lifecycle records. If the board and recorded
state disagree, reconcile before another lifecycle verb.

For Plan-or-later pickup, a failed bootstrap stops source edits. Complete the
deep dive before code, then verify each demonstrable AC and functional DoD item
with its own declared command and exact-head evidence. Do not tick epic boxes
until every child reaches Review. Re-read the latest user message before a
state move or issue switch. On a mistake, stop and surface it before repair;
write issue bodies through the sanctioned operation. A child agent following
the Pickup Directive reports `CODE_COMPLETE` for the orchestrator to review.
The Review rule describes the review command's terminal behavior when that
command is invoked; it does not transfer the child agent's role boundary.

## Locate and adopt a project catalog

Run `npx aitm guidance source --json` from the project to see the selected
catalog's absolute `path`, `sourceType`, `reason`, and `trust`. The package path
comes from the running module and may vary by installation. To customize, copy
the **reported package path** into the one supported project override and
track it:

```bash
npx aitm guidance source --json
mkdir -p .ai-task-manager
cp <reported-package-path> .ai-task-manager/aitm-guidance.yml
npx aitm guidance validate --refresh --json
git add .ai-task-manager/aitm-guidance.yml
```

Replace the angle-bracket placeholder with the `path` returned while the
package source is selected. Review the diff and commit it through the normal
issue workflow. The project file wholly shadows the packaged catalog; there
is no field-level merge. Installation and upgrades do not create an override.
To return to packaged guidance, remove the tracked override through normal
version control, then validate again. Catalog prose is read-only guidance and
cannot add an action, waive a guard, or authorize a provider call.

## Trust states and validation

`npx aitm guidance source --json` distinguishes `published` package content,
`project-owned-current` tracked content identical to the package, and
`project-owned-diverged` tracked customization. A diverged source can be valid;
its use produces a source warning and a post-success issue annotation. A
locally modified tracked file also reports `guidance-project-source-uncommitted`.
`project-untracked` and `published-tampered` are invalid for operational use.
`indeterminate` means source or Git tracking could not be established and is
also a refusal. An override at the wrong path is only a candidate, not the
selected project catalog.

Use `npx aitm guidance validate --refresh --json` for the selected source,
`npx aitm guidance validate --published --refresh --json` for the package, or
`npx aitm guidance validate --file <candidate-path> --refresh --json` before
adopting a draft. Candidate validity does not make that file active or tracked.
Validation rejects unknown fields and operations, bad bindings, forbidden YAML
constructs, oversized content, and missing shipped documentation anchors.
When the selected catalog is invalid, operational commands stop before network
access, issue locks, guards, timers, or provider effects. Recovery routes are
`guidance source`, `guidance validate`, help, and version; `guidance explain`
cannot bypass invalid-source admission.

## Blocked operation recovery

Use `npx aitm explain <issue-number> --action <registered-action> --json` to
inspect current readiness without performing the action. The result carries
typed blockers, ordered warnings, any human request, and closed remediation
IDs. Apply a returned remediation through its sanctioned AITM route, then
query again before an unsettled lifecycle action. A `ready` explanation is
advisory: execution refreshes issue, board, binding, guards, and policy under
its normal lock. Never execute a command inferred from diagnostic prose or
reuse an old explanation as authorization.

If validation blocks the command, first inspect `guidance source` and run the
appropriate validation mode. Repair the selected project file, commit the
repair, or remove it to return to the published package source. A malformed
published catalog requires restoring the installed package bytes and release
fingerprint. An unknown action remains outside the closed vocabulary; an
unresolved navigation result calls for authority investigation and, when
appropriate, sanctioned reconciliation.

## Independent guidance receipts

The `--known <id@digest>` argument reports that a specific agent instruction
digest is already present in the current context. The separate
`--known-source <receipt>` argument suppresses only the matching warning for
a diverged project source. Neither receipt changes readiness or grants an
action. Human explanation digests, a whole prior decision, and source
provenance are not substitutes for the agent instruction receipt.

After compaction, clear, a fresh worker start, or sentinel invalidation,
discard both receipt claims and reload the required instruction files. A
summary can describe prior guidance but cannot attest that its exact
instructions remain in the active context. A new query can then expand the
current guidance and issue a new source receipt if applicable.

## Cache and annotation recovery

AITM caches only validated static guidance under
`.tmp/aitm/guidance-cache/`. If cache identity or publication is
indeterminate, inspect the selected source and validate with `--refresh`.
The cache is disposable: after stopping the affected operation, remove that
directory and rerun validation or the read-only explanation. Do not delete
the tracked override or a durable issue record as a cache repair.

For a successful operation using `project-owned-diverged` guidance, AITM
attempts a deduplicated issue annotation. `guidance-annotation-failed` is an
audit warning after the mutation has already succeeded. Inspect the live
issue and retry the relevant read; do not repeat the mutation just to obtain
the annotation. The annotation records source divergence and never turns
the catalog into execution authority.
