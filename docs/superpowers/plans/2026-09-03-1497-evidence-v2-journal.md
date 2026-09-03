# Content-addressed evidence and acceptance implementation plan

> **For agentic workers:** Use executing-plans inline, serially. No subagents.

**Goal:** Fulfil #1497, Task 2 of epic #1495, without enabling production v2 execution.

**Architecture:** Strict canonical records live in an append-only comment journal. Raw Git and declared execution inputs determine subjects; reusable successful evidence produces a new equivalence edge, while acceptance binds exact candidate, target and review authority. Body markers are protected projections only.

**Tech Stack:** Node 22+, ESM, built-in crypto/fs/child_process and existing canonicalRecordJson. No dependencies or database.

## Global constraints

Use existing recorded worktree and the independent #1496 sandbox. Preserve v1 defaults and all original #1490/#1488/#1485/#1226 records and worktrees. No production enrollment. All synthetic mutations require resolveExecutionContext. Repository identity is provider node ID plus observed owner/name. Do not edit the pinned epic plan. Integration paths mirror production lib/evidence-v2.

### Task 1: Strict records and protected protocol selection

Files: scripts/task-tracker/lib/evidence-v2/{codec,record-schema,protocol}.mjs; scripts/task-tracker/lib/body-invariants.mjs; scripts/tests/unit/task-tracker/lib/evidence-v2/codec.test.mjs.

- [x] Write a codec roundtrip and tampering assertion: decodeRecord(encodeRecord(record), identity) equals record; changed payload with original recordId throws digest-mismatch. Run the unit test before implementation and observe missing capability.
- [x] Implement createRecord(envelopeWithoutId), recordDigest, encodeRecord, decodeRecord with exact envelope keys, UUID cycle/operation IDs, tagged digests, canonical instant and strict per-type payload contracts. Preserve original bytes. Validate repository, issue, cycle, predecessor and typed references when assembling a journal.
- [x] Protect aitm-evidence-v2 projection markers from unrelated removal/rewrite. selectEvidenceProtocol({body,context}) returns v1 when absent and v2 only after strict marker parsing and validated synthetic context. Malformed claims refuse without fallback.
- [x] Run codec tests covering unknown keys/types, duplicate and malformed markers, cross-identity references and production refusal.

### Task 2: Complete subjects, reuse, and acceptance

Files: scripts/task-tracker/lib/evidence-v2/{subject,subject-inputs,eligibility,acceptance}.mjs; scripts/tests/unit/task-tracker/lib/evidence-v2/{subject,eligibility,acceptance}.test.mjs; docs/guides/evidence-v2-inputs.md.

- [x] Write real-Git tests: same-tree amend has equal subjectId for reviewed content-only recipe; whitespace, modes, deletion, symlink, declared ignored input and requirements/recipe/environment changes differ. Unknown Git sensitivity defaults to history-sensitive. Run and observe missing implementation.
- [x] Implement buildEvidenceSubject({repositoryId,sourceRoot,requirements,recipe,environment,gitInputs,ports}) using raw sorted Git tree paths, object modes/types and SHA256 raw content. Detect dirty tracked inputs and refuse unresolved LFS/submodule material. Hash declared consumed untracked files; never hash secrets. Capture complete history observations for history-sensitive recipes. Canonical requirements projection excludes progress ticks and proof stamps while retaining executable declarations and mappings.
- [x] Implement evaluateReuse({candidate,verification,policy}) with reuse/verify/refuse and structured reasons. Require complete trusted successful verification plus exact subject identity; return a new equivalence payload without mutating the original verification/tested SHA.
- [x] Implement authorizeAcceptance({cycle,candidate,verificationRecords,reviewAuthority,policy,target}) requiring same-cycle candidate, exact requirements/target, earned verification and authenticated human decision or explicit policy-backed gate bypass. Transfer is disabled unless explicit policy binds exact current inputs.
- [x] Run positive and negative tests and document caller obligations for dependencies, tools, env, secrets and Git-sensitive inputs.

### Task 3: Durable journal and transport reconciliation

Files: scripts/task-tracker/lib/evidence-v2/{journal,journal-authority}.mjs; scripts/tests/integration/task-tracker/lib/evidence-v2/journal.test.mjs; extend scripts/tests/helpers/evidence-v2/provider.mjs only if the transport needs actual comment readback.

- [x] Write integration tests with the recorded provider and real filesystem: append after-effect lost-response survives restart with same operationId; identical physical duplicates collapse but conflicting operation bytes and predecessor forks refuse. Run before implementing.
- [x] Implement readJournal({repositoryId,issueNumber,ports}) with exhaustive pagination, strict decode, ordered single-chain validation, typed reference validation and physical comment IDs. Save observed physical IDs/body digests under authorityRoot and refuse later edit/deletion drift.
- [x] Implement appendRecord({expectedHead,record,authority,ports}) with authority host ID, shared repository/issue lock and atomically persisted pending canonical bytes before remote effects. Never expire a live lock on elapsed time. Reload complete journal and expected predecessor under lock; reconcile uncertain create by operation ID; read back exact bytes before acknowledging. A pending uncertain request with no visible comment refuses retry rather than blindly duplicating. Foreign hosts are read-only.
- [x] Run concurrency in separate Node processes sharing one authority root, pagination/stale read/damaged history and cold restart cases. Run unchanged verification-receipt integration suite and all #1496 focused suites.

### Task 4: Governed completion

- [ ] Run affected checks and full lint/format, commit as [#1497], stamp/check each AC independently and create commit trace.
- [ ] Run isolated task test once, record serial code review, review and Full-Auto approve. Verify exact receipt before local merge-back to epic, push and verify hosted CI. Relocate binding after proven merged worktree cleanup and close through sanctioned CLI.

No test claim is earned by this plan. Each checkbox is updated only after its associated observed result.
