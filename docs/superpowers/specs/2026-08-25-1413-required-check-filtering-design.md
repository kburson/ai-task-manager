# Required Check Filtering Design

## Problem

Governed delivery currently labels every entry in a pull request's
`statusCheckRollup` as required. GitHub retains optional and historical check
runs, so an optional skipped job can produce
`delivery-preflight:required-check-not-green` even when the repository's true
required check is green.

## Scope

- Ask GitHub for the pull request's required checks rather than infer required
  status from the complete rollup.
- Re-read the pull request head after collecting checks and attach that live SHA
  to the check snapshot. Existing preflight exact-head validation rejects drift.
- Preserve fail-closed behavior for unreadable, missing, pending, failed, or
  wrong-head required checks.
- Add focused adapter regression tests for optional skipped history and pending
  required checks.

## Design

`createDefaultDeliverDeps().fetchRequiredChecks()` will call:

```text
gh pr checks <pr> -R <repo> --required --json name,state
```

Exit code `8` means checks are pending; its JSON stdout remains usable and is
normalized as a non-green required-check snapshot. Other command errors remain
hard failures. After the check query, the adapter re-reads `headRefOid`. The
existing preflight compares that SHA to local HEAD, remote PR head, Test receipt,
and accepted review evidence.

The adapter will no longer use the complete `statusCheckRollup` as its required
set. Validation remains unchanged: only a named check with `COMPLETED` status,
`SUCCESS` conclusion, and the exact expected head is green.

## Verification

The focused test demonstrates that a required success is returned alone even
when the PR snapshot contains optional skipped and historical failed checks. A
second case proves pending required-check output remains non-green instead of
being discarded or promoted to success.

No provider action, merge rule, CI workflow, or successor defect is introduced.
