# GitHub native revision probe — #2039

Status: completed bounded experiment. Native per-resource revision IDs are adopted only with explicit unedited handling, current-content hash validation and the limits below. This is provider behavior evidence, not product implementation verification or SAR acceptance.

## Authority and scope

The owner requested live verification of native edit IDs for unedited bodies, comments and deleted history, then a conditional specification update. No production issue body was edited by the probe. One marked diagnostic comment on #2039 was created and edited. The owner separately authorized deleting only its A→B revision at `2026-10-20T02:08:14.922Z`.

Budget: at most 12 explicit API requests; 9 used, with no automatic retries. No backlog enumeration, estimation run or quota polling. Browser traffic/cost is opaque and recorded separately. AITM bind/Explain/timing infrastructure is outside these explicit experiment calls and also has incomplete cost coverage.

## Request ledger

| Request | Operation                                                         | Result                                                                                               | Returned cost |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| 1       | Targeted #2039/#1 metadata and public mutation-name introspection | Success; no public history-deletion mutation                                                         | 1             |
| 2       | Known #2037/#2038 and AIPR #225 body history                      | Partial: #2038 is not an Issue; other results returned. #225 has 77 records, none deleted. No retry. | 1             |
| 3       | Create diagnostic comment on #2039                                | Success; unedited fixture                                                                            | Unknown       |
| 4       | Known GitHub docs #34689 and AIPR #276/#277 body metadata         | Success; docs #34689 unedited                                                                        | 1             |
| 5       | Edit fixture A→B                                                  | Success; two records including creation                                                              | Unknown       |
| 6       | Submit identical B                                                | Success; no token/timestamp/history change                                                           | Unknown       |
| 7       | Edit fixture B→C                                                  | Success; new latest edit ID                                                                          | Unknown       |
| 8       | Direct fixture lookup, `first:1` and `last:1`                     | Success; newest and creation respectively                                                            | 1             |
| 9       | Fixture and deleted B edit lookup after authorized UI deletion    | Success; B tombstoned, current C unchanged                                                           | 1             |

Five returned query costs total 5 points; four mutation costs are unknown. This is not complete HTTP quota accounting or the whole session's cost. One UI history deletion adds opaque browser traffic. Refused local commands before dispatch are not provider requests: one redirected query was blocked by the hook and then invoked read-only without redirection. Query 2 is a partial observation, not an entirely successful request.

## Unedited bodies and comments

`github/docs#34689`, node `I_kwDOC01lZ86Xdo2k`, returned:

```json
{
  "lastEditedAt": null,
  "includesCreatedEdit": false,
  "userContentEdits": { "totalCount": 0, "nodes": [] }
}
```

Existing #2039 commit-trail comment node `IC_kwDOSU6LgM8AAAABdlPqfg`, created/updated `2026-10-20T00:10:58Z`, returned the same null/false/zero/empty combination. The new diagnostic comment also returned it at creation. Unedited content therefore cannot require a non-null native edit ID; distinguish a complete observed empty history from an inaccessible/null/error response.

## Controlled comment edits

Fixture: [comment 6281544963](https://github.com/kburson/ai-task-manager/issues/2039#issuecomment-6281544963), node `IC_kwDOSU6LgM8AAAABdmjFAw`.

Its fixed prefix is `AITM #2039 native revision probe. Disposable diagnostic fixture; not workflow evidence.` Initial suffix: `Initial content A.` First edit: `Edited content B.` Current suffix: `Edited content C.`

| State              | API count | First edit ID                            | Last edited timestamp  |
| ------------------ | --------- | ---------------------------------------- | ---------------------- |
| Created A          | 0         | None                                     | Null                   |
| Edited B           | 2         | `UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuRi2Q` | `2026-10-20T01:58:55Z` |
| Identical B update | 2         | Same B ID                                | Same timestamp         |
| Edited C           | 3         | `UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuR7UQ` | `2026-10-20T01:59:21Z` |

After B, `includesCreatedEdit:true`; the additional record was creation ID `UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuRi1Q`, timestamp `2026-10-20T01:58:41Z`. After C, `first:3` returned C, B, creation in descending edited time. Request 8 independently returned C with `first:1` and creation with `last:1`. This is observed ordering for the fixture, not an invented permanent ordering guarantee.

The UI displayed **Edited 2 times** after C, while the API connection count was **3**, because the API includes creation. Do not treat the connection count as the visible edit count or an incrementing concurrency version.

The existing edited #2039 body returned first edit ID `UCE_lAHOSU6LgM8AAAABYadOLc8AAAABDI9_TA`, `lastEditedAt:2026-10-20T01:57:32Z`, count 8, `includesCreatedEdit:true`. Normal AITM resume changed its body before the query; this was not a diagnostic body edit.

## Deleted history

The public mutation-name schema exposed no `deleteUserContentEdit`. The authenticated UI exposed **Delete this edit revision** for A→B, then the irreversible-history warning and **Remove**. Following the owner's specific confirmation, the UI reported **Deleted kburson deleted this revision**. Only that diagnostic revision was deleted; current C remained intact.

Request 9 returned:

```json
{
  "commentId": "IC_kwDOSU6LgM8AAAABdmjFAw",
  "body": "AITM #2039 native revision probe. Disposable diagnostic fixture; not workflow evidence. Edited content C.",
  "updatedAt": "2026-10-20T01:59:21Z",
  "lastEditedAt": "2026-10-20T01:59:21Z",
  "includesCreatedEdit": true,
  "totalCount": 3,
  "hasNextPage": false,
  "edits": [
    {
      "id": "UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuR7UQ",
      "editedAt": "2026-10-20T01:59:21Z",
      "deletedAt": null
    },
    {
      "id": "UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuRi2Q",
      "editedAt": "2026-10-20T01:58:55Z",
      "deletedAt": "2026-10-20T02:08:31Z",
      "diff": "deleted"
    },
    {
      "id": "UCE_lALOSU6LgM8AAAABdmjFA88AAAABNuRi1Q",
      "editedAt": "2026-10-20T01:58:41Z",
      "deletedAt": null
    }
  ]
}
```

Direct lookup of the B edit node retained the same edit ID, original edited timestamp and deletion timestamp, and returned `diff:"deleted"`. Latest C ID, count, current content and comment timestamps did not change. A latest-edit token cannot detect historical redaction; deleting history did not create a new current-content revision.

## Adoption decision

Use native edit IDs as opaque per-resource current-content observations, with explicit unedited mode and content-hash comparison. They are not integer versions, whole-story snapshots or provider-enforced write preconditions. Retain a manifest revision vector, exact base/working content, dirty tags and a single local batch/publication identity. Never increment a GitHub edit ID or treat a greater count as permission to overwrite.

During initial hydration and verified publication, retain exact current-content digests. At transition validation, query current body/comment content and native metadata together once per bounded page/batch; compare hashes as well as tokens before mutation. This retains one bounded content observation rather than claiming metadata alone proves equality. Local minor edits and timing events require no per-edit cloud verification.

Current-body/comment caching does not require downloading historical diffs. If historical diffs are ever cached separately, a bounded explicit history refresh must honor known deletion tombstones; latest ID/count/timestamps alone cannot promise redaction detection. Do not ingest historical diffs for estimation, automatically resurrect deleted revisions, or treat `diff:"deleted"` as current content.

The probe did not delete the latest C revision, an issue-body revision or the comment itself. It did not exercise alternate permissions or simultaneous writers. Those are explicit unverified boundary cases. Unknown/deleted latest-history authority requires a current-content read and reconciliation; never silently select an older surviving edit as the latest revision. Missing/inaccessible content refuses publication. No provider-supported expected-edit-ID mutation argument was established, so the check/write race remains.

## Documentation

- [Issue/comment revision fields and mutation inputs](https://docs.github.com/en/graphql/reference/issues).
- [UserContentEdit and connections](https://docs.github.com/en/graphql/reference/users#usercontentedit).
