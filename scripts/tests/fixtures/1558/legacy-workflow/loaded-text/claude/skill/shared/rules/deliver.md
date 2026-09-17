<!-- aitm-skill-version: 1.1.0 -->
<!-- aitm-rule-id: delivery -->

# Governed provider delivery

On first read, emit `aitm-skill-loaded:rules/deliver:1.1.0` once.

Use this rule only for `/task deliver #N`. Delivery stays in Review and is a
re-entrant transaction: AITM authorizes exact bytes, the host performs at most
one declared external action, and AITM independently verifies the live result.

## Host contract

For an enrolled v2 issue, delivery enters through the common protected-marker selector and installed pinned runtime. The designated authority host and complete resident-entry capability inventory must validate before intent or provider action. Legacy issues without the marker keep the v1 delivery path.

1. Run `npx aitm deliver #N` and preserve its stdout and exit status. Classify
   the result into exactly one envelope:
   - **Current-head provider-action envelope:** exit `20` with exactly one
     `AITM_PROVIDER_ACTION_REQUIRED:` JSON line. This is the only envelope that
     permits the remaining provider-action steps, and it authorizes at most one
     provider call.
   - **Non-action envelope:** non-`20` with zero action lines. This envelope never
     invokes a provider; obey the command's actual result. In particular, exit
     `0` with one `AITM_DELIVERY_RESULT:` whose status is `delivered` or
     `already-delivered` and whose receipt is present and live-verified may
     continue to `npx aitm close #N`. A stable refusal or other result stops at
     that result.
     An `AITM_DELIVERY_RESULT:` with `mode="historical-recovery"` is historical
     receipt recovery for an immutable accepted SHA. It never permits a provider
     call: preserve the result and continue only when its recovered receipt is
     live-verified. Cumulative inclusion on trunk is not a delivery receipt and
     must never be promoted into one.
     An already-merged current-head pull request may instead return
     `AITM_DELIVERY_RESULT:` with `mode="current-head"`, an external intent and
     receipt, and no action line. This is also a non-action envelope: never invoke
     a provider after receiving it.
   - **Mismatched envelope:** exit `20` with zero or multiple action lines, or
     non-`20` with one or multiple action lines. Never invoke a provider. Retry
     once by rerunning `deliver` to reconcile live state; if the envelope is
     still mismatched, fail closed and leave the intent pending.
2. Parse only the single `AITM_PROVIDER_ACTION_REQUIRED:` line and preserve all
   parsed string bytes. Require a plain JSON object with exactly these 12 keys:
   `action`, `baseRef`, `commitMessage`, `commitTitle`, `expectedHeadSha`,
   `headRef`, `intentId`, `issueNumber`, `mergeMethod`, `prNumber`, `repository`,
   and `schema`. Unknown keys, missing keys, arrays, and non-object values refuse
   the action before capability lookup.
   This action line is a current-head provider action only. It is never valid for
   `mode="historical-recovery"`.
3. Validate the exact action schema before invoking a provider:
   - `schema` is an integer exactly `1`.
   - `issueNumber` and `prNumber` are positive safe integers.
   - The remaining nine values are strings.
   - `action` is exactly `github.merge-pull-request`.
   - `intentId` matches `^[0-7][0-9A-HJKMNP-TV-Z]{25}$`.
   - `repository` matches exactly
     `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`.
   - `expectedHeadSha` matches `^[0-9a-f]{40}$`.
   - Each of `baseRef` and `headRef` is non-empty and equal its own `trim()`
     result; must not start or end with `/`; must not contain `//` or `..`; and
     must not contain `~`, `^`, `:`, `?`, `*`, `[`, `\`, or whitespace.
   - `mergeMethod` is exactly one of `merge`, `squash`, or `rebase`.
   - `commitTitle` is non-empty and starts with exactly
     `[#${issueNumber}]`.
   - `commitMessage` is non-empty and contains both exact tokens
     `PR #${prNumber}` and `${expectedHeadSha}`.
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
