**Kind:** epic

**Provenance:** Follow-on epic from spike #680, which recommended proceeding. Design recorded in `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`, section "Epic C — Pipeline as config".

**Relationships:**

- Origin spike: #680
- Blocked by: the recycle-verb epic, whose `--drain` mode the board-drain refusal depends on
- Feeds: the gate & action plugin API epic, which plugs into the gate resolution registry this epic builds
- Interacts with #659 (`installed-guard-path.mjs`): the consumer-edit interlock stays intact — configuration composes gates, it does not edit installed code

**Divergences from the originating spike**, recorded so the difference is deliberate rather than drift:

- Guards bind to edges rather than expanding to a five-phase per-state lifecycle; `onExit` is not introduced, as no requirement for it emerged
- Resident actions stay setup hooks rather than becoming the deep work of a state
- Config lives at the project root rather than under `.ai-task-manager/`, matching the mental model teams already have from CI config and making code-ownership coverage obvious

**Size guess:** XL — standalone top-level epic, no parent.
