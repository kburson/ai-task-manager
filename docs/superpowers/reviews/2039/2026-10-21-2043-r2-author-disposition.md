# #2043 R2 author disposition

Fresh GPT-6.1 Sol / medium reviewed exact range e5bbac14bd50ea6bfbfd3389e7a06e7e6cba511c to c4fa044b6cb27130966ab759be44793e6c119557. The full unchanged raw report is committed in `2026-10-21-2043-reviewer-r2-review.md`.

## Finding

**Inherited native lock repository scope — accepted, P2, repaired.** The issue lock's reentrancy token is keyed by issue number. The adapter checked the active owner object and session but omitted the shared repository root, unlike the accepted writer-registry predecessor. Two disposable native repositories reproduced incorrect staging for both body and title while another native operation occupied the correct physical lock. Both new regressions failed with missing expected rejection before the repair. The adapter now retains the resolved runtime root and requires the owner root to match its mainRoot on every existing revalidation around awaited work. A genuine linked-worktree nesting control passed before the repair and remains covered. Refusal precedes the callback and persistence; the complete generation stays unchanged.

## Every declined boundary

1. **Public legacy writer activation and CLI migration — accepted boundary.** Pinned Task 10 leaves these to integration. Explicit unpublished results remain; later callers must prove they never treat staging as publication.
2. **Comment adoption, ownership, intents and mutation — accepted boundary.** #2058 owns these. Comment keys remain refused; that story must validate native ownership before staging foreign resources.
3. **Operation capabilities and composite retention — accepted boundary.** #2059 owns issuance and validation. Unsupported new capabilities and changed inherited references remain refused; true no-ops preserve references. Later integration must prove scoped authority without broad bypasses.
4. **Timing ingestion, arithmetic, projection and publication — accepted boundary.** Existing timing bytes are preserved. Owning stories must establish event, Unknown and cursor semantics; staging does not establish completeness.
5. **Publication transport, saga effects, reconciliation and receipts — accepted boundary.** Later slices own these external effects. Offline local success grants no provider publication or atomicity authority.
6. **Confirmed retained batch settlement — accepted conservative refusal.** Native retention protects these journals. Their owning settlement path must enable subsequent edits without losing evidence; this adapter does not clear them.
7. **Remote assignment changes — accepted boundary.** Acquisition and transitions own cloud freshness. Offline edits use persistent ownership; eventual flush must refuse stale assignment.
8. **Read-only issue observation classification — accepted native contract.** Persistent writer ownership and exact issue identity authorize local edits while immutable observation bytes remain untouched. This does not authorize comment adoption.
9. **Existing pure-validator semantics — accepted bounded reuse.** Marker, checkbox, proof and reviewed-scope validators remain unchanged. Capability and integration owners must prove current authority; known semantics are not waived.
10. **Reserved payload migration — accepted fail-closed contract.** Unsupported issue-update envelopes refuse. Unrelated-schema JSON remains body content; any migration requires explicit supported encoding.
11. **Hostile injected stores — accepted trust boundary.** Arbitrary dependency code can perform arbitrary effects. Native persistence and adapter readback are tested; injected behavior cannot establish cloud proof.
12. **Same-user filesystem edits and physical lock tampering — accepted limitation.** These remain outside cooperating APIs. The accepted R2 defect uses ordinary native APIs, so it is repaired rather than excused under this limitation.
13. **Thrown internal-error impersonation — accepted diagnostic boundary.** Preserved STORY prefixes remain failure diagnostics and grant no success or authority. Unusual thrown values retain typed failure handling.
14. **Workflow authorization, audit truth, exact-head CI and release acceptance — remaining external gates.** This review establishes local technical findings only. Parent integration, independent R3, exact-head CI, native Test and same-target orchestrator acceptance remain required. No Review, Close, delivery or release permission follows.

## Worker authority and verification

Fresh worker SID 01a161d5-aeea-7671-9c0c-0d7e0bbab407 resumed only in app-managed worktree `/Users/kpburson/.codex/worktrees/2039-wave8-2043/ai-task-manager`, detached HEAD c4fa044b6cb27130966ab759be44793e6c119557. npm ci and link:self repaired missing local dependencies before Start. Native Start requested and accepted confirm-relocation without an exception. Native binding, occupancy and actor agree on #2043, Develop, HEAD and generation 9449ea5b-72d9-43a5-9157-fd0bf9352f13; timer active since 2026-10-22T04:20:33.872Z. Live singleton assignment is kburson, and the existing full-auto Plan approval and deep dive remain intact. No Plan redo, branch rename, sibling edit or public caller activation occurred.

All native commands retain AITM_GRAPHQL_USAGE=1 and TT_FULL_AUTO=1. Initial missing-state capture warnings and collector soft caps are preserved without modification. Dependency installation reported 14 audit vulnerabilities and blocked Puppeteer postinstall; no audit repair or script-policy change was made. Raw RED/GREEN and verification logs remain in the ignored per-plan workspace. No exact-head CI or native Test admission is claimed here.
