---
model: gpt-6-astra
effort: high
role: integration-coordinator
canonical_branch: codex/aitm-mcp-adapter-architecture
archived_branch: archive/XPR-SPR-SAR-experiment
canonical_spec_sha256: 4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382
---

# Experiment evidence integration

The user selected the SAR → SPR → XPR architecture already merged through [PR #1724](https://github.com/kburson/ai-task-manager/pull/1724). The reverse XPR → SPR → SAR branch must not replace that specification or be merged into the selected branch.

The integration starts from trunk commit `94c32e12d845b621311a4597ac1dbaf3715c9d67` on `codex/aitm-mcp-adapter-architecture`. It copies only the reverse experiment's 34 review collateral files and the research package from `8acc023b25be38f57abf418bdda54a8248e6e7a9`. All copied review files are byte-identical to their source. Research retrieval documentation is extended to explain the archive. Existing first-experiment reviews and the canonical specification remain byte-identical to trunk. Experimental runtime instructions are not activated.

The former `codex/aitm-mcp-adapter-xpr-first-fresh` branch is renamed to `archive/XPR-SPR-SAR-experiment` at the same tip. A tracked incremental Git bundle also preserves its 15 commits, including every reviewed intermediate spec, independently of branch retention. The archive is historical evidence; importing its objects does not merge the branch or alter the working-tree specification.

## Verification

- In a clean bare proof repository, fetched only trunk with tags disabled and confirmed the reverse tip was absent.
- Verified and imported the bundle, recovered all seven baseline/stage snapshots, and matched their recorded SHA-256 values.
- Confirmed the proof repository still had only the trunk branch after import.
- Compared all 34 copied reverse review files with their original Git blobs.
- Confirmed the canonical spec and `CLAUDE.md` exactly match trunk.
- Ran `npm run quality`: formatting, the full lint chain, and all 872 fast test files passed.

The first ad hoc archive proof incorrectly counted fetched tags as branches and failed that assertion after the snapshot checks. The corrected proof disables tag fetch and checks only `refs/heads/`; it passed. This was a verification-script issue, not an archive-content defect.

The narrow lint exclusions for two sealed protocol directories are retained from the experiment; publication copies and research documents remain linted. Three dictionary entries preserve existing experiment vocabulary. No application implementation changes are part of this integration.
