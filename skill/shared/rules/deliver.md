<!-- aitm-rule-id: delivery -->

# Governed provider delivery

On first read, emit `aitm-skill-loaded:rules/deliver:1.0.0` once.

Use this rule only for `/task deliver #N`. Delivery stays in Review and is a
re-entrant transaction: AITM authorizes exact bytes, the host performs at most
one declared external action, and AITM independently verifies the live result.

## Host contract

1. Run `npx aitm deliver #N` and preserve its stdout and exit status. A provider
   action is authorized only when both the exit status is exactly `20` and
   stdout contains exactly one `AITM_PROVIDER_ACTION_REQUIRED:` JSON line.
   Any other exit/output combination is invalid and must not invoke a provider.
   Rerun `deliver` once to reconcile live state; if the invalid combination
   repeats, fail closed and leave the intent pending.
2. Parse only the single `AITM_PROVIDER_ACTION_REQUIRED:` line and preserve all
   parsed string bytes. Require a plain JSON object with exactly these 12 keys:
   `action`, `baseRef`, `commitMessage`, `commitTitle`, `expectedHeadSha`,
   `headRef`, `intentId`, `issueNumber`, `mergeMethod`, `prNumber`, `repository`,
   and `schema`. Unknown keys, missing keys, arrays, and non-object values refuse
   the action before capability lookup.
3. Validate the exact action schema before invoking a provider:
   - `schema` is an integer exactly `1`.
   - `issueNumber` and `prNumber` are positive safe integers.
   - The remaining nine values are strings.
   - `action` is exactly `github.merge-pull-request`.
   - `intentId` is an uppercase canonical ULID; `repository` is `owner/name`;
     `expectedHeadSha` is 40 lowercase hexadecimal characters; `baseRef` and
     `headRef` are valid non-empty Git refs; and `mergeMethod` is exactly one of
     `merge`, `squash`, or `rebase`.
   - `commitTitle` and `commitMessage` are non-empty, and retain the issue, PR,
     and expected-head attribution required by the emitted action.
4. Look up that action in the active provider adapter's `externalActions` map.
   Continue only when its `adapterContract` is `skill` and
   `expectedHeadSha === true`. A missing, `null`, or unavailable integration is
   an exact `missing-capability` refusal; leave the intent pending.
5. Call only the provider adapter's sanctioned GitHub integration. Pass the
   action's exact `repository`, `prNumber`, `expectedHeadSha`, `mergeMethod`,
   `commitTitle`, and `commitMessage`. Do not infer, trim, normalize, refresh,
   or substitute any value. An expected-head mismatch is a refusal.
6. Never invoke a shell merge, `gh pr merge`, a shell wrapper, or a hidden
   subprocess as fallback.
7. After success, refusal, timeout, or ambiguity, rerun `npx aitm deliver #N`.
   Provider output is diagnostic only; the rerun determines truth from GitHub
   and `origin/trunk`. Never retry the external mutation before that rerun.
8. Run `npx aitm close #N` only after the rerun reports a live-verified delivery receipt.
   A pending intent or provider success response is not a receipt.

After the required reconciliation, a normal non-20 result with no action line
governs the next workflow step. Never manufacture an action from human-readable
output or from a prior invocation.
