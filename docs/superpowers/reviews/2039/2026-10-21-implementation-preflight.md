# #2039 implementation preflight — preparation only

No child implementation has begun. This note carries interface/ownership checks forward while GitHub is exhausted; it is not native Plan approval or a completion record. The accepted active plan remains pinned at 0ad57329a5eb4e3aec395adb06a6216178e45c87, with base technical contracts at f2894455a97bb80f6afb82ce5ff722cad2a46c2b. Execute the actual child in native Develop only, after #2079 delivery and parent admission.

## Shared producer/consumer checks

- #2040 produces `observeContent({identity,node,body}) -> ResourceObservation`; #2052 and #2041 consume validated observations in wave 3. The active leaf retains this export, while snapshot reading is owned by #2052 and cross-snapshot comparison by #2053. Do not absorb those later capabilities into #2040.
- The base Task 1 names `scripts/tests/helpers/story-cache-fixtures.mjs` and `createStoryFixture({comments,assignees,fields})`, while the active first leaf explicitly lists only its production module and targeted test. Ruling: if the named shared fixture is needed for #2040's native-history tests, create its minimal offline observation fixture in the wave-2 producer; retain the declared helper interface and extend transport fixtures only in their owning later slice. This is test support already required by the base contract, not another production component or permission to edit a parallel peer's files. Cost if wrong: move the fixture's ownership before consumers begin; no public activation or wave may depend on an unaccepted peer.
- #2040 must preserve the concrete base seed: a node with id, null lastEditedAt, false includesCreatedEdit, totalCount 0 and an empty nodes array is a supported unedited observation; the seed does not include __typename or pageInfo. Do not invent an incompatible requirement without a source-grounded ruling. Complete zero-count data and absence/error remain distinct. Root GraphQL transport errors are #2052's reader responsibility; missing or inconsistent metadata still refuses within observeContent.
- Resource hashes are exact current UTF-8 body SHA-256 hex, independent of revision equality. Opaque native edit IDs never become arithmetic versions. `generation` and `publicationGeneration` are local persistence/batch counters, not cloud overwrite authority. The metadata writer's legacy body-version numbers in source reconciliation receipts are not proposed product revision tokens.
- Shared identity fields are host, repository, issueNumber, issueNodeId, projectId and projectItemId. Native observation, storage and later claims must preserve the same canonical identity. Existing native record payloadHash uses sha256:; new cache digest fields use lowercase bare 64-hex. Convert at typed boundaries only.
- All later slices consume declared predecessor contracts after native Done. Same wave numbers express possible parallel order, not permission for shared-worktree concurrent writes. This worktree remains single-writer. The source tasks 32/33/35/36 remain real deferred children under blocked epic #2075.

## Verification and evidence limits

Use the leaf's exact verifier, observed failing behavior test, minimal owned implementation, passing targeted verification, required native exact-head checks and retained review dispositions. The active plan's earlier 36-slice administrative notes and base estimates are historical, not current allocation or implementation prohibition. Each current leaf remains 2.5–3.5 hours; no historical cloud corpus/comparable/rubric is an estimation input. Current target/active WBS/dependency authority reads remain required and captured.

The native quota incident prevents remote mutation now. It does not authorize an offline ownership bypass, synthetic approval, deadline increase or an alternate token. After the actual GraphQL reset, revalidate current ownership/binding and resume the remaining metadata-only source corrections, using the registered bind-readiness Explain for those switches and full promotion Explain only at real state boundaries. Retain source-writer read-back as publication evidence; bind readiness alone proves neither an existing binding nor intended body bytes.

## First leaf behavior matrix checked against retained provider evidence

This is local preparation; no #2040 verifier or implementation has run. The accepted native-revision probe is `native-revisions/2026-10-19-native-revision-probe.md`. Its observed first:1 response was the latest current edit; last:1 was creation. Do not implement count arithmetic or traverse history diffs. Preserve the recorded distinction between tested older-history redaction and unverified latest-history deletion.

| Input class | Required first-leaf behavior | Ownership boundary |
| --- | --- | --- |
| Complete zero-edit shape from the concrete base seed | Return explicit unedited mode and exact current UTF-8 hash | #2040; no required typename/pageInfo absent from the accepted seed |
| Edited current node with usable latest ID, matching timestamps and null deletion | Retain opaque revision identity and exact current hash independently | #2040; no ordering or greater-ID comparison |
| Same revision metadata with different current bytes | Hash changes; revision equality alone cannot authorize publication | #2040 observation; #2053 owns cross-snapshot comparison |
| Missing edit connection, missing/inconsistent metadata or latest tombstone | Typed observation unavailable; never select an older surviving edit | #2040; reconciliation remains a later capability |
| GraphQL transport errors or incomplete whole census | Reject incomplete snapshot before it is usable | #2052; do not absorb transport into #2040 |
| Added/deleted/replaced comments with an equal total count | Inventory and snapshot comparison detect drift | #2052/#2053, not count-derived revision identifiers |
| Unsupported native history with readable current bytes | No silent digest-only downgrade | Explicit reconciliation policy in later owning slice |

The base plan's old combined 8h Task 1 is technical source, not the current estimate or permission to absorb its reader/comparison siblings. The active plan bounds #2040 to 3h, #2052 to 3.5h and #2053 to 2.5h, with their declared wave/dependency order. The current root source reconciliation is complete; the remaining preflight boundary is native parent promotion and #2079 delivery, not another child-metadata rewrite.
