# #2146 archival continuation review history

This record preserves decisions and refusals. It is not execution proof or a native approval marker. Requested independent reviewer configuration was Astra6/xhigh; no independent runtime attestation was available. Reviews below were read-only, with no child delegation.

## Existing deliverable and failed native qualification

- Original findings: <https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618558333>.
- Proposed recovery-defect plan, still not production implementation authority: <https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6618563606>.
- Native activation and legitimate deliverable marker: <https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6666009381>.
- Published-deliverable review: <https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6666119316>.
- Native Test failure at `e3ca90f3bb72136da82bbd6735b779f4d6a5d067`: <https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6666074750>. The two original ignored verifier commands were absent from the clean sandbox, and complete slow-lane CI artifacts were missing. Native Test returned the issue to Develop; no successful Test receipt resulted.
- Original-source feasibility/diagnosis: <https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6666180102>.
- CI dispatch on trunk, run [42087421351](https://github.com/kburson/ai-task-manager/actions/runs/42087421351), failed during setup when the trunk materialization fetch targeted the checked-out branch. Test steps were skipped; this was not an assertion failure.
- Corrected dispatch on `codex/2146-ci-e3ca90f3`, run [42088285990](https://github.com/kburson/ai-task-manager/actions/runs/42088285990), completed successfully at the exact e3 commit with all nine required unique, unexpired artifacts. This is not a native Test receipt and cannot qualify a future archival commit.

## Conceptual archive review

The first conceptual review found no established Critical flaw, but required five Important resolutions: distinguish reconstructed historical cleanliness from original live cleanliness; classify a retained adapter as executable verification tooling; qualify the exact carrier commit and actual native sandbox; contain the full archive/read set with independent pins; review the concrete original-to-adapted diff and exercise real assertion negatives.

Owner disposition: accepted all five. No archive construction or production implementation was approved by that conceptual review. The review did not independently inspect original raw evidence, establish publication suitability or prove activation/recovery.

## Rejected absolute-path alternative

The coordinator requested an existing-workflow alternative before archive implementation. Root's pure declaration probe accepted both absolute-path Node commands without running either verifier or Test. The original verifier resolves evidence and original HEAD from its module location, so absolute invocation would retain its existing assertions and historical `r.out` paths.

The independent reviewer inspected immutable `verification-allowlist.mjs`, `test.mjs` and `verification-receipt.mjs` at e3 and confirmed identical Git blobs at historical 2fd. It rejected the route under the pinned-receipt requirement: canonical argv does not pin external verifier/harness/manifest/evidence bytes; internal hashes in an unpinned manifest are only self-consistency checks. The existing Test receipt reuse branch can return `already-verified` after external ignored evidence changes, without rerunning the verifier. Prose hashes, ignored extra arguments, manual checks and forced reruns do not repair receipt authority/freshness.

Owner disposition: rejected the absolute-path correction. No VC edit or Test retry occurred. Preserve this finding rather than claiming the grammar itself rejected absolute paths.

## Scan refusal and admitted scoped scans

An inline Node read-only scanner was rejected before execution because the hook interpreted regex text `/CODEX_THREAD_ID` as an outside-scope path. Root retained the refusal and did not reroute that invocation. The coordinator explicitly authorized ordinary in-root `rg` scans with filename/count/category-only output; those reads were admitted. Their bounded results and limitations are in the design. No credential values were output and no universal publication-safety claim was made.

## Design and plan review round 1

Reviewed design SHA-256: `3b1ed59f8cb9cd65d1995397f4d1c2ef64cfcf4f631ab02243dedfd71e4b792d`.
Reviewed plan SHA-256: `18d483c4e4651cade5b41360afab77fb9640a814a6c10cee463749053108a6fe`.

Verdict: changes requested; no Critical finding. Three Important findings required replacing unsupported native Plan renewal, distinguishing run directories from file inventory entries, and checking Git environment/configuration redirection and helper execution. Two smaller clarifications required the canonical scratch helper and an explicit concurrency assumption rather than a false ancestor-swap race-proof claim.

Owner disposition: accepted every finding. Round 2 revises those requirements, adds actual CI/native object-availability qualification, preserves root Story Intent and records the Develop-stage scope extension without fabricating native Plan approval.

The reviewer read the exact draft files normally and verified their hashes. Its subsequent local `git --version` probe was refused before execution:

```text
Command blocked by PreToolUse hook: AITM worktree binding mismatch for #2146.
Bound: /Users/kpburson/.codex/worktrees/3d20/ai-task-manager (codex/2146-draft)
Invoking: /Users/kpburson/.codex/worktrees/2146-owner-deliverable-close/ai-task-manager (HEAD)
Refusing this write-or-verify command before Bash execution.
```

The reviewer did not retry, relocate, override or reroute the probe. Root did not proxy it. Candidate-stage local Git qualification remains distinct work by the genuine native owner.

## Round 2 submission

Design SHA-256: `1ea45b5c124834cfabdd62a0e2de2309014cecc67611c16afda0f810bd50c08d`.
Plan SHA-256: `d7e41a2e5ff92c10c0e4298f8f33c6f370ef3dac185b85887414844201702fd3`.

The same independent reviewer accepted these exact revisions with no remaining Critical or Important design-level findings. All three Important findings and both smaller clarifications were resolved. The accepted scope permits ignored candidate construction and the subsequent gated sequence; it does not approve an unbuilt candidate, disclosure, implementation equivalence or lifecycle completion. Governed Scope append succeeded at issue body version 79, with no state move or original Plan-marker replacement.

The reviewer declined independent judgment of raw hashes/measurements/scans, the live issue-body update, actual archive/extraction/adapter/Git/receipt behavior, and CI/native Test/delivery/Close outcomes. Both document reads and hash checks were normally admitted. This pass made no Git/runtime probe, artifact scan, mutation, experiment or delegation. The earlier probe refusal remains history. Requested Astra6/xhigh remains independently unattested.

## Allocation and pager addenda

Allocation addendum SHA2563666f2024f7fb836357e2f5dc7d348f505e15a2a279008d62bdda328f026449e was accepted. mkdtempProjectIsolated is not an empty allocator: it creates/copies a prototype via Git init/add/commit. The archive path instead uses resolveScratchRoot with an explicit physically validated carrier, verifies equality, then allocates a private filesystem child in the registered test-fixtures namespace. The excluded prototype helper was never called by reconstruction.

Pager addendum SHA2562819b6cb6506ffdbe9ff1b5e83efeab942584ba1d6fa1d11d2b52e569136b4b8 was accepted after genuine owner environment inspection found GIT_PAGER=cat. Allow only that exact additional value; every fixed Git invocation starts with --no-pager. Preserve inherited environment unchanged and all other unsupported GIT_* refusals. These are design acceptances, not execution qualification.

The independent reviewer supported the explicit helper-call branch from admitted source reads but its separate Python import-graph traversal was refused for native invoking/bound-worktree mismatch. It did not retry/reroute/proxy. Owner implementation-side static inspection of33 modules is recorded separately, including actual import-time process.getuid/os.hostname/randomBytes observations; it is author evidence, not independent closure certification.

## Exact data inventory acceptance

Accepted index SHA256c67a987feba8924e7ed54fa5615a739c14a99e3eb5696ee66f447b1220e4a2b5 (255394 bytes) and gzip SHA256e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859 (1841366 bytes). All1134 files,593 unique contents,541 repeated-content entries and119208600 expanded bytes matched the pinned manifest; all independent executable/report/plan pins matched. Bounded scans identified no credential blocker for authorized tracked transfer/publication.

Corrected disclosure: exact known native owner identity appears in526 files/2194 occurrences, versus the unreproduced earlier415-file claim; identity-key names appear in163 files/900 occurrences. Known paths appear in743 files/4295 occurrences. Cookie405 hits are dependency path fields;12 secrets fragments and9 authorization scope references were classified without exposing values. Universal credential absence is not proven. Candidate modes are0644; historical permission equality is unverified because the original manifest has no mode evidence.

Cross-platform gzip regeneration was not tested by the inventory review. Author subsequently fixed the builder's header OS byte to the original19 and rejects alternate headers, preserving both accepted data hashes. A new corruption negative failed first, then27 packaging tests passed locally. Actual Linux regeneration remains required and unproven.

## Concrete reconstruction review and sequencing deviation

Initial reviewed reconstruct.mjs SHA2565f286ac744a009d9dd0c602bc3c1c5540efe24cfcc97bd1770fc1bb9b8245323; test SHA2564e256425ee83d6c1ff07ef0c5bfc7ea182ee001dfa6fde325cf90113b42f9b2f. Two Important findings: full unsafe Git configuration keys can disclose URL-subsection credentials; unexpected failure loses its subprocess ledger and unconditional test cleanup erases its root. No Critical finding. Static normal sequence follows the accepted new-root-only Git contract, but execution was not independently qualified.

Before that verdict, the owner's intended exclusion filter ran all20 tests including positive reconstruction. This was a sequencing mistake, not retrospective approval. Exact invocation, surviving log, missing serialized snapshots/argv limitation, normal success cleanup, stop/pause and coordinator disposition are in2026-11-05-2146-premature-reconstruction.md. Native pause retained Unknown Active; coordinator explicitly authorized correction after full review, then clarified normal resume before edits. Native resume exited0.

An inert fixture and actual Node26.8.1 internal source established that ancestor-name matching admitted the descendant through the broad negative expression. Positive reconstruction now lives in a separate one-test entry. Both Important findings were reproduced by failing-first tests; corrected separate refusal/allocation suite passed21/21. The corrected code and actual premature log were resubmitted for independent acceptance. No second positive run yet; no source reset, guard waiver or invented approval marker.

## c612 CI failures and accepted compatibility amendments

The exact c6122150649195489abd5f1eb5a116411d440a8a committed increment passed local qualification and final independent review, published at [owned audit6671277143](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6671277143). Full [CI42122538436](https://github.com/kburson/ai-task-manager/actions/runs/42122538436) then failed all three integration groups. Unit, slow and both package jobs passed, but the complete run did not qualify delivery.

Group3 job127578332094/artifact13460300548 failed six archival files because the unchanged workflow supplies GIT author/committer name/email metadata that the validator rejected. The same independent reviewer accepted identity amendment d6bf94adcdc6fda91115289156dcda29fad4f24883cd1dbad3252aebd5af662a; full review b5501a4d248a6e9c082613b0337ecf54c24b7da88e9a9ce4e60944819a59331d is preserved in the authority aggregate. The coordinator separately authorized this narrow correction conditional on that acceptance and real regression evidence. Exactly four case-sensitive metadata names are admitted unchanged; every other nonempty GIT control remains refused except the three existing benign pairs. Only the new clone's reflog may reflect the inherited metadata; historical commits and native actor authority remain distinct.

An initial local test omitted the path import; that setup error is preserved separately. After correcting the import with production still unchanged, the real child fixture failed at reconstruct:git-environment:GIT_AUTHOR_NAME before allocation. The literal four-name Set then passed42 targeted tests. After formatting and the final negative-control example, all94tests in the seven suites that permit uncommitted tooling passed. The two actual strict current-head CLI tests remain mandatory after a real new commit. Full local output is retained in the captured execution record, not substituted for CI.

Groups1/2 failed five unchanged native-bootstrap test files with untrusted-executable refusals on Ubuntu26.04.1. Artifact IDs are13460017878 and13459142933. The already-delivered #2148 workflow selected Ubuntu24.04 for the verified tool layout. The same reviewer accepted the exact runner amendment dd446e349defdcb432c4f9017988b49a1e83aa8e7adedbc956eee2be52aed839; full review d4ee0a64d9c1bfc763390ed57fc64ce4821606133ac309ad644abc4c9e2a741c is preserved. Coordinator authority explicitly adds one existing path to the original closed scope: .github/workflows/ci.yml. Exactly seven runner replacements and the delivered comment yield17228bytes/SHA2560ad4bc41793cf5964076c9a3a46387d2fcaeeccb660c6239653b746d95f43e6a, byte-identical to #2148 commit13dba5c003eb3dd13d8042d5874bd0cc752d8653 and e3. No product source, test condition or required lane is changed by that amendment.

Both complete proposals and independent reviews were published and read back exactly at [owned audit6671792218](https://github.com/kburson/ai-task-manager/issues/2146#issuecomment-6671792218). Requested Astra6/xhigh remains independently unattested. These are design acceptances; final combined implementation review, actual new-head CI and native qualification remain separate gates.

The attempted optional local CI log export was refused before execution as WRITE_OTHER. It remains stopped, with no alternative export or policy change. Hosted logs and preserved artifacts remain the failed-run authority. A later coordinator read-only delivery-proof check identified independently modified cspell blobs as a possible future Close blocker. It is a planning concern, not an attempted or failed Close. Ordinary delivered-trunk integration is under separate same-reviewer inquiry; no merge, binding change or runtime integration is authorized by the two compatibility amendments recorded here.
