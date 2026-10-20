# #2073 whole-implementation review

Reviewed range: `69b5b18b377d7fe886390b4d98d2fa0d6d41e85f` to `ca8e27895259537d8ebbe634e4023d77b7b37f28`.

Requirements: `docs/superpowers/specs/2026-10-20-2073-refinement-graphql-traffic-design.md` and `docs/superpowers/plans/2026-10-20-2073-refinement-graphql-traffic.md`, with the explicit rulings in the execution ledger. Rubric: `/Users/kpburson/.codex/skills/requesting-code-review/code-reviewer.md`.

This is the single fresh-context implementation review. I inspected the production changes, their unchanged publication orchestration, the offline provider/runner and fixture changes, focused tests, configuration exceptions, and relevant retained evidence in bounded passes. I made no product, Git, binding, lifecycle or GitHub changes and dispatched no additional reviewer.

## Strengths

- The concrete field adapters now use fresh exact-target observations while the surrounding complete authority, ownership, checkpoint, before-record and publication protocol remain unchanged. The separate binding envelope does not alter durable subjects or operation identities.
- The target reader distinguishes unavailable evidence from unset values, checks current field definitions and option identity, bounds both enumerated connections under one observation deadline, and strictly validates current and legacy body blocks.
- The production strict kind classifier is factored without changing the complete collector's classification policy. Ordinary unmarked leaves remain supported.
- The comparison reports accurately limit their claim to publication dispatches. I independently parsed the retained paired JSON: both baseline runs are identical, their dispatch counts are 313, the optimized count is 179, and complete durable snapshots, fixture hashes and configuration hashes agree. All costs are explicitly unknown and both compared ledgers have zero failed dispatches. The retained baseline source has no scripts changes relative to the implementation base.
- Recovery tests exercise the real publication boundary, including applied mutations with lost acknowledgements and an actual pre-change pending record. Native route evidence is distinguished from whole-command completion.
- The membership-ceiling amendment is documented, baseline-only and leaves the optimized ceiling intact. Historical lint exceptions are narrowly scoped.

## Issues

### Critical

None found.

### Important

#### R1 — [P2] Select the identity required by both item-field continuation validators

Locations: `scripts/task-tracker/lib/decomposition-hook-authority.mjs:207` and `scripts/task-tracker/lib/decomposition-hook-authority.mjs:270`; new validations are at lines 211 and 274.

Both the root and child `fieldValues` continuation queries select only `fieldValues` inside `ProjectV2Item`. They then call the new `assertItem`, which requires the returned item ID, project ID, issue ID/number and repository identity. A real selection-correct GraphQL response cannot contain these unselected properties, so any otherwise valid second page fails with `mixed item page`. The final-fence continuation correctly selects these properties, but the earlier root/child continuations do not.

This regresses the promised bounded-pagination path: an operator whose root or child item requires another values page cannot pass the activity/source/Plan-exit collector, even with unchanged valid authority. The current traffic fixture inventory covers comment and child-inventory continuations but does not register/exercise these two item-value shapes, which lets the regression escape the selected-response tests.

Reviewer verification: an in-memory invocation of the actual `collectHookDecompositionSnapshot` returned a valid first root with `fieldValues.pageInfo = { hasNextPage: true, endCursor: "next" }`, followed by the complete selected continuation `{ data: { node: { fieldValues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } }`. It refused on the second request with `mixed item page`. The emitted query began `query {node(id:"ITEM"){... on ProjectV2Item{fieldValues(first:100,after:"next")`; it contained none of the identity selections that `assertItem` requires.

Fix both query documents to select the exact identity envelope already used by the fence continuation. Add selection-aware successful pagination regressions for root and child item fields, together with wrong item/project/content continuation refusals. Register their actual request shapes and apply the existing fixed budgets.

#### R2 — [P2] Compare a complete initial epic inventory before replacing it with the graph

Location: `scripts/task-tracker/lib/decomposition-hook-authority.mjs:225` (initial IDs are captured at line 158; the final-fence baseline is established at line 319).

The initial shallow epic connection is validated and its IDs are captured, but the graph request immediately overwrites `node.subIssues`. The initial IDs are never compared to the completed graph. The fence only compares the graph inventory to the final inventory. Consequently, even when the initial response explicitly reported a complete inventory, child addition, removal or replacement between the first and second phases is forgotten and can be admitted.

The spec requires refusal on an observed child-inventory mismatch. Its instruction to use the completed graph as the fence baseline addresses an initial partial presence read; it does not permit discarding contradictory evidence from an initial complete connection. A user can otherwise receive admission during a child-set change that this new continuity check explicitly promises to detect.

Reviewer verification: in-memory calls through the actual `evaluateHookDecomposition` used a valid epic with one ready child, valid stamped refinement metadata, matching local plan bytes supplied by `readPlanAtCommit`, and identical root body, membership and assignment across all phases. The graph and fence both contained `CHILD`. Each first response had `hasNextPage: false`. Results:

| Initial complete IDs | Graph/fence IDs | Requests | Decision |
| --- | --- | ---: | --- |
| `["CHILD"]` | `["CHILD"]` | 3 | allow |
| `[]` | `["CHILD"]` | 3 | allow |
| `["REPLACED"]` | `["CHILD"]` | 3 | allow |

The latter two cases must refuse. This probe used only in-memory provider data and no filesystem or network writes.

Preserve the initial connection completeness flag and IDs before replacing the connection. For a complete initial inventory, compare its normalized IDs to the completed graph and refuse any mismatch. Continue using the complete graph as the fence baseline for a partial initial presence read. Add initial-to-graph addition/removal/replacement tests, while retaining the 51-child partial-presence case and graph-to-fence replacement refusal.

### Minor

None retained.

## Verification and recommendations

- Reviewer ran `node --test scripts/tests/unit/task-tracker/lib/decomposition-target-observation.test.mjs`: all 33 tests passed.
- Reviewer ran the two additional in-memory production collector probes described above. R1 reproduced the continuation refusal; R2 reproduced admission despite complete initial inventory disagreement.
- Reviewer parsed the two retained baseline reports and optimized report and checked full durable equality and counts directly.
- I inspected the reported 69-case verifier and quality evidence without repeating the full suite. The author reports that `npm run quality` passed 975 fast files; that is retained author evidence, not a fresh full-suite run by this reviewer.
- Address R1 and R2 and run their targeted regressions plus the declared focused verifier. The publication traffic claim itself is supported for its named fixture, but the hook acceptance criteria are not yet satisfied.

## Declined to judge

1. Live GraphQL point savings and hidden HTTP expansion: no comparable live baseline is present; offline response sizes and dispatch counts cannot establish them, and the report correctly leaves them unknown.
2. Exact-head cloud CI, native Test/Review completion and merge authorization: these are explicitly pending owner-controlled workflow steps, outside this read-only review; no approval or completion is inferred.
3. Repair of the existing readiness-schema limit of 50 children: the execution ledger expressly excludes that repair and preserves the pre-existing 51-child refusal after complete bounded collection.
4. Atomicity of concurrent child/comment changes and freshness after the last observed resource: the accepted design explicitly does not guarantee these. R2 concerns a directly observed contradictory complete inventory, not an unobservable race.
5. Durable issue/repository node-ID migration and retroactive ownership for old records: explicitly excluded; invocation-local binding and preserved old subjects are the accepted contract.
6. Broad-authority/general field-parser hardening and redesign of the unchanged publication protocol or unchanged fast path: excluded from this optimization. I assessed their integration with the new readers, but did not expand the story into changing their pre-existing semantics.
7. Actual completion of `runRefine` beyond the promotion sentinel: the route evidence expressly stops there and makes no whole-command success claim.
8. Reconstructing historical approval/quota events from live GitHub: the ledger and retained evidence were reviewed, but live lifecycle authority auditing was not authorized for this reviewer.

## Assessment

**Ready to merge? With fixes.**

The publication optimization and its narrow dispatch comparison are well supported, but the hook collector contains a deterministic valid-pagination regression and fails to reject a directly observed complete child-inventory change. Both are localized, actionable defects in the accepted behavior and should be fixed before completion is declared.
