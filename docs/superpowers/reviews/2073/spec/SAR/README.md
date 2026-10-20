# #2073 specification SAR record

Persistent native single-agent review/revision for the user-requested specification-only SAR. Requested dispatch: `gpt-6-astra`, reasoning effort `high`, agent `/root/sar_2073`. [Parent workflow evidence](parent-workflow.md) records that launch; it is not per-turn provider attestation. The same agent performed review and author revision, not an independent peer or CLI SPR/XPR.

[Canonical final specification](../../../../specs/2026-10-20-2073-refinement-graphql-traffic-design.md).

| Round | Reviewed input | SHA256 | Full response | Author disposition | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | [spec.r0.md](spec.r0.md) | `d25c897e85a6d4dedcdc217bcc6974b5cb7aa60a5b5ad4c52958b5326f61702e` | [review-response.r1.md](review-response.r1.md) | [author-disposition.r1.md](author-disposition.r1.md) | Revise; F1–F8 addressed in r1. |
| 2 | [spec.r1.md](spec.r1.md) | `f39c366da1dab5cb9e8994822ec27a74ee77715a387b29eec860cadbd903c9a7` | [review-response.r2.md](review-response.r2.md) | [author-disposition.r2.md](author-disposition.r2.md) | Revise; F9–F10 addressed in r2. |
| 3 | [spec.r2.md](spec.r2.md) | `5820102f7e5e775b0067bfa294f33a663b619e0ebed546c0cc22d543c2e5f651` | [review-response.r3.md](review-response.r3.md) | [author-disposition.r3.md](author-disposition.r3.md) | Formatting revision only; F11 addressed in r3. |
| 4 | [spec.r3.md](spec.r3.md) | `32d1f1e733600c1c71797fb0f549d5734eeb34bcae3bbe4b3a7cf64721fb0600` | [review-response.r4.md](review-response.r4.md) | [author-disposition.r4.md](author-disposition.r4.md) | Initial convergence; reopened by parent final markdownlint evidence. |
| 5 | [spec.r3.md](spec.r3.md) | `32d1f1e733600c1c71797fb0f549d5734eeb34bcae3bbe4b3a7cf64721fb0600` | [review-response.r5.md](review-response.r5.md) | [author-disposition.r5.md](author-disposition.r5.md) | Revise; F12 tracking-link lint fix addressed in r4. |
| 6 | [spec.r4.md](spec.r4.md) | `04682ad4c797d328b4675d866af6908e061b256cb15ad82fe523fb9363cc7d68` | [review-response.r6.md](review-response.r6.md) | [author-disposition.r6.md](author-disposition.r6.md) | Final full-document reread: zero new/unresolved actionable findings. |

Six recorded rounds: five full-document reviews and one focused parent-lint reopening, four revisions, five immutable inputs. Twelve unique findings: ten substantive and two formatting/lint. Dispositions: twelve addressed, zero deferred, zero rejected. No unresolved actionable finding remains against the canonical specification. Round 4 made no revision; the later r4 snapshot was created after round 5. Terminal round 6 made no revision; no spec.r5.md exists. Do not reformat historical snapshots.

The canonical final SHA256 is `04682ad4c797d328b4675d866af6908e061b256cb15ad82fe523fb9363cc7d68` and its bytes equal spec.r4.md. [Source manifest](source-manifest.md) identifies 24 local source/fixture files by SHA256; these hashes were rechecked at final terminal review. They are review provenance, not a production traffic baseline or Git-state attestation. The original spec's source checkout reference is retained as historical context only.

Historical spec.r0.md through spec.r3.md preserve known MD034 bare-URL findings. Canonical and r4 contain the corrected tracking link. The latest full-root markdownlint invocation examined 943 files and exited 1 with exactly those four historical findings. This is explicitly not a full-root lint pass; snapshots remain unchanged and repository lint configuration was not weakened. Parent final checks may report this historical-only limitation separately.

The draft now specifies strict leaf classification and phased continuity, typed target evidence and complete null semantics, finite read limits, per-checkpoint sharing boundaries, unchanged sealed schemas, fresh recovery/readback and conservative predecessor checks. It requires a rerunnable independent baseline and real runtime-route coverage, and distinguishes leaf shape savings from publication dispatch reduction. The four-hour allocation is explicitly unvalidated; its future inventory/estimate gate remains. A possible split is only a later owner option; no scope split, source-story mutation or budget change was enacted.

Verification performed: complete specification/source review, all five exact snapshot hashes, canonical equality, source-byte consistency, the exact link-only r4 delta and a passing canonical Prettier check. Root markdownlint reported only the four disclosed historical-input MD034 findings. No implementation tests or empirical savings were claimed. The reviewer wrote only the canonical spec and this SAR directory, ran no Git/network/task-state commands and preserved parent-workflow.md. The parent retains final diff/lint/staging/commit/timing responsibility. Blocked memory access and two document-write parser refusals are recorded in round 1; no guard bypass occurred.

**SAR converged — document readiness only.** No native Refine/specification approval, Plan approval, lifecycle movement, implementation authority, CLI SPR/XPR acceptance or validated estimate follows. #2039 refinement remains paused.

## Evidence packaging

The parent packages the source manifest and usage checkpoint as [source-manifest.md](source-manifest.md) and [usage-checkpoint.md](usage-checkpoint.md), with their original JSON payloads preserved byte-for-byte inside fenced code blocks. This keeps review evidence within the drafting workflow's eligible Markdown document paths; standalone JSON collateral was classified as code for commit admission. No repository guard or policy is weakened.

Historical review responses mentioning `source-manifest.json` refer to the same retained JSON payload now enclosed in `source-manifest.md`. Their text remains unchanged to preserve review history. The wrapper change does not modify the canonical specification, any immutable spec snapshot, source-file hash values or usage observations, and requires no additional specification review round. The parent owns wrapper creation and byte-equality verification.
