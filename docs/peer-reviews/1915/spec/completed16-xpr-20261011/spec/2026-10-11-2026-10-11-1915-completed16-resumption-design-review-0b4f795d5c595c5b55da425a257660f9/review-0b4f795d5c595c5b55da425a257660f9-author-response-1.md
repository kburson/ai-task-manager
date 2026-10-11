<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-0b4f795d5c595c5b55da425a257660f9"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-11-1915-completed16-resumption-design.md"
artifact_commit: "3249b393bb3c81d3fd89db19659ee2c0c13d7db0"
artifact_blob: "889b73869a50717eeac5eefbd06549ac8fcad0f1"
artifact_digest: "sha256:e443603691356e2365fd8fdc358261819cf9dcd44f0b5d435557037d779f9dae"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:a99ad84973d02c14eb00e00afd151631b8adbc22ab6aaa5c8eb35b453d2de34e"
  identity_source: "runtime"
started_at: "2026-10-11T19:22:15.799Z"
submitted_at: "2026-10-11T19:28:06.387Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Read the full round 1 reviewer response and independently inspected the cited restart, first-entry failure report, policy memory context, store step16 readback, tail dispatcher/cache and partial-fact derivation. All four required findings identify missing specification contracts. All four are accepted and addressed in the design. The architecture remains a completed16-only memory continuation using the original dispatch17/cache18 programs and a distinct current-read custody protocol.

The revised artifact SHA-256 is `4d0a9d91aed5bb62a8c6d2de28fa8f111700f1dc7f14dfb01ee0a9b0c225111b`. This is a material contract clarification beyond the prior SAR digest; the artifact explicitly preserves the old SAR receipt as historical and requires renewed SAR before asserting both reviews cover this new artifact. Human design approval remains pending. No implementation plan or implementation has been written.

## Finding dispositions

### R1-F001 — Accepted

Added "Observable completed16 resume result" with the exact common fields for all four terminal categories: exit 4, revision-authority-unavailable, native-stage-resume, native-source-unavailable, and tail containing only an empty failures array. The admitted resume branch deliberately keeps its resume phase and uses a fixed conservative reason, not a new success-shaped reason or untrusted exception inspection. This is consistent with the existing restart's nonzero authority failure and the first-entry catch's fallback reason, without claiming identical phase semantics between first entry and resume.

The table specifies the complete verified and unverified partial-field cases. Final policy comparison failure invalidates even previously verified report fields. Already-refused custody skips further audited reads. The partial fields remain facts through step16; exact 17/18 progress is snapshot-only and must be asserted through full reconstructed snapshots and operation traces in qualification. Thus no caller is asked to infer 17/18 progress from a generic failure reason. Pre-admission policy exceptions and completed1–15 admission-only results are unchanged.

Source verification: `evaluateOriginalNativeStageRestart` currently returns the fixed unavailable result; the first-entry catch uses exit 4 and an empty failures array; `deriveRecordedNativeStagePartialFacts` derives only board/sentinel/comment facts through step16. These support the bounded result contract rather than adding a generic progress API.

### R1-F002 — Accepted

The frame retains the reconstructed original actor identity as an expected value, cross-checks provider and sid against fresh `aiAppName()`/`currentSessionId()` captures, and requires sid equality with the admitted executor session. It repeats the check at frame creation, every cache18 operation boundary and subsequent custody checks. Only that currently cross-checked identity under the admitted physical worktree can supply the step intent sid and active-task path. "Does not populate historical actor maps" now explicitly means the original first-entry custody maps, not absence of an expected actor identity.

Source verification: first-entry preparation builds the live provider/sid pair and checks executor session; current restart retains the original identity; original cache18 sink and intent require `record.actorIdentity.sid`. The design now states the necessary conjunction instead of leaving the implementer to infer it. Added qualification of provider/sid/executor drift and the selected active-task sink.

### R1-F003 — Accepted

The design requires the resume frame, existing read and tail to stay inside the same stage-write `runMemoryContext` and its `withMemoryStageEffectQuarantine` across awaits. Each explicitly requires `isMemoryStageEffectScope()` before reaching the read/tail function and rechecks with custody. An outside-scope call refuses before any default tail function or gh transport; it never relies on `runPostCommitTail` choosing a safe branch. Added the outside-scope qualification case.

Source verification: `tryNativeStageOriginalEntry` currently establishes the stage-write context; `runPostCommitTail` selects native memory versus real host behavior using the scope predicate; `assertRevisionStageHostEffect` is a no-op outside that scope. Therefore the new entry must positively require the scope, as the reviewer requests. No production permission or new host transport is introduced.

### R1-F004 — Accepted

Before existing-read result custody registration, require equality with the reconstructed entire step16 GET response (raw stdout plus stderr and exitCode), the recorded whole census, and reconstructed afterResources/body/stage. Identical parsed body alone is insufficient. Envelope-only drift must refuse at that read before dispatch17 and before verified custody registration. Added the matching qualification case.

Source verification: `readMemoryNativeStageTransition` records raw actual comment bytes in stdout, empty stderr, exitCode zero, and the entire census, then compares whole resources with reconstruction. The separate completed16 read now explicitly preserves these comparisons without writing step16 readback again.

### Optional suggestions 1–4 — Accepted

1. Restored the dropped word/number spaces, including the budget sentence and new 17/18 progress prose.
2. Stated the accepted interrupted-transaction consequence and named #1923/#1925 as the separately qualified follow-up recovery owners, without claiming either has already implemented that recovery.
3. Explicitly limited this completed16 increment to target test and frozen empty `STATES.test.onEnter`, refusing other targets or changed actions before existing read/new intents. This preserves the inherited original leaf restriction.
4. Named exported `tryNativeStageOriginalEntry` in the one-use token contract and overlapping-call qualification.

## Changes made

Only the reviewed design and this generated author response were edited. The design gains exact return semantics, actor/sink binding, mandatory memory scope, recorded readback equality, bounded target admission, corresponding qualification requirements, and honest prior-SAR provenance. The original completion frontier, no-replay requirement, original leaf reuse, body authorization boundary, source scope, verification budgets and ordinary delivery gates remain intact.

## Declined changes and rationale

None. Four required findings and four optional suggestions are addressed. The return contract chooses the snapshot-only alternative expressly offered in R1-F001, with a fixed conservative result for all admitted failure categories rather than inventing new result fields.

## Verification

- Read the complete durable reviewer response and inspected the relevant repository source functions as described above; source inspection only, no source/test/config changes.
- Read back the complete revised design to check internal consistency and preserved scope.
- `git diff --check` passed for the design revision before submission; repeated after writing this response.
- SHA-256 of the revised design: `4d0a9d91aed5bb62a8c6d2de28fa8f111700f1dc7f14dfb01ee0a9b0c225111b`.
- No implementation tests ran: this is specification review, not implementation verification. No normal CI, human design approval, Plan approval, lifecycle advancement, push or merge is claimed.
- Submission uses only the package-generated exact-path author protocol commit. Prior SAR records are preserved unchanged.
