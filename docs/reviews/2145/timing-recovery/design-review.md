# #2145 historical orphan recovery amendment review

Independent reviewer: gpt-6-astra/xhigh, review_2145_orphan_recovery, 2026-11-08.

The reviewer required one correction: include the existing heal-timing-log CLI profile allowlist, and exercise main() through the native issue lock and dry-run path. The amendment incorporates that correction. The remaining design passed: the exact 685-byte historical prefix, actor and 32/2602 word markers match retained source; the candidate removes only orphan incompleteness and retains Unknown accounting. Existing continuity/rebaseline routes require evidence absent here. No original-owner state is changed or endpoint inferred.

The reused algorithm retains identity, immutable-prefix, append/conflict/duplicate, clock, source, authenticated-owner, archive, fresh-read and exact-readback checks. A genuinely open current-operator interval must be checkpointed before preview; apply must use that preview's exact identities without an intervening timing mutation.

This is an independent bounded amendment review, not formal APR/SPR/XPR and not a waiver. Delivery remains subject to actual Test, Review, provider delivery and Close.

Implementation verification: new profile tests first failed because the library refused the profile and the public CLI exited 2. After the two-file repair, 83 recovery tests passed, including unchanged AIVC63/AITM2055 tests. The bridge-proof verifier confirmed all 37 protected artifacts remain intact. Complete exact-head CI, native Test and live recovery remain pending at this record's creation.

## Independent implementation review

The same independent reviewer returned PASS for exact delta 0927fe840018650a6a0f4891a8d117c9619c97cb..3f614663dc85c9b1b8610cb582ea07b26143f2bd, with no blocking findings. The fixture is byte-identical to the retained payload, the fixed tuple and prefix match, prior profile behavior is preserved, and main() exercises dry-run/apply under the issue lock. All original-byte, Unknown, clock, conflict/idempotence, ownership, archival, drift and readback fences remain intact.

The changed packed runtime passed the existing distinct-subject qualification at 3f614663dc85c9b1b8610cb582ea07b26143f2bd. This source review does not establish live repair, complete CI, native Test, Review, delivery or Close; those remain separate governed outcomes.
