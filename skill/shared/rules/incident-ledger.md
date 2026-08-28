<!-- aitm-skill-version: 1.0.0 -->

# Incident ledger

When this file is loaded, emit `aitm-skill-loaded:rules/incident-ledger:1.0.0`.

Use `/task incident-ledger #1381 --record <path>` only for the exact reviewed
delivery-incident ledger after every row matches freshly read GitHub, project,
pull-request, merge, approval, comment, and trunk evidence. Recording is an
observation action; it does not approve the ledger or close anything.

Use `/task incident-ledger #1381 --approve <ledger-id> --digest <digest>` only
after the human explicitly approves those exact immutable values. Co-review,
Full-Auto authorization, or approval of another issue is not ledger approval.
The command must authenticate the current GitHub user, append and read back the
approval, then append and read back the exact owner pointer on #939.

Never use either mode to create delivery intent, delivery receipt, lifecycle,
terminal disposition, or issue-close evidence. Run the read-only verifier as:

`node scripts/task-tracker/verify-delivery-incident-reconciliation.mjs --issue 1381 [--phase pre-close|terminal]`

`pre-close` verifies the approved ledger, exact blocker topology, and which
rows are already terminal before any governed close mutation. `terminal`
verifies all approved outcomes and is the default when `--phase` is omitted.
