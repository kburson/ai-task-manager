# #2039 SAR requirement-change boundary

The persistent SAR agent remains the same requested `gpt-6-astra` / `high` reviewer. Initial rounds 1–2 reviewed the original strict-baseline/per-effect publication design. Their immutable inputs `spec.r0.md`, `spec.r1.md`, `spec.r2.md` and complete responses are retained. The owner changed the design before any terminal reread or convergence verdict for r2.

The parent relayed the following direct owner steering in order. Later direction supersedes incompatible earlier direction; no GitHub issue body or acceptance checkbox was changed by this reviewer.

1. Batch story-body changes, permit only one assigned human and one owning agent, retain the assigned agent's cache in project-local `.tmp/gh`, tag pending changes, and publish a composite update. The initial requested numeric local-greater-than-cloud rule was temporary and has since been replaced by native revision comparison.
2. The owner specified: “The upsert events should happen at state transition (Backlog to Refine, Refine to r4p...).” This resolves the parent's optional flush-timing question. Routine automatic flushes occur at governed state transitions, not each command, checkpoint, end-turn or timer event. No separate manual-save feature is inferred.
3. The owner specified: “WE need a similar cached version of the timing log, with similar upsert events at state transitions.” Timing events accumulate locally with native timing semantics; the transition publishes at most one composite timing-log update, with separate resource results from the body.
4. Further steering extends the cache to all target-issue comments and an aggregate local manifest. The owner's latest rule is that changes mark the manifest dirty; at transition, download resource metadata, compare cached and cloud versions, and on mismatch retain a diff for discussion/user-directed merge. The owner explicitly requested a bounded provider experiment for native edit IDs, including unedited content and deleted history, and conditional adoption if usable. This replaces numeric greater-version-wins: native IDs are opaque, never incremented or ordered numerically.

## Authority after the change

- Project-local `.tmp/gh` is the body/comment/timing cache authority. A minimal shared ownership registry may identify the owning session/worktree/cache path; it must not duplicate body authority elsewhere.
- The routine publication boundary is a governed state transition, including supported demotion. Ordinary local body/timing changes perform zero remote writes or validation reads.
- Exactly one assigned human and a distinct unique owning agent session/worktree control pending changes. Another same-login session cannot silently take over. Handoff must settle or transfer the unpublished cache and journal.
- Cache all target comments, but external comments are read-only. Batch only resources the writer actually owns and is authorized to change.
- Native metadata is per-resource. The local manifest is a revision vector plus a complete bounded comment inventory, not an invented aggregate GitHub story version.
- Conflicts stop before publication when detected at the transition preflight, retain baseline/local/cloud evidence, and require user discussion/merge. Neither version bumping nor retries may bypass a conflict.
- Body/timing/comments/project fields are separate provider resources. One body write and one timing-log write per transition do not form an atomic transaction; failed or uncertain partial publication cannot claim transition completion.
- Preserve native proof, lifecycle, review, timing and Unknown gates through an explicitly redesigned transition saga. Local pending evidence cannot be described as previously published authority.

## Provider evidence and pending boundary

The parent alone runs the owner-authorized live experiment. This reviewer issues no API/UI calls and no tests for that experiment. Evidence belongs to [the native revision probe](../../native-revisions/2026-10-19-native-revision-probe.md). The initial probe established explicit unedited content with no edit ID, changing IDs for tested real edits, stable metadata for a tested no-op, and connection counts that include creation. At this scope-change record's creation, history deletion was still awaiting the parent's result. The revised draft remains provisional on that edge case until the result is incorporated; SAR convergence cannot be claimed before then.

Read-only source inspection for the new design includes `ownership-policy.mjs`, `issue-mutator-lock.mjs`, `gh-timing-comment.mjs`, `move-state-core.mjs`, `github-mutation.mjs`, `audit-timing.mjs` and their completion/authority consumers. The current saga persists timing/entry-body evidence before Status and writes a separate completion sentinel afterward, so replacing only the body writer would not satisfy the new one-body-flush requirement.

## Final provider resolution

The preceding pending description records the state when this scope-change note was first written; it is no longer an open approval or test dependency. The owner subsequently gave explicit action-time permission for deletion of the diagnostic B revision. The parent completed that deletion and request 9 verified the same B edit ID with `deletedAt` and `diff:"deleted"`, while current C content/latest ID/count/timestamps remained unchanged. The evidence file is now a coherent completed report: 9 of 12 explicit API requests, five returned query cost points, four unknown mutation costs and opaque browser/infrastructure coverage.

Draft r3 and subsequent reviews incorporate this completed result. Native per-resource revision IDs are adopted together with exact current-content digests, explicit unedited handling and bounded complete inventories. No latest-edit or issue-body-history deletion, alternate permissions or simultaneous-writer guarantee is claimed. The metadata is not a server-side write precondition. Native adoption no longer awaits a user decision; design approval and implementation authorization remain separate from SAR readiness.
