# #1918 preserved implementation checkpoint

<!-- cspell:ignore criteri -->

This branch contains the committed #1855 baseline 14f6c5589724e9d2a33c2353c19f0c793bfe6033 and the 58 preserved source/test files listed below (25 modified and 33 added). The files were copied without changes and compared using Git blob hashes before the handoff commit.

This is unfinished repair input. The original #1855/PR #1907 verification failures and unchecked obligations remain; preserving this source does not confer completion, Plan approval, or passing CI. No new implementation was performed to create this checkpoint.

Start with docs/superpowers/plans/2026-10-08-1918-delivery-handoff.md and the adjacent hydration document. All source required for this checkpoint is in the branch; no previous donor checkout, ignored scratch directory or old local receipts are required.

| Source path                                                                                                                                         | Preserved Git blob                       | Origin          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------- |
| scripts/gh/move-state.mjs                                                                                                                           | 548c012db8d34670304824e0032a7e187798a041 | Modified source |
| scripts/gh/update-event-fields.mjs                                                                                                                  | cba65d07e82c3e6100b982656af7855d2fd4b6f4 | Modified source |
| scripts/run-tests-native-members.mjs                                                                                                                | 833f374af30a57ea51246ff333dd55f3fb4102ef | Modified source |
| scripts/task-tracker/lib/actor-timing-state.mjs                                                                                                     | e76a9e8c7c757f4617550da5a9ef86cad2db3a3e | Modified source |
| scripts/task-tracker/lib/criteria-revision/records.mjs                                                                                              | 61766cb4c59ce8c3ce640018f8efb3e25176b1fa | Modified source |
| scripts/task-tracker/lib/criteria-revision/schema.mjs                                                                                               | fdc5e950c9a8354af645e52d5e9515169293dc89 | Modified source |
| scripts/task-tracker/lib/criteria-revision/source-correction.mjs                                                                                    | aaf075917369b43fa89e327408b355ac693ea25c | Modified source |
| scripts/task-tracker/lib/criteria-revision/stage-execution.mjs                                                                                      | dfa3801b9ee4d45aaf8fcd1303bd8b1f5ca130f0 | Modified source |
| scripts/task-tracker/lib/criteria-revision/store.mjs                                                                                                | 7592aebd53e25570dcd78ecd6ff3e3b609e81134 | Modified source |
| scripts/task-tracker/lib/criteria-revision/transport-quarantine.mjs                                                                                 | 3a3e568da08bc31648f411a3da0e915ddd3f2b4b | Modified source |
| scripts/task-tracker/lib/move-state/audit-timing.mjs                                                                                                | 04e9e183a10b249907238457c6b104ad87eb9669 | Modified source |
| scripts/task-tracker/lib/move-state/cache-unpark.mjs                                                                                                | b0c8a5d30537fb280baa0d524a25602e839b49e7 | Modified source |
| scripts/task-tracker/lib/move-state/github-mutation.mjs                                                                                             | 552745e7bfe456a09a7a22a5427efad0b24d7c0f | Modified source |
| scripts/task-tracker/lib/move-state/move-state-core.mjs                                                                                             | 6947b919484f0d85e4a1694500c9c2db8a694042 | Modified source |
| scripts/task-tracker/lib/move-state/post-commit-tail.mjs                                                                                            | ab272a8a50f950f0c8cbf4d101e402257491f02c | Modified source |
| scripts/task-tracker/lib/move-state/transition-commit.mjs                                                                                           | 88c6160a38c8889db13104817a26ce5645b4324c | Modified source |
| scripts/task-tracker/lib/state-recording.mjs                                                                                                        | b2c4b604396e6fe493dccd08dbfd41244c3c239d | Modified source |
| scripts/task-tracker/state.mjs                                                                                                                      | c5e211fc0c915b829b5debe72e3885040eca8583 | Modified source |
| scripts/tests/integration/task-tracker/core/run-tests-native-source-membership.test.mjs                                                             | b50d1b8adebae3acd273de7a632aa28fc0454523 | Modified source |
| scripts/tests/integration/task-tracker/lib/native-actor-candidate-capture.test.mjs                                                                  | 4183a1b4d01ad81de9eabee749d1ecab11b3557f | Modified source |
| scripts/tests/integration/task-tracker/lib/native-continuation-10-actual-native-entry-marker-adapter-can-continue-current-approved-criteri.test.mjs | ffed2ccadcd0faed9e4fdcc3c928973c29302260 | Modified source |
| scripts/tests/integration/task-tracker/lib/native-stage-continuation-fixture.mjs                                                                    | b366a6cd57ff70a22a67aad012e56117b1c35449 | Modified source |
| scripts/tests/integration/task-tracker/lib/revision-transport-quarantine.test.mjs                                                                   | 97a45e4bc567b90cf30a5fd52c7b852e25e86e15 | Modified source |
| scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-execution.test.mjs                                                               | 4e35eb5a671310ad4baf9499f5b2b8b3fe2d8755 | Modified source |
| scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs                                                                               | 7342ad0fa8689f61fd6f38b1cf5c9dd212f0ff3c | Modified source |
| scripts/task-tracker/lib/event-field-update.mjs                                                                                                     | a5d4a8feeca05594c7365fb5520b606164cf90b8 | Added source    |
| scripts/task-tracker/lib/move-state/native-command.mjs                                                                                              | 017893b27de80f73e4836a8b292b23da61aa5ca1 | Added source    |
| scripts/tests/integration/task-tracker/lib/move-state-native-command.test.mjs                                                                       | 72dfcfeabdf25b04d80a44b23fee927e07893932 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-consistency-current-config.test.mjs                                                         | 59448e09e271c31a455e1d6a0394aa1150632c81 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-consistency-request-value.test.mjs                                                          | e28fad7e53d0cdbbbd6e0a4bb1b2a60e8049c338 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-consistency-response-accessor.test.mjs                                                      | d93712e96c712c0fc1baf869be79cd5a7333d23b | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-consistency-result-accessor.test.mjs                                                        | 1e68b24bbc263e881b1bf6d3ddeb7c60801dc9a6 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-entry-result-accessor.test.mjs                                                              | b74a380bdf255408aaec0c7b6df8a7cc99e3a767 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-entry-result-prototype.test.mjs                                                             | 1c3ad0995ee563a4b5ed170fd5cdee28c691c31a | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-entry-result-value.test.mjs                                                                 | 08660c270badf91a1a9c66b386cc8560841db94f | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-recovery-from-comment.test.mjs                                                              | f78f36f6b1b6e1cb42bd1a97e1613bfc5f50f65c | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-tail-dispatch-reentry.test.mjs                                                              | c774df6b0caced23a16bca000fd2c25cc2af9a1a | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-tail-dispatch.test.mjs                                                                      | e5f547ba3d0047563552edef4da619bb33115b69 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-effect-readback-failAfter.test.mjs                                       | 02cb808924fb2e83e06a4e5a988ab3b303384aec | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-effect-readback-failBefore.test.mjs                                      | 6bea2c550958bb7557ef0193fd4b81f056fb3ddd | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-effect-write-failAfter.test.mjs                                          | e35ce9b1a5d691836652cf1fb860d6a6f5500bd0 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-effect-write-failBefore.test.mjs                                         | e129b8230d2303ec3d29b14953357b1de8d4fd6c | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-intent-readback-failAfter.test.mjs                                       | 71f4b9b1e5cf6be0a8dc41426a205d17e2530655 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-intent-readback-failBefore.test.mjs                                      | d0fefd8350bbe84a0993979724d2490fbe374ff4 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-intent-write-failAfter.test.mjs                                          | 45ff1a76193496f052ea3b3fb76df60d2ea7ce05 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment-intent-write-failBefore.test.mjs                                         | 2cb0822ee98694ef7170c5e44eba484b4e87ac0d | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-comment.test.mjs                                                                 | 376c24e303f24d9959405df52b2e99c67a8ae86e | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-create-parsed.test.mjs                                                           | 2c2796905b1ef910f848e41c46a9cf05cbe2fdc9 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-create-response.test.mjs                                                         | bec10a016298bcce1ab9871c7e25c31c3cb3dd4a | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-current-config.test.mjs                                                          | b33cbfe60b43c83e17bcd818be78180d967b165c | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-history.test.mjs                                                                 | 4d368dc065abb9b8326236f441cd4800fb2c642c | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-read-parsed.test.mjs                                                             | c6947cbad75eda40b03fbbb7c6a5eb573ac68af4 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-read-response.test.mjs                                                           | e8704c0599a336c738b7701ced60dcf0725b1f21 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-request-accessor.test.mjs                                                        | 580fbcd03f3c4457d38fa1195d27a377e5ec6237 | Added source    |
| scripts/tests/integration/task-tracker/lib/native-stage-transition-result-custody.test.mjs                                                          | d0dc8ba2c729abae5798c11e8728e971c7c6e32e | Added source    |
| scripts/tests/unit/task-tracker/lib/move-state/event-field-program.test.mjs                                                                         | 1ab0e4f6250e147f9c44443404e9a8118d8815cf | Added source    |
| scripts/tests/unit/task-tracker/lib/move-state/local-tail-program.test.mjs                                                                          | cd281028839004c1a68e8575ebd327ecf7c70864 | Added source    |
| scripts/tests/unit/task-tracker/lib/move-state/state-save-program.test.mjs                                                                          | 2f7fc9f6e1aeba2dce9b90e4ffa1167140a178e4 | Added source    |
