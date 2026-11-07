# #2146 native recovery spike archive

This lossless archive preserves the completed investigation's full verifier read set. It does not implement recovery or demonstrate native-host activation. Original findings include mixed results and failed expected-refusal assertions.

## Immutable inventory

| Item                      | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| Original source commit    | `2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0`                         |
| Original source tree      | `36a4b5ba652094df909b05b4a99352bb7e41233d`                         |
| Original manifest SHA256  | `78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781` |
| Index SHA256              | `c67a987feba8924e7ed54fa5615a739c14a99e3eb5696ee66f447b1220e4a2b5` |
| Compressed objects SHA256 | `e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859` |
| Inventory                 | 1133 original artifacts plus their manifest; 1134 regular files    |
| Content storage           | 593 unique contents; all 541 repeated-content entries retained     |
| Expanded / unique bytes   | 119208600 / 5549342                                                |
| Index / gzip bytes        | 255394 / 1841366                                                   |

The closed index lists every original path, content hash, size and captured permission mode. The gzip stream contains a sorted JSON array of SHA256/base64 pairs and a final newline. No source is executed when inspecting it. Every original manifest member is preserved byte for byte, including the original verifier, harness, report and proposed defect plan. Twelve source files are validated from the exact historical Git object, not from an external original checkout.

Gzip uses level9 and a fixed ten-byte header, including the original OS byte19 on every encoder host. This preserves the reviewed carrier bytes. The integration round-trip check compares rebuilt compressed bytes to the independent recorded SHA256; actual Linux CI must establish that encoder qualification. A local passing run alone does not establish cross-platform compression equivalence.

## Disclosure and provenance

Independent exact-inventory review accepted these data bytes for the authorized tracked-transfer/publication scope. Selected credential/token/private-key, sensitive credential-key, authorization-value, URL user information and whole-word sk scans found no matches. These are bounded observations, not universal credential-absence proof.

Known personal paths occur in 743 files/4295 occurrences. The exact known native owner identity occurs in 526 files/2194 occurrences; identity-key names occur in 163 files/900 occurrences. These query-specific counts supersede an earlier unqualified 415-file count that was not reproduced. Provenance paths and IDs are retained faithfully under explicit preservation authority.

All405 cookie occurrences are path fields in81 dependency inventories containing only mode/path/hash/size records. Twelve secrets fragments occur in9 qualification files;9 authorization references occur only in the original report, defect plan and verifier. Candidate modes are0644. The original pinned manifest has no permission evidence, so historical permission equality is unverified.

## Verification domains

Repository-only tooling under `scripts/research/2146-native-recovery/` validates the fixed archive and reconstructs historical source in a newly owned physical repository using local Git objects only. It does not run the archived harness, old CLI, provider seams or recovery experiments. Missing historical objects fail without fetching. Unknown paths, traversal, links, changed pins and unsafe Git execution configuration refuse.

The strict `verify.mjs report` and `verify.mjs plan` commands distinguish the actual committed archive carrier from the historical reconstruction. They preserve the original81 execution-record/16 matrix-case assertions and the outcomes `exactRecovery: UNIMPLEMENTED` and `nativeHostActivation: UNPROVEN`. Reconstructed cleanliness does not prove the original live checkout is clean or recoverable.

The successful output's `gitCommands` and a failure ledger's `commands` record historical reconstruction commands and later source-Git callbacks. They do not include the carrier's configuration, status or committed-blob inspection reads. A refusal before reconstruction allocation can therefore have an empty command ledger even though carrier inspection ran. Carrier Git reads disable optional writes with `--no-optional-locks`, including status refreshes of the index; they preserve the caller's environment and retain the existing configuration checks.

The fixed Git runner also preserves inherited `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` metadata. These values can appear in the new reconstruction repository's reflog; they do not change the pinned historical commit or authorize an AITM actor. The runner does not set or normalize identity values. All other nonempty `GIT_` variables remain refused except the exact pairs `GIT_PAGER=cat`, `GIT_TERMINAL_PROMPT=0` and `GIT_OPTIONAL_LOCKS=0`. Repository, index, object, configuration, trace, helper, transport and date overrides remain refused. Invalid inherited identity may cause a normal Git failure.

The original failed native Test, rejected absolute-path alternative, failed trunk CI setup, successful historical e3 CI and premature local reconstruction remain separate records. None qualifies a new carrier commit. Complete exact-head CI, independent implementation review and a fresh native Test receipt are required for delivery.

## Related records

- [Original findings](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618558333)
- [Original proposed recovery-defect plan](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618563606)
- [Accepted archival design](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6667583156)
- [Accepted archival plan](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6667585990)
- [Review and qualification history](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6667588806)

This code, archive and tests are repository-only assets. Verify the real npm pack inventory excludes them before delivery; no product command, hook, policy, dependency or package export is added.

## Delivered source integration

The carrier includes the already delivered source at `e3ca90f3bb72136da82bbd6735b779f4d6a5d067` through ordinary merge `40851592e306d17bf0355af9a7acbe05317fcec5`. Its first parent is the reviewed archival correction at `6a0b29ccedcea71c6e74b270c642921af8c707e0`; its second parent is the delivered source. The complete merge tree matches the independently reviewed projection. This inherited source is distinct from the archival implementation.

The separately authorized integration replaces the earlier live source freeze while preserving the original source commit, all raw artifacts and archive pins. Four of the twelve original source paths now have the delivered bytes in the live carrier. Their historical assertions still use the original commit and its reconstruction. Original findings and accepted documents remain historical records; they do not claim the changed live carrier has the old source bytes.

Genuine native diagnostics before and after the merge matched the owner, binding generation and timing entry, with only the expected commit change. Their runtime comparison covers the observed helper only. Physical source and configured entry paths are recorded separately; neither observation proves every module loaded, whole runtime identity or live recovery. The complete accepted amendment, independent review and separate execution authority are retained in the [integration audit](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6672471749) and authority history. Each final carrier commit still requires its own independent review, strict verification, full CI and native Test evidence.

## Final delivered-target qualification

The ordinary integration 31e8bd3bdbc71009e2017241d5f30eeb783be27a preserves preparation parent 215d82e9c32da7714a13dca0b109d0888948e260 and delivered target 2e5a3feec6d6296778f767977cf8086f587d1967. Its complete tree is 6cf01ccb63fcf1eb554f244a7afcd86360e5f3a2 (4,746 entries). The index was independently compared by the author against the union of both real parents and their e3 merge base; the sole shared changed path, cspell.json, merged automatically to the previously pinned 4,825-byte combined content. All 42 carrier inputs remain byte-identical to the pre-integration inventory.

The Git-backed historical metadata extraction is preserved at commit 215d82e9c32da7714a13dca0b109d0888948e260. Its fenced 7,455-byte payload is exact; the live issue retains Scope, deep dive, AC/VC/DoD declarations and actual proof records. This creates space for ordinary qualification records without changing evidence semantics.

The coordinator explicitly authorized this integration on 2026-11-07 under the human minimum delivery/closure instruction. Delivery of #2169 is sequencing preference, not an executable prerequisite for this archive. The earlier first-Z planning review accepted an oversized-body STOP conclusion; its uncertain Claude attempt remains unresolved historical evidence and is not represented as accepted. No new live recovery or native-host activation follows.

This provenance records source admission only. Final-head local verification, package inspection, CI, independent implementation review and serialized native Test remain required; none is claimed here prospectively.
