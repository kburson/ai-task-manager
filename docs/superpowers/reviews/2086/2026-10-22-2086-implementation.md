# Issue 2086 implementation and native handoff

## Scope and execution authority

Standalone prerequisite outside epic #2039's 32 direct children. The original
worker completed native bootstrap with local S / 3.5h estimates and genuine
Full-Auto Plan approval. It authored no product source or tests. Its original
untracked bootstrap receipt, branch and app-managed checkout remain preserved.

The original worker genuinely resumed and stopped before handoff: Resume 25842,
Explain 13206 and Stop 16179 each returned actual exit zero. Stop retained
Unknown active time, wall one minute and four words. Its binding, timer entry
and occupancy claim were independently confirmed absent.

The controller returned to the serial native execution pattern used in waves
1–7. Root #2039 Pause 29608 returned exit zero, Unknown active time, wall
13 minutes and 268 words. Native Start #2086 with role agent and confirmed
relocation ran in the actual b187 app checkout and returned exit zero (78129).
No override was used. Binding, actor timer and occupancy agree on #2086,
`codex/2039-draft`, generation `6d0386bc-d0a7-41fc-b544-5d7cac867733`, entry
`2026-10-22T19:52:08.057Z`. Native Start honestly downgraded the new owner's
re-engagement to start because that actor had no prior #2086 start/interruption.
Fresh Explain 7166 returned typed blocked for pending product evidence and
commit trail; no stage advancement was attempted.

Initial product implementation is inline under that genuine native binding;
the original bootstrap worker remains a read-only context provider. No unbound
worker borrowed another session identity. This changes the execution owner,
not the implementation scope. Fresh independent review remains mandatory.
Base: `6a659ba586419bcf9f8a4181b6e3dfa05d54f2c2`, including the accepted,
unchanged #2085 source. The sibling worker checkout and all existing WIP remain
untouched. No shell-directory change is claimed to relocate app hook identity.

## Design and implementation

The warm lookup already obtains a source observation and cache identity. On a
cold miss or explicit refresh, the first cold attempt now reuses that pair only
when `selected` is null after the existing argument defaults. Explicit undefined
therefore retains its existing default behavior. Non-null caller selections
still require independent authoritative cold observations. Retry attempts
always obtain a fresh before baseline. Final post-validation source/identity
observations and comparisons remain unchanged.

The pair is private invocation-local data. No public option, schema, fingerprint,
registry architecture, gate, budget, headroom or sample policy changed. The
existing guidance-cache benchmark setup adds only `check-latest: true` for its
supported Node 24 major; actual runtime and budget success must be established
from final CI logs.

The new integration sibling calls the real `loadGuidance` API in isolated Git
projects. It wraps real Git execution to record calls and real filesystem reads
to mutate an actual catalog after its validation read. It replaces no source,
identity or validation function with a test double. Cases cover omitted, null
and undefined selection, caller-supplied stale identity, one source change with
fresh retry, changes on both attempts with no publication, candidate
identity plus invalid diagnostics, and a real staged-index change during validation. Existing process/documentation tests cover
parser traps, artifact/manifest integrity, explicit refresh, concurrent writers,
invalid catalogs and the documentation resolver fingerprint.

## Verification

Local runtime: Node 26.8.1 on Darwin. Local output is not patched Node 24 CI
proof. Actual command output is retained under `evidence/` with byte counts,
SHA-256 hashes and exit statuses in its manifest.

- Focused RED: seven tests, one passed and six failed, actual exit one (85699).
  Failures are the redundant observation counts: three versus two cold rounds,
  five versus four retry rounds. Caller-selected independent authority already
  passed. No import or fixture error accounts for these failures.
- Covering GREEN: all three vc:1 integration files passed, 36 tests, zero failures,
  actual exit zero (44546). Internal stable cold calls use two complete index
  rounds / six Git processes; warm calls use one round / three processes.
  Caller-selected cold uses three rounds / nine processes. Retry cases use four
  rounds and retain the expected fresh result or refusal.
- A further conservation test stages an actual new file during the catalog read,
  then compares the published index identity with an independent native Git
  staged-entry digest. Its first fixture trial failed because the shared sandbox
  ignores all files by default: the index mutation was refused by Git, producing
  an unreadable-source result. Correcting only the fixture to explicitly add
  its marker produced final covering GREEN: 37 tests, zero failures, actual exit
  zero (47148). The failed trial (55945, exit one, 36 passed / one failed) remains
  retained; it is not counted as a product RED. No production change followed
  the initial GREEN.
- Full fast suite: all 997 files passed, actual exit zero (33425), 92.2 seconds.
- Full lint: actual exit zero (52916). Full format check: actual exit zero
  (19411). Later scoped final format, spelling and JavaScript lint checks also
  passed after adding the index conservation test.
- Full slow result will be appended after actual completion.

## Acceptance boundary

No native Test, Review, approval, delivery or Close has occurred. All acceptance
criteria remain pending. Final combined source must pass full applicable
exact-head CI, the unchanged five-case budget on actual current patched Node 24,
CodeQL and every applicable PR #2081 check. Separate #2087 owns the confirmed
CI classifier defect. No local speedup or green manual run waives those gates.
