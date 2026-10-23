# #2052 bounded snapshot verification

The native Plan approval and Plan to Develop transition completed before production edits. Agent-produced local estimate remains S/3.5h, wave 3. No cloud historical estimation input was read.

The first 31 offline behavior cases and provider fixture were written before snapshot-reader.mjs. Running the exact named verifier failed with ERR_MODULE_NOT_FOUND for that production module. Implementing the reader made all 31 cases pass. Additional characterization coverage then expanded the snapshot suite to 47 cases; combined with the unchanged predecessor verifier, 85 tests passed. The additional cases were not claimed to have failed before implementation.

The transport returns raw JSON text. The private invocation budget counts attempts before dispatch, counts returned UTF-8 bytes before parsing, and cannot reset across repeated reads. Failed observations taint the token, preventing hidden replay. Concurrent callers cannot interleave requests through one token. Captured coverage describes returned JSON, not HTTP wire traffic. Native transport deadlines remain the caller's responsibility; this module adds no subprocess or retry.

The target-only GraphQL document requests current edit metadata first:1 without history diffs. First census requests current comments, assignees and item fields; continuation pages select one unfinished connection. Every page binds current issue and item identity, and checks the issue content/title anchor. Completion proves census coverage, not provider atomicity. Later snapshot comparison and transition admission remain separate slices.

Configured field declarations are local ID/type inputs. Missing configured values use {state:absent}, distinct from observed null. The sorted selected field inventory participates in the canonicalized fields digest. Unconfigured computed values are excluded from publication fields but their provider identity must still be readable. Comments retain current source metadata and remain read-only.

Tests cover current native edits/tombstones, equal-count comment replacement, canonical assignment, all supported configured field kinds, partial responses, wrong subject/project/item/comment membership, duplicate inventories, changed counts/cursors, issue drift, raw whitespace/non-ASCII byte accounting, shared dispatch exhaustion, failed transport reuse and concurrent reads. Fixture requests remain offline; no test makes a GitHub API call.

The exact npm package surface registers only the single intentional new runtime module, with an explicit presence assertion. No new package dependency or exclusion is introduced. Review and full native Test remain pending.
