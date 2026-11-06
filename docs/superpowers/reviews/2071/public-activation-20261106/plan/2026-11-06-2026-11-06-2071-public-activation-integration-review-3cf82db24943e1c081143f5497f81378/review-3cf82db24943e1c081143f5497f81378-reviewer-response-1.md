<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-3cf82db24943e1c081143f5497f81378"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
artifact_commit: "ccc4d7582f5fcb58084ceabadae547ce12239d36"
artifact_blob: "4f9b48c225f0bddc9035857c5a58e0bfa3e2f758"
artifact_digest: "sha256:4a2b08cb75d344a77888429ca39645814683e45c1fe419316241944dca80d6f7"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:977913bd10ef40ca0a51ac9b802d94daa6446ab6a17ce166fcbc3e042ef8cb82"
  identity_source: "runtime"
started_at: "2026-11-06T12:08:05.478Z"
submitted_at: "2026-11-06T12:11:47.614Z"
finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Independent review of the #2071 public-activation integration plan at artifact blob `4f9b48c225f0bddc9035857c5a58e0bfa3e2f758`. The review read the full plan and checked its claims about K against the current worktree sources (HEAD `ccc4d758` changes only docs on top of K). It also read governing spec S at its working-tree path. Historical O/H blobs were not read, because Git use is out of scope for this review. Every O-only claim (for example "O native-transition rejects non-null capabilityRef at line56", O blob hashes and O hunk contents) is therefore **unverified by this reviewer**. It is not confirmed.

Claims verified against K:

- The story-cache folder holds exactly the 13 modules that the manifest marks same/different/present. These are manifest, native-observation, provider-adapters, snapshot-reader, store, timing-candidate, timing-events, timing-stage, writer-claim-shape, writer-claim, writer-handoff-bytes, writer-handoff-io and writer-registry.
- `contract-write.mjs:325–359` calls createCommentWithGh, appendCapsule, readBackComment and updateIssueComment, then returns `directory-written`. `check.mjs:331,558` branch on that status.
- `verbs/start.mjs:6–18` delegates to verbResume.
- `verb-preflight.mjs:306` exports refuseVerbPreflight, and `runtime.mjs:125` exports runMoveStateInProcess.
- The third-argument form of `validateFreshBaseAsync` exists (`scripts/gh/lib/epic-metadata.mjs:169`).
- `plan-estimate.mjs` has `--evidence-file` and `--compatibility-mode` flags.

The architecture is sound in direction: typed operation records, native rebind instead of serialized permission, one atomic generation and a single native publisher. But the plan is not ready for Phase6. The central authority-lifetime contract (Contract A) has two gaps. Together they make the two most common privileged routine flows impossible to publish under the plan as written:

- a Develop-stage `ac-stamp` followed by `promote`;
- a human `plan-approve` / `approve --human` followed by `promote` / `close`.

In both flows, every CLI verb is a separate process. Grants are also revoked when commit scope exits (line 117). So freeze always rebinds, and for these flows there is no independent native source to rebind from. Contract staging inputs and the spec's conflict/merge path also need specification before implementation. Two test-seed defects are minor.

## Findings

### R1-F001 — Evidence-stamp rebind has no durable native source on the dominant Develop path

Severity: blocking.

Lines 117 and 171 together mean freeze must always rebind evidence-stamp from an independent native source:

- line 117 revokes the process-local grant "after commit/freeze scope exits";
- step 5 at line 171 requires rebinding "ALL privileged operations from independent native sources" at freeze.

Line 121 names the only such sources: "original native Test receipt or eligible verifier-cache entry". In K neither exists for a normal Develop-stage stamp:

- `verbs/ac-stamp.mjs:148–193` uses a receipt only when `decision.receipt` exists, which is the Test-stage path. The Develop path at `ac-stamp.mjs:215–246` calls `runVerifiers` and leaves no durable receipt.
- `lib/verifier-cache.mjs:33–38` lets only four exact suite commands into the cache (`npm run test:all`, `npm test`, `npm run test:slow`, `npm run test:fast`). Its `record` (lines 98–112) also prunes every entry whose sha differs on the next write. Develop ACs normally cite `node --test <file>`, which is never cached, and any commit between the stamp and the transition evicts even eligible entries.

Failure scenario: in Develop, `/task ac-stamp AC1` (verifier `node --test x.test.mjs`) stages in process 1. `/task promote` runs in process 2, finds no reusable evidence and returns renewal-required. The named renewal route is the normal stamp command (line 121), which stages again in a new process and hits the same refusal: a deterministic livelock. The Task2 positive seed (lines 450–460) passes only if the fixture verifier happens to be one of the four cache-eligible commands. That makes the "positive restart test" unrepresentative and hides the defect.

### R1-F002 — Human Plan/Review approval can never be published

Severity: blocking.

In K, human approval and the transition are separate CLI invocations:

- `verbs/plan-approve.mjs:145` sets human mode as simply "TT_FULL_AUTO not set". Its success output at lines 772–774 tells the user to run `/task promote #N` next, in another process.
- `verbs/approve.mjs` (around 492–518) records approval, and close is a separate verb.

The plan's lines 153–157 state that no independent consent source exists for an unpublished human approval and that a new process returns STORY_OPERATION_RENEWAL_REQUIRED, naming plan-approve/approve as the renewal route. Line 117 also revokes the grant at commit scope exit, so even an in-process freeze has nothing to bind. That contradicts line 157's implication that only a "new process" loses authority.

Result: the default human path never publishes. `plan-approve` → `promote` refuses, re-running `plan-approve` stages the same unrecoverable operation, and `approve --human` → `close` behaves the same way. That is a stronger consent requirement than K's in effect: K publishes the approval immediately and promote accepts it. So it violates the plan's own rule at line 157: "do not introduce a stronger consent requirement at initial issuance than the existing native producer requires". The fallback "supported autonomous path uses Full-Auto renewal" does not serve the human workflow at all. The Task8 assertion "unsupported human approval refuse without content loss" codifies the livelock without testing the ordinary flow.

### R1-F003 — Contract/capsule staging inputs and replay branch are unspecified and currently cloud-sourced

Severity: major.

In K, `contract-write.mjs:272–297` reads the remote contract record (`readDirectoryContract`) and lists every capsule comment with `listIssueCommentsSince({since:'1970-01-01…'})`. It derives the head and predecessor from that remote list (lines 309–313). The idempotent `replayed` no-op (lines 298–307) compares against the remote `lifecycleProjection`.

The plan's stageDirectoryContractOperation (lines 211–218) keeps "pure planner/semantic validators". It never states where records, head, predecessor and projection come from during zero-cloud staging. Two staged-but-unpublished capsules must chain off the working head rather than the remote head. The replay check must compare against the working projection, or a second set-check after a staged change will either falsely replay or double-append.

The plan also does not say whether the admission snapshot (maxPages10/4 MiB, line 250) must hold the complete capsule chain, or refuse when it cannot. An unbounded 1970-since list is also a history scan that the budget contract forbids.

Separately, `verbs/demote.mjs:232` is a third `directory-written` consumer. Contract B (line 222) and Task4 files (line 491) name only check, plus "all contract callers".

### R1-F004 — Operation chains have no defined interaction with the spec's conflict/three-way-merge path

Severity: major.

Spec S line 144 says that on drift the publisher retains a three-way diff and returns `conflict`. Line 160 says a user-directed merge "creates explicitly reviewed working content and a new accepted baseline; validate proofs/scope and current authority again at the resumed transition".

The plan requires the first operation's `beforePayload` to reproduce the published base. It checks the complete published-base-to-working composite (line 168) and only says drift "refuses before effects" (Task6, line 550). It does not reference the conflict package. Nor does it define what happens to privileged operations once a merge establishes a new baseline: invalidated to renewal, or re-derived through the native owner with new before/after digests.

A common trigger is a human ticking "Passed final human review" in the GitHub UI, which K treats as the canonical independent approval. That makes the body drift against every staged generation. Without a rule, implementers will either strip operations silently (forbidden by line 170) or leave the generation permanently unpublishable.

### R1-F005 — Task7 estimator seed uses an argument form K parseArgs does not accept

Severity: minor.

`verbs/plan-estimate.mjs:85–86` consumes `--evidence-file` followed by a separate value token, and line 376 requires preserving parseArgs precedence. The seed at lines 593–599 passes `'--evidence-file=x.json'`, which K would treat as a positional token. Either the seed is wrong, or estimationDispatchDecision parses arguments differently from the verb it gates. The result is a test that passes while the real CLI routes differently.

### R1-F006 — Ledger assertions are vacuous or ambiguous

Severity: minor.

The Task2 seed (line 459) asserts zero `staging` ledger entries on the restarted fixture, which only runs a transition. The staging under test happened in the pre-restart `ac-stamp` process, whose ledger is never checked.

Line 428 defines ledger entries as `{category,operation,resourceKey}` without saying they record provider calls only. If local staging operations are logged under `staging`, the Task3/Task5 "staging === 0" assertions contradict the design. If they are not logged, the meaning should be stated.

### R1-F007 — Estimate is not decomposed against the stated scope

Severity: optional.

The scope is about 35 cache modules, about 45 named hunks, a census of about 150 caller paths with a per-entry route table (Task7), and nine tasks with red/green increments. Against that, 24–34 h (line 58) looks optimistic. This reviewer is unsure of the right figure. A per-task estimate would let Root judge it, which line 58 asks Root to do.

### R1-F008 — Clarify which ctx.storyCache line 241 refers to

Severity: optional.

K `runtime.mjs` and move-state-core contain no `storyCache` property; only test helpers reference story-cache. Line 241 ("optional test-only ctx.storyCache is not production activation") reads as a description of K. Label it as O behavior to avoid implementers searching K for it.

## Required changes

1. R1-F001: Define the durable, independent native evidence that a Develop-stage evidence-stamp rebinds from across processes and across an intervening commit. Options:
   - (a) a NEW #2071 native run-receipt written by evidence-runner for every stamped run, covering exact command, exit, sha, tree cleanliness, declaration fingerprint and timestamp, with a named module, validator and manifest row;
   - (b) an explicit rule that rebind accepts the original runner result at its recorded sha under specified conditions, with the trust boundary relative to the story cache stated.

   Replace or extend the Task2 positive seed with a non-cache-eligible verifier (`node --test <file>`) plus an intervening commit, and run the flow as two real CLI processes.
2. R1-F002: Specify a mechanism by which the ordinary human `plan-approve` → `promote` and `approve --human` → `close` flows publish without weakening K's consent semantics. Options:
   - (a) approval verbs publish through the native transition in the same invocation under a named narrow publication purpose, with grant lifetime extended to that in-process freeze; resolve the contradiction between lines 117 and 157 either way;
   - (b) the staged human-mode issuance is an issuer-bound operation whose rebind is admitted only for the identical issuer tuple and session, matching K's existing assurance level;
   - (c) another explicit native source.

   Add two-process tests for both flows. The renewal route must not be able to livelock.
3. R1-F003: State that stageDirectoryContractOperation derives records, head, predecessor, projection and the replay decision from readWorkingStory, including staged unpublished capsules, with zero provider reads. State how the admission snapshot supplies or bounds the capsule chain, and the refusal when it is incomplete. Add a staged→staged set-check replay test and two staged capsules chained off the working head. Name `verbs/demote.mjs:232` in Contract B and Task4.
4. R1-F004: Define the fate of each operation kind when publication hits spec-S conflict and a user-directed merge: neutral, privileged-revalidatable and human-consent. Reference the conflict package and add a Task6 test where a remote UI edit lands between staging and transition.
5. R1-F005: Fix the seed to `['--compatibility-mode', '--evidence-file', 'x.json']`, or specify and test that both forms resolve identically in parseArgs and estimationDispatchDecision.
6. R1-F006: Define ledger entries as provider-call records with category attribution. Assert zero `staging` provider calls on the ledger of the process that actually staged.

## Optional suggestions

### R1-F009 — Add per-task hour ranges to the 24–34 h estimate

See R1-F007. One line per Task1–Task9.

### R1-F010 — Mark O-only line references as O

Label O-specific references such as `native-transition` line56 and `ctx.storyCache` with their pin, so readers do not search K for them. See R1-F008.

## Decision

revisions-requested
