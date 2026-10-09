# Issue #18: Claude partial-runtime identity implementation plan

## Goal

Allow a Claude Code process with a genuine runtime session ID but no reliable runtime model metadata to participate in review by combining that session with explicitly configured Claude model metadata. Preserve truthful provenance, fail closed without a runtime session, and use the same identity resolution path across the lifecycle.

## Invariants

- Configuration never provides or substitutes a Claude session ID.
- Complete runtime identity takes precedence and remains `identity_source: runtime`.
- Partial runtime plus configured model metadata is `identity_source: declared`.
- The participant fingerprint remains derived from provider and runtime session; configured model changes retain that fingerprint and use the existing identity-change event semantics.
- No provider polling, model guessing, Claude hook installation, or status-line ownership is added.

## Implementation

### 1. Lock identity semantics with unit tests

Modify `test/unit/identity.test.mjs` before production code.

- Prove complete Claude runtime identity is unchanged.
- Prove a runtime session plus declared model ID/display resolves.
- Prove missing runtime session fails even when configuration is complete.
- Prove missing model configuration gives actionable recovery.
- Prove complete runtime metadata wins over configured metadata.
- Prove model changes for one session change participant identity.

Run: `node --test test/unit/identity.test.mjs` and confirm new tests fail for the expected reason.

### 2. Separate runtime and declared inputs

Modify `src/cli/run.mjs`, `src/identity/registry.mjs`, and `src/identity/claude.mjs`.

- Replace the current config-to-runtime merge with a distinct declared-model input.
- Let the Claude adapter compose only the permitted mixed identity.
- Preserve provider/host validation and existing participant fingerprinting.
- Return precise `APR_IDENTITY_REQUIRED` recovery details for the partial Claude case.
- Ensure doctor, start, join, submit, finalize, recover, and abandon obtain identity through the same configured-context builder.

Run the focused unit suite until green.

### 3. Prove lifecycle behavior end to end

Add `test/integration/claude-identity.test.mjs` and extend existing setup/doctor coverage where appropriate.

- Configure Claude model metadata in a temporary project.
- Inject only a genuine Claude runtime session into command I/O.
- Verify doctor explains the configured recovery when metadata is absent.
- Verify start/join and repeated submissions retain the expected participant.
- Verify terminal and recovery operations resolve the same identity.
- Verify foreign Claude settings, hooks, and status-line configuration remain byte-for-byte owned by the user.

Run: `node --test test/integration/claude-identity.test.mjs test/integration/setup-doctor.test.mjs test/integration/submit.test.mjs`.

### 4. Document the supported path

Update `README.md` and `src/cli/help-data.mjs` with:

- the exact `hosts.claude.identity.model_id` and `model_display` configuration keys;
- the runtime-session requirement;
- source semantics for mixed identity;
- an explicit statement that setup does not install or take over Claude hooks/status lines.

Run the documentation/help tests selected by the repository suite.

### 5. Verify and deliver

- Run targeted tests after each phase.
- Run `npm test` and `npm run lint` (plus any repository format/check script exposed by `package.json`).
- Stamp each governed acceptance criterion only from its declared passing verifier.
- Rebase the clean issue branch on current `origin/trunk`, rerun verification, push, open a `Refs #18` pull request, wait for exact-SHA hosted checks, and integrate only through the configured provider action.
- Record the exact `origin/trunk` delivery receipt and close through AITM.

## Estimate

Size M, 8 hours. The change is narrowly scoped, but identity provenance and lifecycle consistency require both unit and integration coverage.
