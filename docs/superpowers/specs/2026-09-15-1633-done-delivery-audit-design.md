# Done Delivery Audit Design (#1633)

## Goal

Provide a reproducible, read-only audit of every issue whose authoritative AITM
Done marker falls within a frozen interval, proving whether its accepted work is
on trunk without confusing squash rewriting, issue closure, or local lifecycle
records with delivery authority.

## Population

The CLI scans all non-PR GitHub issues updated at or after the lookback instant
and selects those with exactly one valid `aitm-entered-done` marker between
`--since` and the frozen snapshot, inclusive. The report stores both instants and
the remote trunk head used as evidence. Verification regenerates the same closed
interval from the report metadata.

## Evidence model

For every selected issue the classifier records:

- issue number, title, and Done timestamp;
- issue kind and latest recorded source branch;
- accepted SHA from the terminal close transaction;
- valid AITM delivery intent/receipt or no-commit record;
- merged PR source head, target branch, method, and merge SHA;
- direct accepted-SHA ancestry and issue-attributed landed commits reachable from
  the frozen trunk head; and
- a governed recovery issue for every non-delivered result.

A merge/rebase may pass via accepted-SHA ancestry. A squash passes only when a
reachable attributed landed commit is associated with a merged PR to trunk whose
source head equals the accepted SHA, or an equivalent valid AITM receipt is
confirmed against live PR/trunk state. Child issues may use the root delivery
commit's explicit attribution token. Missing or contradictory evidence is never
promoted to Delivered.

## Classifications

- `verified`: authoritative code delivery to trunk is proven.
- `false-Done`: available accepted history is absent from trunk and no valid
  delivered rewrite exists.
- `indeterminate`: authority is missing, malformed, contradictory, or unavailable.
- `main-thread-exception`: accepted issue-attributed work was performed directly
  on configured trunk.
- `explicitly-local-only`: a valid issue-resident artifact delivery exists for an
  allowed non-epic no-commit kind.

Root epics cannot use `explicitly-local-only`; #1632 made their aggregate child
history a trunk-delivery obligation.

## Interfaces

`node scripts/maintenance/audit-done-delivery.mjs --since YYYY-MM-DD`
prints canonical Markdown using an explicit or current snapshot.

`node scripts/maintenance/audit-done-delivery.mjs --since YYYY-MM-DD \
  --verify-report PATH`
reads the snapshot and trunk head from `PATH`, regenerates the inventory, and
exits nonzero unless the bytes and recovery coverage match.

Runtime adapters use read-only `gh api`/`gh pr view` and git object/log queries.
Pure exported functions accept injected ports for deterministic tests.

## Recovery

The audit discovers recovery issues through
`aitm-delivery-audit-recovery audit="1633" issue="N"` markers. Rendering may show
missing recovery coverage, but `--verify-report` refuses while any `false-Done`
or `indeterminate` row lacks a unique governed recovery issue. The audit never
mutates affected issues or git state.

