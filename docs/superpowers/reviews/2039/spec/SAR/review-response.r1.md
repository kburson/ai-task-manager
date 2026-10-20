# #2039 specification SAR — round 1

- Reviewer: the persistent native SAR agent, requested model `gpt-6-astra`, reasoning effort `high`.
- Reviewed input: [spec.r0.md](spec.r0.md), SHA256 `b36b22694346004a0c2ae659f9210c24d324121210009d76b4a7e8160315d3eb`.
- Initial draft commit supplied by the parent: `c7d6929b7`. Source baseline stated by the draft: `a69f054c80394a9650469da6a7033791df19cd7f`.
- Outcome: revise; eight actionable findings, all addressed in [spec.r1.md](spec.r1.md), SHA256 `6488fa3df4ac81a8633a7b061c32988a3e694ec7f48ed6f5bb8a7eceb55ed7ff`.

## Review basis

Read the complete initial specification, the native #1908 SAR record, and the first-draft/SAR guidance in `skill/shared/rules/plan-mode-backlog.md`. Read live [issue #2039](https://github.com/kburson/ai-task-manager/issues/2039) using `gh issue view 2039 --repo kburson/ai-task-manager --json number,title,body,url`. The issue retained all six unchecked acceptance criteria and the explicit no-implementation/no-state-advancement boundary. This was the only review-purpose GitHub read; no quota polling or costly reproduction ran.

Source inspection covered the actual CLI/preflight and activity/source hooks, decomposition authority/publication and adaptive adapters, versioned/body mutation helpers, runtime storage and issue/record claims, rubric refresh/model, forecast validation/model and Plan approval routing. Findings below are source-grounded design corrections, not implementation defect fixes. The draft's two injected probes were retained as prior author evidence; this reviewer did not rerun or relabel them as newly performed probes.

## F1 — Resolve mode at hook dispatch and define compound-command outcomes

**Severity:** important.

**Finding:** The draft says to resolve mode before hooks, but the hooks are separate processes that execute before the CLI. A resolver inside the runtime/verb cannot prevent `collectHookDecompositionSnapshot` from issuing its broad query. The draft also permits target governance calls while giving zero-operation calculation ceilings without clearly distinguishing whole-command reporting or disabled/unavailable exit behavior. A rubric-mode blanket exception would weaken unrelated guards.

**Evidence:** `scripts/task-tracker/activity-guard.mjs` performs decomposition admission before normal activity allowances; `source-edit-gate.mjs` likewise collects decomposition signals before artifact/chore/cache allowances. `lib/decomposition-hook-authority.mjs:collectHookDecompositionSnapshot` constructs a query with viewer, target, comments and subissues. `task-tracker.mjs` invokes shared preflight; `lib/verb-preflight.mjs:runPreflight` checks live ownership/state and may use the optional paginated timeline actor lookup. `config.mjs` defaults the rubric ID to `0`; `verbs/plan-approve.mjs` distinguishes adaptive configuration from the existing manual route.

**Disposition:** addressed. Require the shared pure resolver/classifier independently at each hook and CLI dispatch surface, scoped to recognized estimation operations. Keep unrelated edit/commit/start/state guards intact. Distinguish effective default zero from invalid configuration and require safe integers. Define disabled/unavailable estimate-request non-success results and separate outcomes for independently authorized compound work. Include governance metadata and all hook/CLI calls in whole-command budgets, bound target membership, and refuse state drift with actor Unknown rather than unbounded optional actor discovery. Enabled/unavailable cannot masquerade as disabled to evade forecast requirements.

## F2 — Local rubric and evidence need a durable, publishable provenance contract

**Severity:** important.

**Finding:** A generic versioned bundle does not define how locally refreshed rubric IDs, record lineage and input hashes survive publication. Reusing forecast v2 without a provenance decision would either fail strict schema validation, invent cloud-backed identity or leave the new local evidence uninterpretable.

**Evidence:** `lib/estimation/rubric-refresh.mjs` validates complete predecessor/supersession lineage, requires a single root, rejects duplicate latest versions and currently obtains new rubric records through `writeRubric`. `forecast-model.mjs` requires `rubric.recordId`; `forecast-record.mjs` enforces exact v1/v2 root keys and a non-null valid rubric record ID. The runtime currently writes refreshed rubrics to the configured cloud issue.

**Disposition:** addressed. Specify `aitm.local-estimation-evidence/v1`, canonical hash versioning, immutable payloads, identities, exact source fields, lineage validation, Unknown preservation and origin distinctions. Derived local rubrics receive durable valid record IDs without fake comment identity. New local forecasts require a successor schema carrying an immutable provenance snapshot and manifest digest; legacy v1/v2 reads remain supported. New-write validators and approval/exit/outcome consumers must change together. Full local inputs remain retained for replay; no missing-input cloud hydration.

## F3 — Correlate fresh publication inputs with the calculation inputs

**Severity:** important.

**Finding:** Mandatory body-baseline equality does not by itself establish that a retained Refine record, selected plan authority or frozen forecast still matches the local calculation. A newly seeded current body baseline could coexist with a proposal derived from obsolete inputs.

**Evidence:** `executeAdaptivePlanEstimate` reads Refine before rubric/comparables and passes the computed envelope to authority publication. `applyPlanEstimateAuthority` then reads current lifecycle/frozen/forecast projections. The initial draft specifies validation of local plan/input hashes and fresh publication guards separately, but does not bind them with an equality check.

**Disposition:** addressed. Require fresh target observations to agree with the retained Refine source, selected plan authority, frozen forecast and relevant policy used in the input digest. Drift preserves the proposal and returns input drift; it cannot silently hydrate/recompute from cloud data. Explicit local reconciliation and recalculation creates a new input digest.

## F4 — Persist prepared intent before validation and commit baseline/journal consistently

**Severity:** important.

**Finding:** The original numbered protocol validates a durable intent before deriving it and only persists dispatch intent after prewrite validation. A failed read/conflict could therefore lose the proposed mutation that the owner requires retaining. Independently persisting a baseline and confirmation can also expose inconsistent generations after a crash despite each file using atomic replacement.

**Evidence:** `versioned-issue-write.mjs` currently fetches/mutates/pushes/verifies without a mandatory persistent baseline. `issue-body-mutate.mjs` provides fresh-base and invariant callbacks but no journal transaction. `runtime-storage.mjs` supplies identity/root machinery, not a multi-file commit primitive. No existing guarantee makes two separate renames atomic.

**Disposition:** addressed. Define prepared/dispatching/confirmed/conflict/not-observed/uncertain states, candidate persistence before validation, restart treatment of dispatching as uncertain, and one atomic per-issue generation or a recoverable write-ahead commit record. Require supported file/directory durability before acknowledging success, preserve the last valid generation, and test every crash transition. Guard work precedes the final body comparison, preventing asynchronous guard I/O from silently making that comparison obsolete.

## F5 — Compose the new claim with existing issue and record claims

**Severity:** important.

**Finding:** A new cross-process claim without nesting/acquisition rules risks self-deadlock or false exclusion of legitimate nested publication. A per-worktree store would also fail the promised sibling-worktree serialization.

**Evidence:** `issue-mutator-lock.mjs` implements async-context reentrancy and separate inherited-process semantics. `lib/estimation/record-claim.mjs:withCrossProcessRecordClaim` wraps the main-worktree issue lock in a process logical-record claim. Merely adding another lock at `mutateIssueBody` is not a proved composition.

**Disposition:** addressed. Anchor to shared canonical repository identity; use existing issue/record ownership as the outer boundary, reuse a validated held claim in nested writers, and require a single tested acquisition order if another store lock is necessary. Explicitly cover nested calls, same-process siblings and spawned children. Keep unresolved intents and their referenced payloads outside garbage collection.

## F6 — Cover ambiguous non-body writes and delayed completion honestly

**Severity:** important.

**Finding:** The initial intent contract is body-centric even though the publisher writes comments/project fields. A project/comment write can succeed while the issue body drifts, and one recovery read showing the baseline cannot prove a timed-out request will never land. An operation ID alone is not provider idempotency.

**Evidence:** `estimate-writer-publication.mjs` composes multiple resource adapters, persists before-value/publication markers and checks effect digests. `decomposition-adaptive-writer.mjs` includes separately observed projection effects. The GitHub adapters issue ordinary writes, with no demonstrated server-side atomic version comparison or idempotency token. The original draft already correctly discloses the body compare/write race; this finding extends that honesty to recovery and separate resources.

**Disposition:** addressed. Persist per-resource before/proposed/ownership/predecessor intent. Verify the target body as part of non-body read-back, count that observation, and stop later effects/convergence claims on drift while retaining landed outcomes. Treat failed verification as potentially landed. Never automatically replay an ambiguous dispatch, including after an unchanged-baseline recovery read. Explicit retry requires fresh authority and an acknowledgment that a delayed request may still land. Preserve the disclosed non-atomic race and require owner acceptance before implementation; this SAR does not provide that acceptance.

## F7 — Make operation ceilings independent of the traffic under test

**Severity:** important.

**Finding:** Defining `M` as every observed effect lets an implementation increase its budget by generating more marker/journal writes. The fixed six operations and page surcharge were not tied to the complete hook/CLI tree, recovery or repeated paginated observations. An opaque `gh` launch could also conceal multiple HTTP calls.

**Evidence:** `estimate-writer-publication.mjs:executeEstimateWriter` adds before-value and authority/publication effects to the business manifest and repeatedly checkpoints adapters. Its predecessor path can recollect full authority per effect. `runtime-adapter.mjs` can fetch project field options during writes. Hook/preflight calls occur outside the calculator. Target comment readers page complete connections, including comments not owned by estimation.

**Disposition:** addressed. Freeze reviewed effect manifests independently of observed traffic and assert exact allowed write counts. Count setup/hooks/governance/final convergence once per invocation; allow one separately charged recovery observation per attempted effect. Include every actual continuation and repeated page in a total 10-page/4-MiB envelope, while distinguishing first pages from `P`. Bound response streams, prohibit hidden pagination/retry from masquerading as one operation, retain unknown underlying coverage, and require exact canonical fixture counts before coding. Specify that target comment enumeration establishes owned-record completeness only and cannot become calibration history.

## F8 — Specify baseline adoption, missing-marker and overflow behavior

**Severity:** moderate.

**Finding:** “Normal reads may seed” needs a precise boundary so an ordinary refresh cannot silently replace a pending intent's baseline. Strict existing-version parsing also does not alone prevent an unsafe next version, and legacy missing-marker behavior needs an explicit migration disposition.

**Evidence:** `body-version.mjs` has permissive missing-marker parsing; `versioned-issue-write.mjs` stamps the next numeric version. The old implementation allows absent expected versions. The owner explicitly requires refusal on missing/unverifiable authority.

**Disposition:** addressed. Permit initial seeding only from a complete strictly versioned observation before a new intent; preserve existing baselines behind pending/prepared intents. Refuse safe-integer overflow. Missing/invalid cloud markers remain unavailable, with no automatic marker repair or fabricated version-zero migration. Legacy parsing for unaffected readers remains available.

## Preserved requirements and limits

No finding authorizes a backlog/corpus scan, quota check, original AIPR-path access, implementation, issue write or lifecycle approval. All original incident paths and reported counts remain. The specification continues to preserve manual estimates, native ownership/lifecycle/decomposition/proof/reviewed-scope guards, timing and Unknown semantics. The owner decision about the residual external-writer race remains explicit and unaccepted.

Round 1 performed source/document inspection and targeted Prettier formatting only. Product tests, transport fixtures and production improvements remain later implementation evidence. The attempted lightweight memory search was refused by the scope hook; no memory file contents were read or used. No Git commands were run by the reviewer.
