# #2146 archival implementation review r2 — candidate revision 5

Verdict: ACCEPTED for the exact frozen candidate revision 5 as an implementation review. No unresolved Critical, Important or Minor finding remains in this reviewed candidate. The original I1 index-preservation finding, M1 ledger-scope finding and the additional fixture-configuration finding raised during this round are resolved. This is not acceptance of unexecuted committed-carrier, package, CI, native Test, PR delivery or Close gates.

## Scope, identity and method

Review root:

`/Users/kpburson/.codex/worktrees/3d20/ai-task-manager`

Candidate root:

`/Users/kpburson/.codex/worktrees/3d20/ai-task-manager/.scratch/inspect/2146-archive-candidate`

Relative implementation locations below use that candidate root. Evidence locations beginning with .scratch/plan or .scratch/native-recovery-spike use the review root.

This is the same independent reviewer and the second implementation-review report. Requested configuration: Astra6/xhigh; actual model and reasoning configuration remain independently unattested. The review uses direct ordinary reads and hashing with the original checkout as explicit cwd. No Git/runtime probe, test, reconstruction, lifecycle command, issue mutation, candidate edit, archived-script execution, proxy, alternate checkout or child reviewer was used. The only write requested for this round is the new ignored implementation-review-r2 artifact.

The inherited complete implementation inspection covered all seven candidate modules, all eight integration-test files, the README, complete original and adapted verifier source and narrow diff, original harness, and all 33 modules in the declared helper import closure. This round directly rereads the changed files and retained author-execution evidence, checks the frozen 18-file candidate inventory, and rehashes all 33 helper modules and original verifier/harness/manifest/report/plan/diff inputs. Helper review concerns import-time effects, closed import/re-export edges and the explicit scratch-root resolver, not general correctness of unused product APIs.

The frozen manifest is .scratch/plan/2146-archive/candidate-implementation-r5-manifest.json, SHA256 149ff36d210ab51fa3e102d9bd2461a21fcd48ef6133f454d48824ffe82ce3cf. All 18 hashes and sizes match. Six files differ from the inherited complete r1 candidate: carrier.mjs, reconstruct.mjs, the carrier/CLI-contract/reconstruct tests, and README.md. The other twelve candidate files, all 33 helper modules and the original verifier/harness/manifest/report/plan/diff pins remain unchanged. The exact reviewed hashes are appended.

The accepted design remains 1ea45b5c124834cfabdd62a0e2de2309014cecc67611c16afda0f810bd50c08d; plan d7e41a2e5ff92c10c0e4298f8f33c6f370ef3dac185b85887414844201702fd3; allocation addendum 3666f2024f7fb836357e2f5dc7d348f505e15a2a279008d62bdda328f026449e; pager addendum 2819b6cb6506ffdbe9ff1b5e83efeab942584ba1d6fa1d11d2b52e569136b4b8. The separately accepted original-carrier amendment r2 aae41ebbce1f3950ff82f6e2f9ef5747f5e37cc216ccde91e802c248e5cf4dc3 and execution plan 066c37d2c409bfc14a0e39f192338e2b17e45d046fb18a3ba7c62cbcf4e9c29c govern carrier location and source-freeze scope. This implementation review does not reopen their maintenance authority or attest execution of issue-body maintenance.

## Findings and dispositions

Critical: none identified.

Important I1 — RESOLVED. Prevent optional writes during carrier inspection.

Basis: scripts/research/2146-native-recovery/carrier.mjs:80 and :97; scripts/tests/integration/task-tracker/core/2146-archive-carrier.test.mjs:165-216. The accepted design's no-carrier-index-change requirement is the applicable constraint.

The default real Git runner now supplies --no-pager first and --no-optional-locks next. It does not rewrite the caller's environment or weaken configuration checks. The real disposable-repository regression changes only a tracked file's stat information, verifies content identity, then compares raw index bytes around inspectCarrier's default subprocess path. GIT_OPTIONAL_LOCKS is deliberately absent in that test worker during the call and restored afterward in finally. The controlled reader is used only to obtain fixture input inventory; it is not used for the actual preservation assertion.

I directly inspected retained RED and GREEN records. RED has 7 passes/1 failure, a clean carrier status, and unequal index digests e3e296d507c38cba142db3be010c256a99a1635164c57bdfa6d106bda6d765d0 and 355018f61d350c275d3723b284806282858e85f7e30c5c4388dc8daa84e7a25c. GREEN has 8 passes/0 failures and equal before/after digest f31b7aca9f03398d489481facf17a4281d820f45c919efbe588dbbbbdc3672c9. The final revision-5 suite also passes this regression. These are directly read author-execution records; I did not execute the regression. A new public output index-digest field is not required.

Important I2 — RESOLVED during this round. Check real fixture configuration before mutating Git setup.

Basis: scripts/tests/integration/task-tracker/core/2146-archive-carrier.test.mjs:57-78 and :219-241; accepted design :69-73.

The first added regression fixture previously reached init/add/commit before a real effective-config check. Its injected inventory reader could not establish inherited configuration safety. The corrected commitFixture reads actual effective configuration before init, permits the existing carrier-local hook setting only for that pre-init carrier lookup, then checks the private repository with no carrier-hook allowance before add/commit. Active inherited hooks/filters are refused rather than disabled. The negative fixture itself checks inherited configuration before its initial init. No global configuration is changed.

The new regression installs only a harmless hook in its newly owned fixture, then requires configuration refusal before staging or hook-marker creation. RED has 8 passes/1 failure and “Missing expected exception”; GREEN has 9 passes/0 failures and the source asserts no marker and no staged paths. The owner additionally reports the harmless marker exists in the retained RED fixture; I did not inspect that fixture separately and do not independently attest its present contents. The static correction and directly inspected RED/GREEN plus final suite evidence resolve the finding.

Minor M1 — RESOLVED. State the ledger's exact scope.

Basis: docs/archive/2146-native-recovery/README.md:37; verify.mjs:79 and :101.

The README now explicitly states that gitCommands and failure commands contain historical reconstruction and later source-Git callback calls, excluding carrier config/status/committed-blob inspection. It also explains why an early refusal may have an empty ledger after carrier reads. This resolves the audit-labeling issue without claiming a complete subprocess transcript or printing private configuration/stderr.

No other unresolved Critical, Important or Minor finding was identified.

## Strict outer-CLI negatives and quality-only changes

scripts/tests/integration/task-tracker/core/2146-archive-cli-contract.test.mjs:35-157 now closes the previously outstanding actual-CLI drift/pin coverage gap. It creates a real disposable historical source through the checked allocator/reconstruction path, copies the nine current tool/data inputs, makes a real local fixture commit, and first requires strict report success with 81 execution records.

It then changes the executable bytes while setting the fixture's assume-unchanged index flag and requiring clean Git status. Both report and plan must refuse through the actual subprocess, before reconstruction allocation. This tests the committed-blob boundary independently of status. The fixture adapter and flag are then restored. A byte-different but JSON-equivalent original manifest is inserted into a rebuilt object stream/index with corresponding hashes and sizes, committed in the fixture, and both strict modes must again refuse before allocation. No production CLI root/pin override or special acceptance seam was added.

I read strict-cli-negative-qualification.log: 5 passes/0 failures, including the valid control and both refusal modes. The final revision-5 suite includes this test. This establishes the required outer boundary through author execution and independently reviewed test source; it is not a mutation score proving which one of several independent pin/size checks alone causes refusal. The fixture's positive report control does not qualify the actual deliverable carrier or replace committed-positive tests for both modes.

The conventional camel-case Git-key spellings in reconstruct.mjs:28-40 retain row.key.toLowerCase(), anchored case-insensitive exact exceptions, the same deny alternatives and the same allowed values/scopes. Matching semantics are preserved; no hook/filter/environment override is introduced. Corresponding test spelling and README wording changes do not change the evidence or verification domains.

## Full reviewed implementation coverage

1. Archive identity and losslessness. archive.mjs:193-310 checks a closed schema, independent original/source pins, exact counts/sizes, canonical index/object JSON and base64, all member names/hashes, unused objects, ordering/collisions and the fixed gzip header including OS byte 19. Limits are 2 MiB compressed, 8 MiB inflated and the fixed logical extraction size. The identical accepted data preserves 1133 original manifest entries plus the manifest, 593 unique contents and all 541 repeated-content entries. Historical permission equality remains unverified because the original manifest lacks mode evidence.

2. Extraction and read containment. archive.mjs:313-344 requires a validated bundle and empty physical destination, checks ancestors, creates files exclusively and rechecks bytes. historical-context.mjs:49-113 independently pins the original manifest, permits exact listed artifacts and twelve historical source paths, rejects links/unlisted reads, maps recorded absolute run directories only from the exact historical prefix into inventory-derived directories, and exposes only fixed HEAD/status Git reads. There is no original-root fallback. The accepted no-hostile-same-user-replacement assumption remains; these checks are not a universal filesystem race sandbox.

3. Historical reconstruction. reconstruct.mjs validates inherited Git environment, physical carrier/allocation, effective configuration and actual local historical commit/tree before clone. Its private root and empty template are used with a local shared no-checkout clone; update-ref/read-tree affect only the newly owned repository. The old CLI, archived harness, provider seams and recovery experiments are never invoked. Missing objects refuse without fetch. Unsafe settings emit fixed categories, not raw values. Unexpected failures retain the owned root and sanitized command/status diagnostics; the strict CLI retains later source-Git callback history as well.

4. Helper closure. The 33 declared modules form a closed graph of 59 relative import/re-export edges. The inherited full direct inspection found import-time declarations, collections/data, pure policy construction, promisify, AsyncLocalStorage, process.getuid, os.hostname and randomBytes(8). Those last operations are actual import-time effects. No application filesystem/subprocess/provider mutation was found at import time. scratch-dir.mjs:52-57 passes the explicit physically validated root to project-dir.mjs:45-47, which returns before runtime/binding/provider discovery; the allocator checks equality. mkdtempProjectIsolated and its Git prototype path remain unused. Every module hash is unchanged in this round.

5. Assertion preservation. Complete original/adapted source and narrow diff inspection, plus an independent lexical count, identified all 46 original assertion-call expressions in the derivative. The accepted changes are bounded I/O imports, historical directory mapping, a callable function and truthful result-domain labeling. The HEAD/status/source-file hashes, all artifact hashes, matrix evidence, per-run executable/dependency identities, baseline/runtime preservation, timing/actor invariants, partial-write/readback behavior, reflog acceptance, blocked activation, transport qualification, failed prevention, rejected remote-Git events and report/plan language checks remain. This is static equivalence reasoning under mapped inputs, not a fresh execution of the original verifier or a formal equivalence proof. The original harness/verifier remain archived data, never imported for execution.

6. Actual carrier identity. verify.mjs accepts only report or plan, derives its carrier from the module location plus actual cwd, and rejects runtime injection options. carrier.mjs checks actual HEAD, cleanliness and all 42 declared code/data/helper files against actual committed blobs. The two adapted modules are separately copied and digest-checked before import. Before/after carrier checks and explicit output assertions retain 81 records, 16 cases, exactRecovery UNIMPLEMENTED and nativeHostActivation UNPROVEN. Internal negative-test contexts are not public CLI overrides. The I1 correction additionally prevents optional writes during carrier reads.

7. Test scope. All eight complete test files were inspected across the full review and this revision. Coverage includes corruption/missing/extra/path/link/inflation/header refusal, deterministic round-trip, bounded mapping, environment/configuration rejection, allocation without Git, retained failures, actual historical reconstruction, both adapted modes and eight semantic corruptions, dirty/source-hash/wrong-HEAD/missing-member/missing-object cases, actual carrier index preservation, setup hook refusal, controlled carrier-byte checks, actual outer-CLI drift/manifest refusal, unsupported invocation, and two strict committed-positive registrations. The eighth committed-positive file remains deliberately unexecuted on the eventual real carrier. That deferral is explicit, not a skip accepted as qualification.

## Evidence and qualification limits

I directly read the final candidate-implementation-r5-tests.log and checked its hash. It records 74 passes, 0 failures, 0 skipped and 0 cancelled across the seven-file candidate suite. Its retained historical reconstruction record has the exact original commit/tree, 13 reconstruction/callback commands, and equal carrier HEAD/index/ref digests before and after. Its semantic record covers both modes, eight semantic negatives and an actual missing-object refusal at cat-file with status 128, without a subsequent fetch/clone. The index-preservation and strict-CLI records are also present. These are author-produced execution evidence, not tests run by this reviewer and not native receipts.

The final quality JSON is likewise author-produced and bound to the revision-5 manifest. Targeted editable-file formatting/spelling/ESLint results do not replace full project lint/format or native develop finalization.

Still required before delivery:

- Both strict modes from the actual clean committed carrier, including the eighth integration file, using Git-only historical-object availability without external raw evidence, fetch or skip.
- Actual package inventory exclusion of code/tests/archive; Linux deterministic regeneration; complete exact-carrier-head CI, including the integration lane.
- Full project quality checks and fresh develop finalization, native Test at that exact carrier head, normal PR/Review/delivery/Close gates. Old source/e3 CI cannot qualify a new carrier commit.
- Review/verification of the final tracked transfer and later provenance/authority-history documentation. Those later documentation bytes and issue-body maintenance results are outside this candidate code verdict.

The earlier exact inventory/disclosure acceptance applies to the unchanged index/gzip bytes. I did not repeat all 1133 raw-file hashes or a universal credential scan. Known local paths/native IDs remain permitted provenance under the previously reviewed disclosure scope; bounded scans remain bounded. Original recovery, old-runtime/native-host activation and Unknown timing retain their recorded limitations.

## Separate Markdown proposal and refusal history

The separately scoped Markdown compatibility proposal remains accepted at SHA256 1977759c79766e3f32ed070c46c03332ce943eeebfa7c9dc770f3979801f572b: only the exact historical premature-reconstruction document's MD034:false override with combine:merge. The inherited review directly checked installed markdownlint-cli2 0.23.3 schema and actual CLI override/filter/merge implementation, not only config precedent. The owner later reported unchanged-file RED, real 1038-file CLI GREEN and an unrelated MD034 control still failing, record digest 330826c3f4e95eeceb6679e964f41df037d9fb87911ee6b383a1f39e141c0e88. That later qualification record was not independently inspected here. This narrow proposal acceptance does not widen code or quality exemptions.

The implementation-r1 report-file write was refused before execution. The returned refusal prefix was “Command blocked by PreToolUse hook: Access to path outside allowed scope:”; its rejected token was the review-root path printed above with an attached prose period. The complete verbatim refusal remains in the native r1 response. No implementation-r1 report file or file hash was created, and no retry was made then. This new r2 artifact uses correctly delimited prose paths under the coordinator's explicit transparent lexical-correction authority. No actual scope refusal is treated as authorization to change transport or bypass a guard.

The separate earlier amendment-review-r2 file remains absent after its refusal and is not recreated by this report. Its accepted native response is distinct from any reviewer file digest. The original persisted amendment-review-r1 report and its separately attributed final clarification remain historical; r1 was not retroactively accepted. Earlier binding/access refusals and premature reconstruction remain disclosed history. Current admitted direct reads do not erase them.

Acceptance is confined to frozen candidate revision 5 and the review domains above. It authorizes no new claim that original recovery, host activation, native Test or closure passed.

## Exact reviewed inputs

All candidate entries below are relative to the candidate root stated above. These 18 hashes and their manifest sizes were independently rechecked for frozen candidate revision 5:

```text
c67a987feba8924e7ed54fa5615a739c14a99e3eb5696ee66f447b1220e4a2b5  docs/archive/2146-native-recovery/index.json
e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859  docs/archive/2146-native-recovery/objects.json.gz
bf873c5ef5ec08d6d7952f3a6dd9f3b754b44e5a2c3484d3d20ed1c69c53cc81  docs/archive/2146-native-recovery/README.md
55b41066db22b9240a90d5c4cf35f5d7487377c3e2158012f9d4dd4fc4922d23  scripts/research/2146-native-recovery/archive.mjs
cae63817fe35e085290928a8836f558ce6b2df3ef6e6fd5c6a7a0c98a72e4c29  scripts/research/2146-native-recovery/carrier.mjs
85bd3f49b3799ea64bef11e081a9aec5bfb679cd92ca043bb268ab6c871b9f9c  scripts/research/2146-native-recovery/historical-context.mjs
0af30116df336419565fd9cfa3eaf51e201444c1f72c463939164f7ed0f32833  scripts/research/2146-native-recovery/pack.mjs
070223791f54a071a9457b6a889d6f2c977c9ec6af25b7a2447226c48a74e596  scripts/research/2146-native-recovery/reconstruct.mjs
25d23512cfb6d3f174d1b9a7c1fd8686e880c49190c16b4daee69dea3f1279d8  scripts/research/2146-native-recovery/verify-historical.mjs
3e255c5fecd3dd8d080416770672d5b05ab2a6900af8142c4050c2b4ab0c9a5c  scripts/research/2146-native-recovery/verify.mjs
41c90e51efdc6ffb09da8b91b13adefe143e8a97d4083286e8bb89605fb9589b  scripts/tests/integration/task-tracker/core/2146-archive-assertions.test.mjs
71f3cbe8927b1d45a28e3df9e1e93a9e1fe29c1f8a0b81aee779fab030d1c49e  scripts/tests/integration/task-tracker/core/2146-archive-carrier.test.mjs
ffe51e6e62e183c2b8e5708f893a722d5b50031611d6204bfb7cb1f914e95b34  scripts/tests/integration/task-tracker/core/2146-archive-cli-contract.test.mjs
4332598377ea0a72ce440dbba68211d82f01b0dd6c54286907d2bc63a2841e88  scripts/tests/integration/task-tracker/core/2146-archive-cli-positive.test.mjs
c812ede2c45dcca82fa175cbacfae0208326a58e7cc9d400d15da8016ace1076  scripts/tests/integration/task-tracker/core/2146-archive-context.test.mjs
232b47ec04b340ad1c0ff929645f26cd41df48bde33d4ebe25815d870f1e7ea8  scripts/tests/integration/task-tracker/core/2146-archive-reconstruct-positive.test.mjs
17333a5e29d507743a3446e38da006c23986f6c45686f300df258cdaaa50a940  scripts/tests/integration/task-tracker/core/2146-archive-reconstruct.test.mjs
628266df8fd4afeb848f17319c7d5a3a1e79ba21d0813723b37986fa31fd95d7  scripts/tests/integration/task-tracker/core/2146-archive-validation.test.mjs
```

Original input/diff hashes, independently rechecked in this round:

```text
b4573922a885b0fa35b55f82fe8bf3e0c8dd9f5ca93b5b3f5ae29e87ec375aaf  .scratch/plan/2146-archive/original-to-adapted.diff
e5a8f03a08a2e2b8d5dd9efc420e683d979d6a3b6911e64dd9bff260e8d6fc77  .scratch/native-recovery-spike/followup-20261103T233057Z/verify-v2.mjs
767fce262ef84ba7b1202519a9f95a4a10617a92ae74da37f9a27a481d0f82a1  .scratch/native-recovery-spike/followup-20261103T233057Z/harness.mjs
78afd54726726495057aacba467593b922b218d602081bf6b392274bc2514781  .scratch/native-recovery-spike/followup-20261103T233057Z/manifest-v2.json
c6c7c01006f77be50f24423f9280d47e07498c240a7dbd53eff9b2f29dc5cb8d  .scratch/native-recovery-spike/followup-20261103T233057Z/report-v2.md
1b20fedde2acd4a8e8c4bc41af74656e48932af101444fe21c674562f22b7dc1  .scratch/native-recovery-spike/followup-20261103T233057Z/2026-11-03-2146-native-recovery-defect-plan.md
```

Retained author-run evidence and inventory records read and hashed in this round:

```text
7be8d141e2a7f7bbf74ee4a52821563952314c2e3bdeb922dee73e4bac5ee437  .scratch/plan/2146-archive/carrier-index-preservation-red.log
853a0506e8efa3d91f6e4c9a61d98ba7dbee88f9a47a4697ef66ec6ba970595a  .scratch/plan/2146-archive/carrier-index-preservation-green.log
00b9da73402b84eb18c9bc4074c53809266dda9f23d142dd197e9ac1f9ce18ca  .scratch/plan/2146-archive/strict-cli-negative-qualification.log
85a26f128c4fcb54d6f562cbaeaaad02667b62dbf3bdb3f48a234935244cc309  .scratch/plan/2146-archive/candidate-implementation-r2-tests.log
d48292f79c46b434c2644df8229798adbc8fa00788c053c562b4f9fa2ca90243  .scratch/plan/2146-archive/candidate-implementation-r3-tests.log
871791507c4d1fcb0a55618796e55780da488060c28fdae780927731a42e82f4  .scratch/plan/2146-archive/candidate-implementation-r3-manifest.json
149ff36d210ab51fa3e102d9bd2461a21fcd48ef6133f454d48824ffe82ce3cf  .scratch/plan/2146-archive/candidate-implementation-r5-manifest.json
74d762ca29273711b338740cfc8a69baf14723bd07f798636f8edf9bd3688c78  .scratch/plan/2146-archive/candidate-implementation-r5-tests.log
4ad8db63763e2bbd66928563a4833041eb80603908c6cc209bdd755d8702a5fa  .scratch/plan/2146-archive/carrier-fixture-config-red.log
37a16cb0accf30cbacb6f576a3f8e6f35c6818f6ee0378073fe02ecaad39a0f8  .scratch/plan/2146-archive/carrier-fixture-config-green.log
b9c903ad1f04b3fb8397da5e2081511965f5b522402e92ac386b466847ca5b77  .scratch/plan/2146-archive/candidate-implementation-r5-quality.json
```

The final quality JSON names the same revision-5 manifest and reports formatting success and zero spelling issues for 16 editable files, plus zero ESLint issues for the 15 JavaScript modules/tests. It is author-produced evidence, not an independent lint execution by this reviewer.

The complete 33-module helper import closure was directly inspected during the inherited full review; every hash was independently rechecked unchanged in this round:

```text
0e5fd4100438617dc2f1550e266a14b92083b7d04d2dd74fae03d2563e0802f2  scripts/task-tracker/lib/scratch-dir.mjs
c27014d5dfa264df91d3e63d56187d05d8c8dbb704bd490dc587cf200e3dfd09  scripts/task-tracker/lib/project-dir.mjs
2aeb2f0b551203ff0bacac81773f0993181dd2b0f92c93fc09e0b13a1c05aa7a  scripts/task-tracker/lib/runtime-storage.mjs
eb2abab2fcd5e336802ed29166d8ec6e22ee15fd71bbfeb4a7695ee146ab0ffc  scripts/task-tracker/paths.mjs
d81436a286328cf948a8ec95c0d17c3e9f9055a98a0bc859d6fe9f425cba6c5c  scripts/task-tracker/session-state.mjs
effb2a0f864301d5cda48d7c24cc53aa0444d643f9c59adf83ae6df62bac9833  scripts/task-tracker/word-counter.mjs
c42e4ba2903dfc8bf8afac9e35f5bab8a1e6651f58493eeebb113f75514079ff  scripts/task-tracker/fleet-registry.mjs
7bc230b0e753eaeaed952c8d64174139b66ac464186bf675483f596caaa704db  scripts/gh/lib/dirty-workspace.mjs
52fd194ecf73685140b952e8c44f81472265a96b6a983f5608b7a9b527ea1267  scripts/task-tracker/lib/process-timeouts.mjs
8c52524b729c62b74851a42d177abf257179fe7c860675b7622f947eadc5f65c  scripts/task-tracker/lib/session-id.mjs
ac9369976567490e47ea6701223136e35d4a2f6a77e50ca1afc2a06323104e37  scripts/task-tracker/lib/timing-actor.mjs
03c4c31a0ea7c6130fbaeec15e51ee473e4b7a032530da8e53525116d9ce1c60  scripts/task-tracker/lib/jsonl-line-scanner.mjs
279d6d51731ecd69c92566eff82e0444e2baa9bba717b4dfea68eefffa4d8a3a  scripts/providers/index.mjs
36cbbca7879154fc068c09a687327d28f41d52e7be0dc160b8d44014a604f521  scripts/providers/claude.mjs
4776a182e4967f7a94d789a704c0128382bc4a8afb18017dcac95fff8237e0de  scripts/providers/codex.mjs
75fdddddce9c26b91c1a26c5d6f3f53e69a9f87816f13d0733f1c39015dc60d5  scripts/providers/grok.mjs
8bfd22a1841d24dd76ea1079bc4b001069a3f3f4a2fdf6a66c1204dd4f1e1097  scripts/providers/transcript-resolver.mjs
24c37eef01be9a767636e15cc4620af0381f7456bd36752957821618c4fb8151  scripts/providers/transcript-normalizer.mjs
b38d9f21611ecdf1d8dd39a9bbc831327ad651abe13108dad2e39f60bd53fcc6  scripts/task-tracker/lib/lifecycle-policy/index.mjs
d6ba6b9454494bddb2458dfef345b95701d0c61812d26f86826358d134ae8586  scripts/task-tracker/lib/lifecycle-policy/states.mjs
1db5b16210f9a657892ef2e3d51ca61ad202f33b00709716d619a97be2d53cde  scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs
2e7ce21967625a3abada9c43200c8f0a890d00ad0511eb373497207f89e9160f  scripts/task-tracker/lib/lifecycle-policy/history.mjs
19090ca7b204421fd889024344b9e48299fa42eacc2870705498df14cc40caa7  scripts/task-tracker/lib/lifecycle-policy/actions.mjs
a896b7121e63213c596b1d81151be8bc6c77b0814401bd67c8208d1d32f1d757  scripts/task-tracker/lib/story-cache/writer-registry.mjs
0cb8f7e88b2971356b8d210c882b62c8ebf62dc9a9f4ec21cd9a914628fdce5c  scripts/task-tracker/lib/story-cache/writer-claim-shape.mjs
895ed0ac88b7bbf019a579bf3b67115d2aa9546b2c458c85bb3e9eddab277702  scripts/task-tracker/lib/story-cache/writer-handoff-io.mjs
3be9b9082edd02654f36a5afa45273ddffcdcb578e1d394e3fa29f89042ed4af  scripts/task-tracker/lib/story-cache/writer-handoff-bytes.mjs
25c952c0613869fd29dae8ef2172ae4fea6bea6c80d67205f38be4d312322b35  scripts/task-tracker/lib/story-cache/store.mjs
abc49791108ace45fbfb41564fb43ffcc530e9f89f508a75810c5b00c55b2ad2  scripts/task-tracker/lib/story-cache/manifest.mjs
8cb7881f16a22ccc3cae626590322f12fd3f6a66725973e961edad4fa0439c32  scripts/task-tracker/lib/story-cache/native-observation.mjs
30243ebe973ae3ca8ec9c6c41afd90843206f656984aaeaed24aef801dcb1e2e  scripts/task-tracker/lib/ownership-policy.mjs
35a3133f02c1a71bb1ab72864d0ea47f4ce655a5573ebdbd5de8703056782807  scripts/task-tracker/issue-mutator-lock.mjs
be5d692b4b180d1b3df37bfe8bc40bf460698c700236bf2068d04d4a89065a8f  scripts/task-tracker/lib/github-records/canonical-json.mjs
```
