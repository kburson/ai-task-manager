### Scope and observed failures

This bounded repair implements the user-approved three-part correction to manual Claude XPR startup. Issue #102 is the affected consumer; its design and review state stay untouched in the original e7c0 worktree. The defect branch starts from origin/trunk and contains only review-tool repair and evidence. The real launch reached Claude Opus 5 successfully, so authentication is not the failure.

### Story Intent

- **Beneficiary:** Peer-review operator using Codex as author and Claude as reviewer.
- **Capability:** Start a manual XPR and reach an attributable reviewer decision with the selected transport and genuine provider identity evidence.
- **Need:** Broker startup dispatches an unsupported manual-worker launch, CLI launch omits the stream observation required by join, and inherited resume settings contradict manual participation.
- **Value or failure prevented:** Independent reviews can proceed without repeated failed launches, manually constructed permissions, or weakened identity validation.

### Source analysis and implementation

1. In `src/startup/runtime.mjs`, keep runtime pinning, authority creation, and broker registration. Once the selected transport is manual, persist the existing manual startup journal state and return the sealed invitation. Do not request a broker launch for the recovery-only worker. Preserve automatic-required dispatch and refusal behavior. Existing tests that intentionally model broker launching must select an automatic transport rather than depending on the incorrect manual dispatch.
2. In `src/cli/run.mjs`, wire actual launch-reviewer execution through `createClaudeStreamRecorder` and `createClaudeStreamingExec` from `src/providers/claude-stream.mjs`, using `claudeJoinCommand` and the exact review ID. Capture real provider init/tool-use events before executing join. Keep the public runner, outcome classifier, exact Bash/Edit permissions, private session state, and same-session resume unchanged. Avoid hand-written observations and keep injection seams limited to the existing process boundary. Actual model metadata must reflect the requested/observed Claude model; inherited author identity stays removed.
3. In the CLI join capability selection, derive manual capability when the sealed review explicitly selected manual, even when configuration includes an official resume command. Do not disable resume for reviews that selected resume-only, and retain declared-identity rejection for non-manual modes. Apply consistent startup capability selection where necessary.
4. Add `test/integration/manual-xpr-startup.test.mjs` for the real startup/CLI paths. First reproduce all three failures. Tests must not inject pre-created stream observations or force the transport capability being tested. Use a provider-process fixture for deterministic stream events and actual protocol join; retain explicit identity mismatch, malformed stream, and resume coverage in the existing suites. Update narrowly affected fixtures where their incorrect manual-launch assumption is exposed.
5. Run a real manual review with the installed repaired package, a native helper matched to this Node version, Codex as author, and Claude Opus 5 at medium effort. Only an event-authoritative reviewer decision proves success. Record a privacy-safe durable evidence document with artifact/response hashes and role/model facts; never commit raw provider handles or scratch authority. Add `scripts/verify-manual-xpr-evidence.mjs` to validate the committed evidence and linked durable response content, refusing missing or inconsistent evidence. Repeat or repair until the true live path succeeds.

### Verification strategy

Run the new regression file before implementation and confirm expected failures. Then run targeted startup/CLI/identity/stream tests. Complete unit/golden, integration/MCP/smoke, packaging, lint, and formatting verification at the final committed shape. The governed Test boundary owns the final exact-SHA verification receipt. The live proof is separate from deterministic fixtures and must be labeled accordingly.

### Risks and mitigations

The CLI and provider adapter currently duplicate launch wiring; reuse the existing recorder/streaming executor rather than inventing another observation format. Stream capture must arrive before join and use the exact command and session. Structured provider errors must still produce bounded diagnostics, and successful process exit alone is never acceptance. Manual mode must not silently grant automatic capability. Existing automatic broker behavior is protected by its regression tests. Native addon availability and installed-package layout are environment prerequisites, not reasons to weaken package runtime checks. Production provider access may fail independently of code; preserve receipts and report a genuine blocker if it occurs.

### Dependency map

Depends on: none; the required provider recorder and identity protocol already exist on trunk.
Blocks: #102 design XPR startup.
Sibling sub-issues: none; the three failures form one manual-start-to-submission integration path.

### Full-Auto Plan-Approval Audit — #106

The user explicitly requested filing this defect and delivering it to Done. Scope remains the three diagnosed startup defects and their verification. Stakeholder: real review operator. Capability: manual review reaches an attributable submission. Need: reproduced startup/join refusals. Counterfactual value: reviews no longer stall or demand unsafe environment/permission surgery. Source grounding: current production startup, worker factory, launcher, identity and transport code plus observed errors. Sibling distinctness: #102 is installation policy design and #91 addressed later-turn declared identity, rather than this initial manual-start path. Standalone readability: the issue story and reproduction describe actor, failure and expected outcome without a linked plan. All seven semantic questions pass. No workflow exception or fabricated evidence is requested.
