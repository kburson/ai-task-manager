# Task 3 report: DONE

The earlier NEEDS_CONTEXT finding below was resolved by explicit user authorization, recorded in revised specification/plan commit `29dbd6015947935306506778c8cd1106044b691c`. The resumed implementation and verification report follows the preserved original investigation.

## Implementation summary

No implementation or test files were changed. The required unchanged external verifier cannot verify a truthful advanced local-head input. Work stopped at the task brief's explicit signature/authority-path stop condition, then continued only with the parent-authorized read-only trace and reproduction.

Initial worktree status was clean. HEAD was `146845bd` (`[#1574] Validate historical intent reconstruction authority`), preceded by Task 1 commit `1d04b8af`. The `node_modules/ai-task-manager` self-link resolves to `..`.

## Exact blocker and existing call-site comparison

- `scripts/task-tracker/lib/delivery-verification.mjs:29-31` excludes `recovery` from the exact external verification input keys.
- Lines 113-130 validate authority SHAs. Specifically, lines 128-129 reject `localHeadSha !== acceptedSha` unless `input.recovery === true`.
- Lines 434-435 receive a separate `{ requireAuthorizedBytes, recovery }` option, but call `assertAuthorityShas(input, intent)` without using that recovery option.
- Lines 577-592 enforce the external exact-key schema, then pass `recovery: true` only as the separate option. Thus that value never reaches the SHA assertion.
- Ordinary historical recovery works because `deliver.mjs:779-798` supplies `recovery: true` through `verifyAndFinalize`, whose `verifyDeliveredPullRequest` call includes it in the input object. That verifier explicitly accepts the property at `delivery-verification.mjs:561-568`.
- Current-head external recovery at `deliver.mjs:928-947` works because the observed local head equals the accepted SHA, so the missing input recovery property has no effect there.

There is no supported external-verifier input shape that both preserves the observed advanced local SHA and passes today's validation. Replacing the observed local SHA with the accepted SHA would falsify an observation and is not an acceptable authority path. Routing through the ordinary verifier would diverge from the explicitly required external helper and change how prospective external bytes are established.

## Minimal plan-level decision required

Permit a narrowly scoped correction in the external verifier's internal recovery plumbing so its existing `recovery: true` mode reaches the authority assertion. Preserve the exact external public input schema, the original local-head observation, provider/Git proof, attribution checks, and observed-versus-intended merge-method equality. Pin that correction with a separate RED/GREEN verifier test before proceeding with the requested integration slice. This requires changing the plan's current instruction to verify `delivery-verification.mjs` unchanged.

Also observed: both the production PR adapter (`deliver.mjs:1448-1474`, including the requested `mergeCommit` JSON field) and the scoped harness return `mergeCommit.oid`, not `mergeCommitSha`. `resolveAcceptedDeliveryAuthority` preserves that shape. The existing verifier already supports both forms at `delivery-verification.mjs:103-107`; the new routing slice should use the corresponding provider merge SHA rather than assume a synthesized `mergeCommitSha` field. This is a call-site shape issue, not a reason to alter provider evidence.

## Exact write ordering

No reconciliation, intent, or receipt writes occurred. The intended ordering remains: validate reconstruction preflight; observe/resolve topology; build v2 reconciliation and prospective external input in memory; complete unchanged proof checks; append reconciliation; append/read back intent; finalize/read back receipt using precomputed verification. The existing external verifier prevents reaching that ordering with an advanced observed local head.

## Read-only reproduction

Executed in `/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent`:

```bash
node --input-type=module <<'JS'
import { verifyExternalDeliveredPullRequest } from './scripts/task-tracker/lib/delivery-verification.mjs';
import { makeHarness, HEAD, NEXT_HEAD, INTENT_IDS, MERGED_AT } from './scripts/tests/unit/task-tracker/verbs/deliver-test-harness.mjs';
const harness = makeHarness({ prState: 'MERGED', prHead: HEAD, head: NEXT_HEAD, testReceiptSha: HEAD, acceptedReviewSha: HEAD, historyMergeMethod: 'merge', prMergeMethod: null });
const input = {
  intentInput: { intentId: INTENT_IDS[0], supersedesIntentId: null, issueNumber: 939, repository: 'kburson/ai-task-manager', prNumber: 1400, baseRef: 'trunk', headRef: 'codex/939-full-auto-merge', expectedHeadSha: HEAD, mergeMethod: 'merge', attributionTokens: ['#939'], provider: 'external', sessionId: 'session-939', clientCreatedAt: MERGED_AT },
  pullRequest: await harness.deps.fetchPullRequest({ prNumber: 1400 }), acceptedSha: HEAD, localHeadSha: NEXT_HEAD, testReceiptSha: HEAD, acceptedReviewSha: HEAD,
  fetchOriginTrunk: harness.deps.fetchOriginTrunk, isAncestor: harness.deps.isAncestor, inspectMergeCommit: harness.deps.inspectMergeCommit, attributingCommits: harness.deps.attributingCommits,
};
for (const [name, candidate] of [['advanced input', input], ['advanced plus recovery', { ...input, recovery: true }], ['current-head control', { ...input, localHeadSha: HEAD }]]) {
  try { const result = await verifyExternalDeliveredPullRequest(candidate); console.log(name + ': verified ' + result.receiptInput.expectedHeadSha); }
  catch (error) { console.log(name + ': ' + error.message); }
}
console.log('new comments: ' + harness.calls.createIssueComment);
console.log('PR mergeCommitSha: ' + input.pullRequest.mergeCommitSha);
console.log('PR mergeCommit.oid: ' + input.pullRequest.mergeCommit.oid);
JS
```

Output (exit 0):

```text
advanced input: delivery-verification:authority-sha-mismatch
advanced plus recovery: delivery-verification:input-keys
current-head control: verified aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
new comments: 0
PR mergeCommitSha: undefined
PR mergeCommit.oid: cccccccccccccccccccccccccccccccccccccccc
```

## RED, GREEN, negatives, regression, and iteration verification

The requested RED test edit/run, GREEN runs, negative zero-write test cases, unchanged regression run, and `node scripts/task-tracker/verify-develop.mjs --mode iteration` were not performed: the blocker was found during mandatory pre-edit reading, and the parent explicitly instructed a read-only trace with no edits yet. The reproduction above is diagnostic evidence, not a substitute for the required integration RED/GREEN cycle.

`git diff --check` completed with exit 0 and no output. `git status --short` also produced no output; the scratch report is ignored.

## Files changed and commit

Only this ignored scratch report was added. No tracked files changed; no commit was created. No amend, push, merge, rebase, `npx aitm`, GitHub write, or issue lifecycle mutation was performed.

## Self-review and concerns

Reviewed the external public input contract, authority assertion, internal verification call, ordinary and external delivery call sites, Task 1/2 public interfaces, entire scoped deliver test harness, and reconciliation regression tests. The finding is supported both statically and by an isolated runtime control comparison. No bypass or relaxed authority path was introduced. Task 3 remains unimplemented pending the plan-level verifier decision above.

---

## Resumed implementation from the authorized baseline

Baseline was verified as exactly `29dbd6015947935306506778c8cd1106044b691c`, with a clean tracked worktree. Re-read the refreshed Task 3 brief before edits. Applied test-driven-development and verification-before-completion: both requested missing behaviors were witnessed failing before their production changes.

The external verifier now carries its selected internal `recovery` option into `assertAuthorityShas` as a function argument. Its public exact-key schema remains unchanged and still rejects an externally supplied `recovery` property. The observed local HEAD is preserved. Ordinary non-recovery verification still rejects a local/accepted-head mismatch; all provider/Git, accepted-authority equality, merge-method equality, commit-byte, and attribution checks are unchanged.

The advanced-head delivery branch now selects reconstruction only when there is no live intent and explicit reconciliation was requested. It consumes the committed reconstruction preflight, normalizes the provider merge SHA using the existing `mergeCommitSha` or `mergeCommit.oid` shapes, observes topology, resolves the declared method, builds the v2 reconstruction record, and independently verifies the prospective external intent. Existing live-intent recovery and no-flag behavior retain their original route.

### Exact write order

1. Read/project existing comments, resolve accepted authority, validate reconstruction preflight.
2. Inspect merge topology and compare observed, declared, and configured methods.
3. Build v2 reconciliation and prospective external intent input in memory.
4. Run external verification: validate authority/provider observations; fetch origin/trunk; prove merge ancestry; independently inspect merge topology/bytes; validate method equality, external intent bytes, attribution, and branch disposition.
5. Append the reconciliation comment.
6. Append the verified external intent and perform established exact readback/projection checks.
7. Build and append the receipt from precomputed verification, then perform established exact receipt readback/projection checks.

The success test asserts one completed trunk fetch, one ancestry check, and two merge inspections at every comment append. It asserts reconciliation → intent → receipt by parsing comment markers, and intent/receipt readback ordering from harness events. It verifies v2 schema/origin, old accepted SHA on intent and receipt, actual provider merge SHA, external provider, observed merge method, retained advanced local HEAD, no fresh-head checks, and no provider action.

### Files changed

- `scripts/task-tracker/verbs/deliver.mjs`: import reconstruction preflight and add the explicit advanced/no-intent proof-before-write route.
- `scripts/task-tracker/lib/delivery-verification.mjs`: exactly three internal recovery-plumbing line changes.
- `scripts/tests/unit/task-tracker/verbs/deliver.test.mjs`: scoped historical fixture, success/write-order test, eight negative zero-write cases.
- `scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs`: truthful advanced-head test and unchanged schema/equality guards.

The reconciliation regression file, shared harness file, and already committed docs/spec were unchanged. Tracked diff: 4 files, 257 insertions, 3 deletions.

### RED 1: verifier

Exact command:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
```

Exit 1; exact relevant output:

```text
✖ external recovery verifies an advanced observed local head against accepted authority (0.154584ms)
ℹ tests 4
ℹ suites 0
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59.421083
  TypeError: delivery-verification:authority-sha-mismatch
```

Expected cause: external recovery's internally selected mode did not reach the authority assertion. The test passed its truthful advanced local HEAD; no malformed schema or test setup error caused the failure.

### GREEN 1: verifier

Ran the identical command after the three-line internal correction. Exit 0; exact output:

```text
✔ verifies multi-issue squash attribution from exact inspected commit bytes (2.6635ms)
✔ external recovery accepts one canonical inspected attribution line (0.436291ms)
✔ external recovery verifies an advanced observed local head against accepted authority (0.413208ms)
✔ external recovery rejects noncanonical inspected attribution lines (0.90925ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 56.825666
```

### RED 2: delivery routing

Exact command:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Exit 1; exact relevant output:

```text
✖ advanced local head explicitly reconstructs a missing intent after proving historical delivery (0.289292ms)
ℹ tests 72
ℹ suites 0
ℹ pass 71
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 151.219875
  TypeError [DeliveryPreflightError]: delivery-preflight:historical-intent
```

Expected cause: the explicit reconciliation invocation still entered the old historical-intent-required route. The immediately preceding no-flag refusal assertion succeeded.

### GREEN 2: delivery routing

Ran the identical command after routing implementation. Exit 0; exact success line and summary:

```text
✔ advanced local head explicitly reconstructs a missing intent after proving historical delivery (1.230417ms)
ℹ tests 72
ℹ suites 0
ℹ pass 72
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 152.225417
```

### GREEN 3: negatives and unchanged regression

Exact command:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs
```

Exit 0; exact regression/negative output and suite summary:

```text
✔ an operator cannot launder a false squash through the lane (0.756333ms)
✔ the lane cannot be used to rubber-stamp a matching configuration (0.0775ms)
✔ an unattributable topology refuses rather than defaulting to the declaration (0.133459ms)
✔ a merge whose second parent is not the delivered head refuses (0.090125ms)
✔ historical reconstruction refuses unmerged PR without any ledger writes (0.160209ms)
✔ historical reconstruction refuses unreachable merge without any ledger writes (0.233ms)
✔ historical reconstruction refuses unattributable topology without any ledger writes (0.12975ms)
✔ historical reconstruction refuses declared method mismatch without any ledger writes (0.131334ms)
✔ historical reconstruction refuses missing flag without any ledger writes (0.101667ms)
✔ historical reconstruction refuses failed trunk fetch without any ledger writes (0.162125ms)
✔ historical reconstruction refuses provider method mismatch without any ledger writes (0.26775ms)
✔ historical reconstruction refuses invalid attribution without any ledger writes (0.26875ms)
ℹ tests 84
ℹ suites 0
ℹ pass 84
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 151.43975
```

Each negative case asserts zero comment creation calls and an empty comment collection.

### GREEN 4: verifier guards

Exact command:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
```

Exit 0; exact output after adding schema/equality guards:

```text
✔ verifies multi-issue squash attribution from exact inspected commit bytes (3.1345ms)
✔ external recovery accepts one canonical inspected attribution line (0.465708ms)
✔ external recovery verifies an advanced observed local head against accepted authority (0.234709ms)
✔ external recovery keeps its exact input schema and authority equality checks (0.526667ms)
✔ external recovery rejects noncanonical inspected attribution lines (0.949125ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 60.00875
```

### Formatting and iteration verification

Formatted only the four authorized changed files:

```bash
./node_modules/.bin/prettier --write scripts/task-tracker/verbs/deliver.mjs scripts/task-tracker/lib/delivery-verification.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
```

Both exited 0. The iteration verifier reran formatting and affected tests, including all focused tests after formatting, plus delivery/close integration and surrounding verifier regressions. The tool output was lengthy and truncated; the final process exit was 0. Exact final output line:

```text
verify-develop: iteration checks passed
```

The observed suite output included the expected fixture refusal diagnostics, simulated network-failure messages, and legacy approval fixture warnings. None caused verifier failure.

Ran `git diff --check` before and after commit: exit 0, no output. Confirmed unchanged regression with:

```bash
git diff --exit-code 29dbd6015947935306506778c8cd1106044b691c -- scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs
```

Exit 0, no output.

### Commit

```bash
git add scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/task-tracker/lib/delivery-verification.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
git commit -m "[#1574] Reconstruct missing historical delivery intent"
```

Exact commit output:

```text
[codex/defect-1574-historical-intent 7d7e3180] [#1574] Reconstruct missing historical delivery intent
 4 files changed, 257 insertions(+), 3 deletions(-)
```

Commit: `7d7e31805d4d8672367c46e483a2c52c088fc208` — `[#1574] Reconstruct missing historical delivery intent`. Post-commit tracked worktree status is clean. No docs, scratch report, unrelated files, or prior commits were included/amended. No push, merge, rebase, `npx aitm`, GitHub write, or live issue lifecycle change was performed.

### Final self-review and concerns

Reviewed the complete final four-file diff. Confirmed the external public schema and method equality remain byte-unchanged, internal recovery is correctly propagated for both public verifier wrappers, truthful local HEAD reaches verification, no writes precede successful verification, and append/readback helpers retain their existing behavior. Confirmed old ordinary historical recovery, external-intent refusal, no-flag refusal, current-head delivery, and reconciliation regression tests remain green.

Retained limitation explicitly required by this slice: when a live intent already exists, the advanced-head branch still uses the original historical recovery preflight, which rejects external intents. Consequently a later advanced-head deliver retry after successful reconstruction (or after intent append but before receipt completion) still enters that refusal. This task does not add retry/resume semantics for reconstructed external intents. The parent should account for that limitation in any subsequent lifecycle work; the implementation follows the brief's instruction to preserve the existing live-intent route. No other implementation concerns found.

---

## Retry correction: DONE

The preceding retained limitation was rejected by the parent as a correctness gap against the accepted ambiguous-write/retry contract. This follow-up resolves it. It supersedes that concern and the earlier DONE_WITH_CONCERNS status.

### Implementation and exact write order

An explicit advanced-head reconciliation invocation now parses and validates existing reconciliation comments before deciding which missing records to append. Only canonical v2 records with the retroactively-reconstructed origin qualify. Matching authority includes issue, repository, PR, accepted SHA, merge SHA, configured method, observed method, and exact substantive reason. The parser rejects misplaced/duplicate markers, invalid JSON, unknown/missing keys, malformed fields, noncanonical payload bytes, and invalid calendar timestamps. Duplicate v2 records or mismatched authority refuse.

For an existing reconstructed external intent, the route first requires matching v2 provenance, rebuilds the expected authority projection using that intent's existing identity/session/timestamp and observed bytes, and checks exact full intent equality. It then supplies the original live intent to the existing verifyAndFinalize path, which independently verifies provider/Git facts and exact authorized commit bytes before considering a receipt write. No new intent ID or replacement intent is generated.

Persisted-prefix behavior:

- Reconciliation only: observe/resolve topology; validate matching provenance; independently verify external delivery; preserve reconciliation; append/read back intent; append/read back receipt.
- Reconciliation plus intent: observe/resolve topology; validate matching provenance and intent authority; independently verify the original intent; append/read back receipt only.
- All three records: repeat the same authority and live verification checks; return already-delivered without writes.
- Missing/malformed/mismatched v2 provenance: refuse before any write. Ordinary external intents and v1 records gain no historical recovery authority.
- A lost reconciliation POST response leaves one record; a subsequent explicit retry reads and reuses it, independently verifies again, and appends only the missing intent/receipt.

All retries still require the reconciliation flag, matching observed declaration, and the original substantive reason. Changing any of those, topology, trunk reachability, or commit bytes refuses with no new writes.

### Files changed in the follow-up

- scripts/task-tracker/lib/delivery-method-reconciliation.mjs: exact canonical marker parser/validator.
- scripts/task-tracker/verbs/deliver.mjs: matching-v2 provenance selection, reconciliation deduplication, original-intent retry verification.
- scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs: strict parser tests.
- scripts/tests/unit/task-tracker/verbs/deliver.test.mjs: persisted-prefix convergence, lost reconciliation response, 21 explicit-authority/live-proof refusal cases, and 13 provenance refusal cases.

The external verifier and reconciliation regression file were unchanged by this follow-up. Formatting normalized the existing long schema-selection expression and one prior test expression in the touched record module/test.

### RED: persisted prefixes

First ran the requested full deliver suite after adding failing prefix/provenance tests:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Exit 1. All three persisted-prefix cases failed. The new provenance cases reached the prior historical-intent refusal instead of validated provenance handling. A focused diagnostic isolated the prefix failures:

```bash
node --test --test-name-pattern='persisted' scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Exact output:

```text
✖ historical reconstruction retries a persisted 1-record prefix without duplicates (8.719833ms)
✖ historical reconstruction retries a persisted 2-record prefix without duplicates (1.250125ms)
✖ historical reconstruction retries a persisted 3-record prefix without duplicates (1.13475ms)
ℹ tests 3
ℹ suites 0
ℹ pass 0
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 87.126083

✖ failing tests:

test at scripts/tests/unit/task-tracker/verbs/deliver.test.mjs:576:3
✖ historical reconstruction retries a persisted 1-record prefix without duplicates (8.719833ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  3 !== 2
  
      at TestContext.<anonymous> (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/tests/unit/task-tracker/verbs/deliver.test.mjs:593:12)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 3,
    expected: 2,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at scripts/tests/unit/task-tracker/verbs/deliver.test.mjs:576:3
✖ historical reconstruction retries a persisted 2-record prefix without duplicates (1.250125ms)
  TypeError [DeliveryPreflightError]: delivery-preflight:historical-intent
      at fail (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/task-tracker/lib/delivery-preflight.mjs:33:9)
      at validateHistoricalRecoveryPreflight (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/task-tracker/lib/delivery-preflight.mjs:287:65)
      at runDeliver (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/task-tracker/verbs/deliver.mjs:862:24)
      at async TestContext.<anonymous> (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/tests/unit/task-tracker/verbs/deliver.test.mjs:586:20)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    category: 'historical-intent'
  }

test at scripts/tests/unit/task-tracker/verbs/deliver.test.mjs:576:3
✖ historical reconstruction retries a persisted 3-record prefix without duplicates (1.13475ms)
  TypeError [DeliveryPreflightError]: delivery-preflight:historical-intent
      at fail (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/task-tracker/lib/delivery-preflight.mjs:33:9)
      at validateHistoricalRecoveryPreflight (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/task-tracker/lib/delivery-preflight.mjs:287:65)
      at runDeliver (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/task-tracker/verbs/deliver.mjs:862:24)
      at async TestContext.<anonymous> (file:///Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1574-historical-intent/scripts/tests/unit/task-tracker/verbs/deliver.test.mjs:586:20)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    category: 'historical-intent'
  }

```

Expected causes: prefix 1 appended a duplicate reconciliation (3 writes instead of 2); prefixes 2 and 3 rejected the reconstructed external intent with delivery-preflight:historical-intent.

### RED/GREEN: strict parser

Exact command:

```bash
node --test scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
```

Initial RED: exit 1, tests 16, pass 15, fail 1. The new assertion observed parseMethodReconciliationComment was undefined instead of a function. After implementation: exit 0, tests 16, pass 16, fail 0.

A further malformed-calendar case used 2026-99-09T04:00:00.000Z. RED: the same command exited 1 with Missing expected exception (15/16 passing). Added a canonical calendar-instant check; GREEN: exit 0, 16/16 passing, duration_ms 49.629875. This catches invalid timestamp values that match the existing builder's ISO-shaped regex.

### GREEN: delivery, provenance, and final combined regressions

After the minimum retry route, ran:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs
```

Exit 0, tests 101, pass 101, fail 0. All three persisted-prefix cases and thirteen provenance cases passed.

After adding lost reconciliation response coverage and the twenty-one explicit-authority/live-proof cases across all three prefixes, the same command exited 0 with tests 124, pass 124, fail 0.

Final command after formatting, covering both implementation commits:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
```

Exit 0. Exact output:

```text
✔ an operator cannot launder a false squash through the lane (0.709833ms)
✔ the lane cannot be used to rubber-stamp a matching configuration (0.077292ms)
✔ an unattributable topology refuses rather than defaulting to the declaration (0.138833ms)
✔ a merge whose second parent is not the delivered head refuses (0.093ms)
✔ parses one exact canonical reconciliation marker and validates all record fields (3.256917ms)
✔ builds a reconciliation record carrying both methods and the reason (0.109334ms)
✔ builds a frozen v2 reconstruction record with the exact retroactive origin (0.184792ms)
✔ validates a v2 reconstruction record and refuses a tampered origin (0.128084ms)
✔ renders v2 with the no-delivery-time-intent reconstruction explanation (0.150625ms)
✔ records are frozen so a caller cannot mutate recorded evidence (0.072792ms)
✔ divergent is false when the observed method equals the configured one (0.077ms)
✔ refuses an empty or whitespace reason (0.118ms)
✔ refuses a reason that is only a placeholder (0.096833ms)
✔ refuses a merge method outside the known set (0.133583ms)
✔ refuses malformed shas (0.103334ms)
✔ validate accepts a freshly built record and rejects a tampered one (0.571208ms)
✔ resolve returns the declared method when observation agrees (0.093959ms)
✔ resolve refuses when the declared method contradicts observation (0.070666ms)
✔ resolve refuses a no-op reconciliation that matches configuration (0.049458ms)
✔ resolve refuses an unknown observation rather than guessing (0.053333ms)
✔ verifies multi-issue squash attribution from exact inspected commit bytes (2.817542ms)
✔ external recovery accepts one canonical inspected attribution line (0.44025ms)
✔ external recovery verifies an advanced observed local head against accepted authority (0.240125ms)
✔ external recovery keeps its exact input schema and authority equality checks (0.49825ms)
✔ external recovery rejects noncanonical inspected attribution lines (0.730958ms)
✔ first open-PR call posts one exact intent before emitting one action and exits 20 (7.494625ms)
✔ configured rebase refuses before durable intent or provider action output (0.483667ms)
✔ lost POST response reconciles the server-visible dedupe key without posting again (1.0945ms)
✔ same dedupe key with divergent authorized bytes fails closed (0.547ms)
✔ same-head pending intent reruns live preflight and re-emits byte-identical JSON (0.905916ms)
✔ merged exact head is independently verified and receives one durable receipt (1.940333ms)
✔ merged verification rejects a missing merge SHA (1.245375ms)
✔ merged verification rejects the wrong recorded pre-merge head (0.838416ms)
✔ merged delivery refuses a test SHA disagreement without appending a receipt (1.162333ms)
✔ merged delivery refuses a review SHA disagreement without appending a receipt (0.614458ms)
✔ merged verification rejects an exposed merge-method mismatch (0.755125ms)
✔ merged verification rejects a live-history merge-method mismatch (0.603625ms)
✔ merged verification rejects an indistinguishable live-history merge method (0.559459ms)
✔ ordinary delivery still requires live merge bytes to equal the prior authorization (0.54925ms)
✔ configured merge verifies an exact two-parent live-history shape (0.82325ms)
✔ merged verification rejects unknown branch disposition observations (2.672208ms)
✔ merged verification fails closed when the authoritative trunk fetch fails (0.622833ms)
✔ merged verification rejects a merge result unreachable from fetched origin/trunk (0.565917ms)
✔ ordinary intent rejects a merge timestamp earlier than the server intent timestamp (0.599125ms)
✔ ambiguous provider outcome reconciles an open PR as the same action-required intent (0.515458ms)
✔ ambiguous provider outcome reconciles a merged PR from live state, not provider output (0.714791ms)
✔ repeated exact receipt re-verifies live PR and trunk without creating another comment (1.431084ms)
✔ advanced local head recovers one historical receipt from a prior durable intent (1.0265ms)
✔ advanced local head refuses historical recovery while the accepted PR is open (0.485958ms)
✔ advanced local head requires accepted Agent Review and standing approval (0.739333ms)
✔ advanced local head refuses wrong-SHA Test or Review evidence (0.636125ms)
✔ advanced local head enforces intent-time ordering and trunk reachability (1.05425ms)
✔ advanced local head rejects divergent prior intent repository bytes (0.561417ms)
✔ advanced local head rejects divergent prior intent issue bytes (0.4525ms)
✔ advanced local head rejects divergent prior intent pull request bytes (0.438708ms)
✔ advanced local head rejects divergent prior intent base bytes (0.50825ms)
✔ advanced local head rejects divergent prior intent branch bytes (0.469834ms)
✔ advanced local head rejects divergent prior intent head bytes (0.485959ms)
✔ advanced local head rejects divergent prior intent method bytes (0.506125ms)
✔ advanced local head rejects divergent prior intent attribution bytes (0.621042ms)
✔ advanced local head rejects divergent prior intent title bytes (0.901125ms)
✔ advanced local head rejects divergent prior intent message bytes (0.526459ms)
✔ advanced local head refuses historical recovery when Full-Auto delivery is disabled (0.466ms)
✔ advanced local head rejects duplicate and divergent historical receipts (2.169459ms)
✔ advanced local head refuses historical recovery without a prior intent (0.179958ms)
✔ advanced local head explicitly reconstructs a missing intent after proving historical delivery (1.306209ms)
✔ historical reconstruction retries a persisted 1-record prefix without duplicates (1.88325ms)
✔ historical reconstruction retries a persisted 2-record prefix without duplicates (1.038917ms)
✔ historical reconstruction retries a persisted 3-record prefix without duplicates (0.783291ms)
✔ historical reconstruction recovers a lost reconciliation POST response without duplicate records (0.709333ms)
▶ historical reconstruction retries require explicit authority and fresh provider/Git proof
  ✔ 1 records: missing flag (0.162542ms)
  ✔ 1 records: changed reason (0.162708ms)
  ✔ 1 records: placeholder reason (0.143958ms)
  ✔ 1 records: changed declaration (0.322417ms)
  ✔ 1 records: unreachable merge (0.244125ms)
  ✔ 1 records: changed topology (0.142666ms)
  ✔ 1 records: changed live bytes (0.335083ms)
  ✔ 2 records: missing flag (0.208916ms)
  ✔ 2 records: changed reason (0.241834ms)
  ✔ 2 records: placeholder reason (0.211416ms)
  ✔ 2 records: changed declaration (0.182ms)
  ✔ 2 records: unreachable merge (0.248ms)
  ✔ 2 records: changed topology (0.166208ms)
  ✔ 2 records: changed live bytes (0.257125ms)
  ✔ 3 records: missing flag (0.196375ms)
  ✔ 3 records: changed reason (0.233042ms)
  ✔ 3 records: placeholder reason (0.212791ms)
  ✔ 3 records: changed declaration (0.207958ms)
  ✔ 3 records: unreachable merge (0.2695ms)
  ✔ 3 records: changed topology (0.189958ms)
  ✔ 3 records: changed live bytes (0.257458ms)
✔ historical reconstruction retries require explicit authority and fresh provider/Git proof (6.115292ms)
▶ historical reconstruction refuses missing, malformed, or mismatched v2 retry provenance
  ✔ missing (0.259416ms)
  ✔ malformed (0.528917ms)
  ✔ v1 only (0.210042ms)
  ✔ wrong origin (0.182458ms)
  ✔ wrong issue (0.184792ms)
  ✔ wrong repository (0.179458ms)
  ✔ wrong PR (0.179958ms)
  ✔ wrong accepted SHA (0.177792ms)
  ✔ wrong merge SHA (0.285167ms)
  ✔ wrong configured method (0.199458ms)
  ✔ wrong observed method (0.186334ms)
  ✔ wrong reason (0.19175ms)
  ✔ false divergence (0.172584ms)
✔ historical reconstruction refuses missing, malformed, or mismatched v2 retry provenance (3.795041ms)
✔ historical reconstruction refuses unmerged PR without any ledger writes (0.112583ms)
✔ historical reconstruction refuses unreachable merge without any ledger writes (0.117084ms)
✔ historical reconstruction refuses unattributable topology without any ledger writes (0.089042ms)
✔ historical reconstruction refuses declared method mismatch without any ledger writes (0.082ms)
✔ historical reconstruction refuses missing flag without any ledger writes (0.076083ms)
✔ historical reconstruction refuses failed trunk fetch without any ledger writes (0.121792ms)
✔ historical reconstruction refuses provider method mismatch without any ledger writes (0.117334ms)
✔ historical reconstruction refuses invalid attribution without any ledger writes (0.138166ms)
✔ advanced local head refuses an external recovery intent (0.25475ms)
✔ lost receipt POST response is reconciled from the single server-visible receipt (0.795708ms)
✔ conflicting receipts fail closed before any new comment is created (1.274958ms)
✔ already-merged external recovery appends an external intent and receipt without an action (0.591708ms)
✔ external recovery proves a configured squash from complete single-source history (0.495792ms)
✔ external recovery accepts exact legacy escaped attribution (0.723542ms)
▶ external recovery refuses altered legacy escaped attribution
  ✔ missing (0.237541ms)
  ✔ altered (0.167542ms)
  ✔ duplicated (0.153959ms)
  ✔ physical newlines (0.170083ms)
  ✔ altered title (0.173ms)
  ✔ non-squash (0.154791ms)
  ✔ multiple tokens (0.171167ms)
✔ external recovery refuses altered legacy escaped attribution (1.498333ms)
✔ external recovery refuses ambiguous one-parent rewritten history with missing method observation (0.178083ms)
✔ external recovery refuses ambiguous one-parent rewritten history with null method observation (0.121084ms)
✔ external recovery strictly rejects malformed provider merge-method evidence (0.142291ms)
✔ external recovery rejects a provider method observation that mismatches configuration (0.158ms)
✔ external recovery structurally verifies a two-parent merge without provider method evidence (0.850291ms)
✔ ordinary prior-intent squash remains verifiable without provider method evidence (0.717875ms)
✔ external recovery records observed merge bytes instead of synthesizing provider bytes (0.782166ms)
✔ external recovery refuses empty-title observed commit bytes before writing (0.258416ms)
✔ external recovery refuses control-character-title observed commit bytes before writing (0.180834ms)
✔ external recovery refuses control-character-message observed commit bytes before writing (0.153708ms)
✔ failed first external recovery writes nothing and a corrected retry succeeds (0.58275ms)
✔ external recovery derives required attribution from PR history when post-merge range is empty (0.547917ms)
✔ repeated external recovery re-verifies as already delivered without timestamp reclassification (0.851167ms)
✔ changed head requires fresh Test and review evidence then supersedes the prior intent (1.093792ms)
✔ child lineage returns an explicit non-provider result without provider or terminal effects (0.086333ms)
✔ unknown lineage fails closed instead of being classified as child delivery (0.074875ms)
✔ requested issue number never substitutes for a missing active binding (0.122708ms)
ℹ tests 145
ℹ suites 0
ℹ pass 145
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 169.811208

```

### Iteration verification and diff checks

Ran:

```bash
./node_modules/.bin/prettier --write scripts/task-tracker/verbs/deliver.mjs scripts/task-tracker/lib/delivery-method-reconciliation.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
git diff --check
git diff --exit-code 7d7e31805d4d8672367c46e483a2c52c088fc208 -- scripts/task-tracker/lib/delivery-verification.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs
```

All exited 0. Diff checks produced no output. Iteration verification ended:

```text
verify-develop: iteration checks passed
```

Full captured iteration output is saved beside this report at .superpowers/sdd/task-3-retry-iteration.log. The iteration run includes expected fixture diagnostics; its process exit and all reported affected-test command exits were 0.

### Commit and final self-review

New commit (no amend): afaccfdd9d908818f30b32e2802404ca1deec232 — [#1574] Resume historical reconstruction from persisted records.

Exact commit output:

```text
[codex/defect-1574-historical-intent afaccfdd] [#1574] Resume historical reconstruction from persisted records
 4 files changed, 265 insertions(+), 16 deletions(-)
```

Post-commit git status --short and git diff --check produced no output.

Self-review confirmed each persisted prefix converges without duplicate writes; malformed/divergent/authority-mismatched provenance fails closed; original intent identity is preserved; existing external and v1 intent lanes are not broadened without v2 provenance; declaration/reason checks and live provider/Git proof precede any appended receipt; both prior verifier-plumbing and reconstruction tests remain green. The earlier retry concern is resolved. No known remaining implementation concerns. No push, merge, rebase, npx aitm, GitHub mutation, or lifecycle mutation was performed.

---

## Final review fix wave

Status: DONE. The Important manual-PR-review bypass and Minor exact-key coverage finding are resolved in a single new commit.

### Verified finding and implementation

Reviewed the feedback against the existing control flow using the receiving-code-review workflow. The finding was correct: reconstruction and its live-intent retry returned before the current-head manual review gate. The pure manual-review policy itself was correct and reusable.

Extracted the existing read-only gate resolution, reviewer resolution, evidence fetch, policy evaluation, and merged-PR refusal into checkManualCodeReview. Initial reconstruction and all reconstructed-intent retry paths invoke it immediately after reconstruction preflight with authority.acceptedSha, before topology verification or any comment write. The current-head path invokes the same helper at its original position after check/preflight evaluation. Open-PR review-request mutation remains in the current-head caller with its existing result shape and error categories. Ordinary prior-intent historical recovery retains its original path, proven by a guard test that fails if manual-review evidence is requested there.

Missing or stale approval on the merged historical PR raises delivery-preflight:manual-code-review-approval-missing and writes no comments or review requests. Eligible exact accepted-head approval succeeds, including every persisted prefix. Tests assert the evidence request uses the historical accepted SHA (HEAD), never the observed advanced local SHA (NEXT_HEAD), and occurs before any comment append.

Added a direct extra intent: null property test against validateHistoricalReconstructionPreflight, expecting delivery-preflight:input. The existing exact-key production guard required no change.

### Files

- scripts/task-tracker/verbs/deliver.mjs: shared read-only manual-review helper and reconstruction invocation.
- scripts/tests/unit/task-tracker/verbs/deliver.test.mjs: 12 manual-review cases across 0/1/2/3 persisted records plus preserved ordinary-history behavior.
- scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs: direct extra-intent-key refusal case. Formatting also normalized one pre-existing multiline table entry.

No changes to delivery-preflight.mjs, delivery-verification.mjs, manual-code-review.mjs, or the reconciliation regression file.

### RED evidence

Exact command before production edits:

```bash
node --test --test-name-pattern='manual approval|ordinary prior-intent historical' scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

Exit 1. All twelve new reconstruction/retry subcases failed; ordinary prior-intent historical recovery passed. Exact summary:

```text
ℹ tests 14
ℹ suites 0
ℹ pass 1
ℹ fail 13
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 100.798541
```

Missing/stale cases failed with AssertionError [ERR_ASSERTION]: Missing expected rejection. Exact accepted-head cases failed because observedHeads was empty rather than [HEAD], proving the manual evidence path was bypassed even when an eligible approval existed. Full exact output: .superpowers/sdd/task-3-final-review-red.log.

The separate direct exact-key test was expected to pass immediately because the production guard already existed:

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
```

Exit 0, tests 11, pass 11, fail 0, duration_ms 531.807666. No artificial production change was made to create a failure for this coverage-only finding.

### GREEN evidence

After extracting and invoking the existing read-only policy, ran the identical targeted RED command. Exit 0; exact output:

```text
▶ historical reconstruction and every retry enforce manual approval of the accepted historical SHA
  ✔ 0 records: missing approval (1.213709ms)
  ✔ 0 records: stale local-head approval (0.415916ms)
  ✔ 0 records: exact accepted-head approval (1.123625ms)
  ✔ 1 records: missing approval (0.306583ms)
  ✔ 1 records: stale local-head approval (0.27775ms)
  ✔ 1 records: exact accepted-head approval (1.078625ms)
  ✔ 2 records: missing approval (0.355458ms)
  ✔ 2 records: stale local-head approval (0.362125ms)
  ✔ 2 records: exact accepted-head approval (1.007459ms)
  ✔ 3 records: missing approval (0.447708ms)
  ✔ 3 records: stale local-head approval (0.336625ms)
  ✔ 3 records: exact accepted-head approval (1.04075ms)
✔ historical reconstruction and every retry enforce manual approval of the accepted historical SHA (16.34425ms)
✔ ordinary prior-intent historical recovery retains its existing manual-review behavior (1.4015ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 95.63725

```

Ran existing policy and open-current-head behavior tests:

```bash
node --test scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs
```

Exit 0, tests 9, pass 9, fail 0, duration_ms 82.290417. This includes CI-before-review-request ordering, no intent before manual approval, exact-head approval, stale approval refusal, author/bot/unreadable policy refusals, and the existing review-request result.

After formatting, ran all Task 3 focused/regression suites, the doctrine test, and manual-review behavior together:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
```

Exit 0; exact summary:

```text
ℹ tests 179
ℹ suites 0
ℹ pass 179
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 520.204208
```

Full exact output: .superpowers/sdd/task-3-final-review-green.log.

Also ran related manual-review configuration/default documentation tests:

```bash
node --test scripts/tests/unit/task-tracker/core/full-auto-default-doc.test.mjs scripts/tests/unit/task-tracker/lib/auto-mode.test.mjs
```

Exit 0; exact output:

```text
✔ auto help exposes Full-Auto default plus independent manual review choices (0.491083ms)
✔ shared Full-Auto policy translates the three exact user phrases (0.581792ms)
✔ all provider adapters point at the canonical Full-Auto policy (0.2175ms)
✔ workflow and settings document the three default-auto gates and reviewer config (0.465959ms)
✔ new sessions and project defaults are Full-Auto for all three review boundaries (0.492042ms)
✔ explicit project policy remains authoritative over Full-Auto defaults (0.06975ms)
✔ legacy two-gate project config keeps explicit values and defaults PR review to auto (0.05625ms)
✔ legacy parent metadata survives session round trips without changing gate values (1.258125ms)
✔ binding source contains no legacy first-bind auto-mode prompt (0.251833ms)
✔ reset clears all three overrides and returns to Full-Auto defaults (0.139416ms)
✔ case 6: two session IDs do not see each other's overrides (0.131208ms)
✔ case 7: sweepOrphans deletes files older than maxAgeMs and leaves younger ones (0.183542ms)
✔ fresh and legacy session files hydrate the third nullable override (0.11625ms)
✔ manual and auto choices update one gate additively (0.469875ms)
✔ precedence: session override takes precedence over project config (0.065708ms)
✔ Review handoff honors the session final-task override over project policy (0.077875ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 106.01025

```

### Iteration verification and unchanged boundaries

Ran:

```bash
./node_modules/.bin/prettier --write scripts/task-tracker/verbs/deliver.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
git diff --check
git diff --exit-code afaccfdd9d908818f30b32e2802404ca1deec232 -- scripts/task-tracker/lib/delivery-preflight.mjs scripts/task-tracker/lib/delivery-verification.mjs scripts/task-tracker/lib/manual-code-review.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs
```

All exited 0. Diff commands produced no output. The iteration verifier completed with:

```text
verify-develop: iteration checks passed
```

Captured affected-test output: .superpowers/sdd/task-3-final-review-iteration.log. Expected fixture diagnostics were present, but all reported affected-test commands and the overall verifier exited 0.

### Commit and self-review

New commit: a18a2d3c698db1ace3e98e9282b910ae6921ac0d — [#1574] Enforce manual review before historical reconstruction.

Exact output:

```text
[codex/defect-1574-historical-intent a18a2d3c] [#1574] Enforce manual review before historical reconstruction
 3 files changed, 150 insertions(+), 53 deletions(-)
```

Post-commit git status --short and git diff --check produced no output. No amend, push, merge, rebase, npx aitm, GitHub write, or lifecycle mutation occurred.

Self-review: read the complete three-file diff. The extraction preserves prior current-head enabled/disabled behavior, reviewer/evidence resolution order, policy refusal categories, CI-before-request ordering, and open-PR request outputs. The shared helper is read-only. All reconstruction paths, including already-delivered retries, evaluate manual approval using the accepted historical SHA before writes. Ordinary prior-intent historical recovery remains unchanged. The extra-intent-key test directly pins the existing closed schema. No remaining concerns from this review wave.

---

## Final verification line-cap fix

Status: DONE. Resolved the controller's final-verification structural failure without changing production behavior or removing any test cases.

### RED

Reproduced the controller's exact failure at a18a2d3c698db1ace3e98e9282b910ae6921ac0d:

```bash
npm run lint:line-cap
```

Exit 1. Exact output:

```text
> @kburson/ai-task-manager@1.0.0 lint:line-cap
> node scripts/tests/tools/audit-line-cap.mjs

audit-line-cap: 1 file(s) exceed 800-line code-LOC limit:
  1102 code lines  scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
```

### Change and preservation checks

Moved the #1574 reconstruction, retry, provenance, and manual-review block plus its adjacent no-intent/external-intent compatibility refusal cases into scripts/tests/unit/task-tracker/verbs/deliver-historical-reconstruction.test.mjs. The new file carries both #1574 and #939 story tags and reuses the exported shared deliver-test-harness.mjs helpers. Removed the now-unused SERVER_NOW import from the original file.

A read-only node assertion compared the relocated block to its exact prior committed text from git show a18a2d3c:scripts/tests/unit/task-tracker/verbs/deliver.test.mjs. Output:

```text
Relocated test block is byte-identical to the prior committed block.
```

Final code-LOC counts: original deliver.test.mjs is 750; new deliver-historical-reconstruction.test.mjs is 368. Both are below the 800 hard cap. The original retains a non-failing advisory above the 400 soft threshold.

Only two test entrypoints changed. git diff --exit-code a18a2d3c -- scripts/task-tracker produced no output and exited 0, confirming no production-source changes.

### GREEN: line cap and all 179 tests

After relocation:

```bash
npm run lint:line-cap
```

Exit 0:

```text
audit-line-cap: all test files within 800-line code-LOC limit
```

Formatted only the two test files:

```bash
./node_modules/.bin/prettier --write scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/verbs/deliver-historical-reconstruction.test.mjs
```

Exit 0.

Exact focused command including the relocated entrypoint and every prior #1574 focused/regression suite:

```bash
node --test scripts/tests/unit/task-tracker/verbs/deliver-historical-reconstruction.test.mjs scripts/tests/unit/task-tracker/verbs/deliver.test.mjs scripts/tests/unit/task-tracker/core/full-auto-close-doctrine.test.mjs scripts/tests/unit/task-tracker/lib/manual-code-review-delivery.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation-regression.test.mjs scripts/tests/unit/task-tracker/lib/delivery-method-reconciliation.test.mjs scripts/tests/unit/task-tracker/lib/delivery-verification-attribution.test.mjs
```

Final run after removing the unused import exited 0:

```text
ℹ tests 179
ℹ suites 0
ℹ pass 179
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 484.180458
```

Full focused output: .superpowers/sdd/task-3-line-cap-focused.log. The count exactly matches the prior 179-test run, with no cases weakened or removed.

### Canonical discovery and structural audits

All four explicitly requested commands exited 0:

```bash
npm run lint:test-layout
npm run lint:test-entrypoint-imports
npm run lint:story-tags
npm run lint:test-reach
```

Exact result lines:

```text
audit-test-layout: all 1053 test files declare a canonical scripts/tests/<unit|integration|slow>/ lane.
audit-test-entrypoint-imports: no discovered test entrypoint imports among 1053 files.
audit-story-tags: all 1053 test files carry a @story tag.
lint:test-reach — 1053 test file(s) scanned, 32 baselined offender(s), 0 new
```

The new entrypoint is discovered canonically, does not import another test entrypoint, carries story ownership, and exercises repository source via the shared harness.

### Full lint and diff checks

```bash
npm run lint
git diff --check
```

Both exited 0. Full lint passed JavaScript, Markdown, spelling, temporary-file checks, fleet sandbox, test layout, entrypoint imports, story tags, code line cap, test reach, and document anchors. Final output included:

```text
audit-line-cap: all test files within 800-line code-LOC limit
audit-line-cap: review 750-line feature file above soft 400: scripts/tests/unit/task-tracker/verbs/deliver.test.mjs
lint:test-reach — 1053 test file(s) scanned, 32 baselined offender(s), 0 new
lint:doc-anchors — 38 anchor(s) across 3 doc(s) clean
```

Captured full-lint stage output: .superpowers/sdd/task-3-line-cap-lint.log. Existing soft-limit advisories and the 32 baselined test-reach entries are non-failing; no new test-reach offender exists. git diff --check produced no output before and after commit.

### Commit and self-review

New commit: 75b282bdfc9724e44501dfe62f97cc4ae276dc68 — [#1574] Split historical reconstruction tests below line cap.

Exact output:

```text
[codex/defect-1574-historical-intent 75b282bd] [#1574] Split historical reconstruction tests below line cap
 2 files changed, 398 insertions(+), 377 deletions(-)
 create mode 100644 scripts/tests/unit/task-tracker/verbs/deliver-historical-reconstruction.test.mjs
```

Post-commit git status --short and git diff --check produced no output.

Self-review confirmed byte-identical relocated cases, shared harness reuse, preserved story tags, unchanged production files, unchanged total focused test count, canonical discovery, and all requested lint gates passing. No remaining line-cap concerns. No amend, npx aitm, GitHub mutation, push, merge, rebase, or lifecycle mutation occurred.
