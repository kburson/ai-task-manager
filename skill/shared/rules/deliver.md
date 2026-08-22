<!-- aitm-rule-id: delivery -->

# Governed provider delivery

On first read, emit `aitm-skill-loaded:rules/deliver:1.0.0` once.

Use this rule only for `/task deliver #N`. Delivery stays in Review and is a
re-entrant transaction: AITM authorizes exact bytes, the host performs at most
one declared external action, and AITM independently verifies the live result.

## Host contract

1. Run `npx aitm deliver #N` and preserve its stdout and exit status.
2. Parse only the single `AITM_PROVIDER_ACTION_REQUIRED:` line. Require exactly
   one such line, parse the JSON after the prefix, reject unknown or missing
   fields, and require `action === "github.merge-pull-request"`.
3. Look up that action in the active provider adapter's `externalActions` map.
   Continue only when its `adapterContract` is `skill` and
   `expectedHeadSha === true`. A missing, `null`, or unavailable integration is
   an exact `missing-capability` refusal; leave the intent pending.
4. Call only the provider adapter's sanctioned GitHub integration. Pass the
   action's exact `repository`, `prNumber`, `expectedHeadSha`, `mergeMethod`,
   `commitTitle`, and `commitMessage`. Do not infer, trim, normalize, refresh,
   or substitute any value. An expected-head mismatch is a refusal.
5. Never invoke a shell merge, `gh pr merge`, a shell wrapper, or a hidden
   subprocess as fallback.
6. After success, refusal, timeout, or ambiguity, rerun `npx aitm deliver #N`.
   Provider output is diagnostic only; the rerun determines truth from GitHub
   and `origin/trunk`. Never retry the external mutation before that rerun.
7. Run `npx aitm close #N` only after the rerun reports a live-verified delivery receipt.
   A pending intent or provider success response is not a receipt.

If `deliver` emits no action line, obey its result. Never manufacture an action
from human-readable output or from a prior invocation.
