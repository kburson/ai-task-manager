# #2052 independent code review — round 1

Reviewer: fresh read-only Codex subagent `/root/review_2052_code`, inherited model and reasoning effort. No specific Astra identity claimed. Review was independent of the implementation session; no cloud calls or file mutations.

## Raw reviewer report

```text
Completed independent read-only review of `74b2de0b242d9612583546defd393dd7f0ce3559..be4d77917a6a8569597e9f6608e4093ea800bad1`, plus the working code-unit field-ordering delta. Reviewer used inherited model identity; no Astra claim.

Critical: 0.

Important:

1. **Requested nested revision pagination metadata can be missing while completeness is asserted.** `scripts/task-tracker/lib/story-cache/snapshot-reader.mjs:278` and `:309` pass issue/comment nodes directly to the predecessor observer, whose standalone contract permits absent `userContentEdits.pageInfo`. The snapshot query explicitly requests this metadata and its stricter completeness contract requires unreadable nested shapes to refuse. Reproduction: create a fixture with one comment; delete both issue and comment `userContentEdits.pageInfo`; read with a fresh budget. Actual: `complete:true`, one dispatch. Add reader-specific validation without changing predecessor compatibility.

2. **Missing common field-value IDs are accepted.** `scripts/task-tracker/lib/story-cache/snapshot-reader.mjs:172`. The conditional check validates an ID only when present, allowing a configured `ProjectV2ItemFieldNumberValue` without its requested common-interface `id`. Reproduction: provide `{__typename:'ProjectV2ItemFieldNumberValue', number:3.5, field:{id:'F_A',dataType:'NUMBER',project:{id:'P_test'}}}` and configure `F_A` as NUMBER. Actual: `complete:true` with value `3.5`. Require readable IDs for value types implementing the queried common interface; retain explicit computed-type handling.

3. **Terminal cursor replay escapes pagination refusal.** `scripts/task-tracker/lib/story-cache/snapshot-reader.mjs:137-152`. Cursor repetition is checked only when `hasNextPage` is true. Reproduction: two comment pages, `totalCount:2`, distinct IDs `IC_A`/`IC_B`, first page `hasNextPage:true`, second false, both `endCursor:'same-cursor'`. Actual: `complete:true`, two dispatches. Validate terminal cursor consistency as well as continuation cursors.

Minor: 0.

Validation performed:

- Pinned snapshot and unchanged predecessor verifiers: **85/85 passed**.
- After inspecting the working code-unit ordering repair: **86/86 passed**.
- Three additional bounded offline probes reproduced the findings above.
- Reviewed target-only GraphQL shape against existing local query conventions; no additional schema-shape defect identified.
- Reviewed shared dispatch/byte enforcement, raw UTF-8 accounting, field null/absent semantics, read-only retention, package delta, and issue anchoring. No additional actionable findings.
- Code-unit sorting repair is correct and appropriately tested.
- `atomic:false` accurately describes census completeness; no atomicity guarantee or public activation is required.

No files changed, issue mutations, commits, or cloud/API calls were performed. Approval remains blocked on the three Important findings.
```

## Author dispositions and verification

Accepted all three Important findings. The snapshot reader now requires the pagination metadata it requested, independently of the predecessor's deliberately more permissive standalone seed API. Common-interface value types require their requested IDs, while computed field types retain explicit identity handling. Terminal cursors cannot repeat an earlier cursor, and nonempty terminal pages must expose a readable cursor.

Four new tests (issue and comment pagination separately) failed before repairs: 48 passed / 4 failed with missing expected rejection. After repairs, all 52 snapshot tests and 38 unchanged predecessor tests passed: 90 total. Fixture nonempty connections now model real provider end cursors. No predecessor production code changed.

The author's separate field-ordering test failed before replacing localeCompare with code-unit ordering; 48 snapshot tests passed after that repair. All review findings remain pending independent confirmation in round 2. Exact package inventory passed 9/9 before these metadata-only repairs; complete lint and format checks also passed before the repairs and will be reconfirmed at the final head.
