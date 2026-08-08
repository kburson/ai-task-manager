# GitHub-Native Authority Backlog and Artifact Map

**Date:** 2026-07-31

**Parent epic:** [#1048](https://github.com/kburson/ai-task-manager/issues/1048)

**Active nested epic:** [#1067](https://github.com/kburson/ai-task-manager/issues/1067)

**Design reference:** `098c9e084bf82e19aee8615794ab0e196718d9a8`

## Handoff state

Issue #1067 is in Develop with its deep dive, planned estimate, explicit human plan
approval, and all required state markers recorded. Its 16 direct children are
in Refine, ordered sequentially, and individually capped below four hours. A
new orchestrator session should bind #1067 and follow its Pickup Directive.

```bash
npx aitm start 1067 --role orchestrator
npx aitm auto both
```

Full-Auto is a session setting, so the new session must apply it after binding.

## Canonical delivery sequence

| Order |                                                           Issue | Delivery slice                                              |  Cap | Review                                                                         |
| ----: | --------------------------------------------------------------: | ----------------------------------------------------------- | ---: | ------------------------------------------------------------------------------ |
|     1 | [#1068](https://github.com/kburson/ai-task-manager/issues/1068) | Characterize authority sources and add the locator boundary |   3h | One exact-SHA review                                                           |
|     2 | [#1069](https://github.com/kburson/ai-task-manager/issues/1069) | Define canonical GitHub authority record envelopes          |   3h | Two exact-SHA reviews                                                          |
|     3 | [#1070](https://github.com/kburson/ai-task-manager/issues/1070) | Implement GitHub comment storage and batched node reads     | 3.5h | Two exact-SHA reviews                                                          |
|     4 | [#1071](https://github.com/kburson/ai-task-manager/issues/1071) | Initialize and repair singleton comment directories         | 3.5h | Two exact-SHA reviews                                                          |
|     5 | [#1072](https://github.com/kburson/ai-task-manager/issues/1072) | Implement the Delivery Contract lifecycle                   | 3.5h | Two exact-SHA reviews                                                          |
|     6 | [#1073](https://github.com/kburson/ai-task-manager/issues/1073) | Implement immutable capsule chains and fork detection       | 3.5h | Two exact-SHA reviews                                                          |
|     7 | [#1075](https://github.com/kburson/ai-task-manager/issues/1075) | Enforce epic coordinator grants and authority epochs        | 3.5h | Two exact-SHA reviews                                                          |
|     8 | [#1077](https://github.com/kburson/ai-task-manager/issues/1077) | Govern worker assignments, submissions, and dispositions    |   3h | One exact-SHA review                                                           |
|     9 | [#1079](https://github.com/kburson/ai-task-manager/issues/1079) | Implement append-first lifecycle transition replay          | 3.5h | Two exact-SHA reviews                                                          |
|    10 | [#1081](https://github.com/kburson/ai-task-manager/issues/1081) | Add AC, VC, and DoD contract-source compatibility           | 3.5h | One exact-SHA review                                                           |
|    11 | [#1083](https://github.com/kburson/ai-task-manager/issues/1083) | Migrate Test, Review, approval, and close gates             | 3.5h | Two exact-SHA reviews                                                          |
|    12 | [#1084](https://github.com/kburson/ai-task-manager/issues/1084) | Route checklist and evidence writes to Delivery Contracts   | 3.5h | Two exact-SHA reviews                                                          |
|    13 | [#1085](https://github.com/kburson/ai-task-manager/issues/1085) | Project coordination, evidence, and timing singletons       | 3.5h | One exact-SHA review                                                           |
|    14 | [#1086](https://github.com/kburson/ai-task-manager/issues/1086) | Add per-issue GitHub-record adoption and repair             | 3.5h | Two exact-SHA reviews                                                          |
|    15 | [#1087](https://github.com/kburson/ai-task-manager/issues/1087) | Export GitHub authority records for AITM Insights           |   3h | One exact-SHA review                                                           |
|    16 | [#1088](https://github.com/kburson/ai-task-manager/issues/1088) | Verify and document GitHub-native authority integration     | 3.5h | One cross-issue exact-SHA review; repeat after a Critical or Important finding |

Every child records its predecessor, governing artifacts, delivery cap, and
review policy in Plan Metadata. Later children remain in Refine until the
coordinator admits them in sequence.

## Supersession map

|                                                   Retired issue |                                               Durable successor | Rationale                                                                                  |
| --------------------------------------------------------------: | --------------------------------------------------------------: | ------------------------------------------------------------------------------------------ |
| [#1053](https://github.com/kburson/ai-task-manager/issues/1053) | [#1067](https://github.com/kburson/ai-task-manager/issues/1067) | Replaces the unfinished database-backed lifecycle epic with the GitHub-native nested epic. |
| [#1054](https://github.com/kburson/ai-task-manager/issues/1054) | [#1079](https://github.com/kburson/ai-task-manager/issues/1079) | Ports only storage-neutral append-first and crash-boundary invariants.                     |
| [#1055](https://github.com/kburson/ai-task-manager/issues/1055) | [#1067](https://github.com/kburson/ai-task-manager/issues/1067) | Heartbeat renewal is removed with leased database authority.                               |
| [#1056](https://github.com/kburson/ai-task-manager/issues/1056) | [#1075](https://github.com/kburson/ai-task-manager/issues/1075) | Holder rotation becomes explicit coordinator epochs and adoption.                          |
| [#1057](https://github.com/kburson/ai-task-manager/issues/1057) | [#1079](https://github.com/kburson/ai-task-manager/issues/1079) | Pause and stop ordering becomes append-first transition replay.                            |
| [#1058](https://github.com/kburson/ai-task-manager/issues/1058) | [#1083](https://github.com/kburson/ai-task-manager/issues/1083) | Close release semantics move into normalized lifecycle gates.                              |
| [#1059](https://github.com/kburson/ai-task-manager/issues/1059) | [#1086](https://github.com/kburson/ai-task-manager/issues/1086) | Recovery becomes per-issue adoption and validated repair.                                  |
| [#1060](https://github.com/kburson/ai-task-manager/issues/1060) | [#1085](https://github.com/kburson/ai-task-manager/issues/1085) | Fleet reconstruction becomes an observational coordination projection.                     |
| [#1061](https://github.com/kburson/ai-task-manager/issues/1061) | [#1085](https://github.com/kburson/ai-task-manager/issues/1085) | Fleet GC remains projection-only and cannot grant authority.                               |
| [#1062](https://github.com/kburson/ai-task-manager/issues/1062) | [#1077](https://github.com/kburson/ai-task-manager/issues/1077) | Review handoff becomes worker submission plus coordinator disposition.                     |
| [#1063](https://github.com/kburson/ai-task-manager/issues/1063) | [#1077](https://github.com/kburson/ai-task-manager/issues/1077) | Merge-back authority becomes bounded worker assignment and coordinator acceptance.         |
| [#1064](https://github.com/kburson/ai-task-manager/issues/1064) | [#1088](https://github.com/kburson/ai-task-manager/issues/1088) | Operator documentation is produced by final integration.                                   |
| [#1066](https://github.com/kburson/ai-task-manager/issues/1066) | [#1088](https://github.com/kburson/ai-task-manager/issues/1088) | The old work-lease integration gate is replaced by the GitHub-native integration gate.     |

Closed foundations #1049, #1050, and #1065 remain historical evidence and
were not rewritten or reclassified. #1051 remains an independent child of
epic #1048.

## Preserved #1053 and #1054 artifacts

The old worktrees were stopped without deletion. Their exact tips are pushed
to archive branches:

- `codex/archive-1053-pre-github-native-pivot` at
  `c71eec20e9465ac21f4e8246a7746699bc7d8bd9`
- `codex/archive-1054-pre-github-native-pivot` at
  `51780578f0ee0bdeaae7fb099ea287a00f553eda`

Issue #1054 contains two unique commits:

- `34fd3709` — lifecycle journal core
- `51780578` — lifecycle crash-boundary enforcement

Its focused lifecycle test passed 10 of 10 at the archived tip. The broader
The #1053 archive contains the database-backed program history, including the
closed #1049 foundation, #1050 review-epoch defect work, and #1065 verification
history. These archives are evidence and research inputs, not merge sources.

The detailed classification of reusable, adaptable, and rejected artifacts is
in
[`2026-07-31-issues-1053-1054-pivot-artifacts.md`](2026-07-31-issues-1053-1054-pivot-artifacts.md).

## Collision cleanup

Accidental duplicate issues #1074, #1076, #1078, #1080, and #1082 were closed
through the AITM supersession workflow. The four duplicates that had been
attached to #1067 were detached after closure. No issue was deleted, so their
audit trails remain available without cluttering the canonical 16-child graph.
