# #1769 Paired lifecycle comparison design

## Problem and evidence

The frozen legacy CLI baseline executes 14 independent success and refusal
scenarios. The #1767 recertification executes 24 ordered events on one evolving
Plan-to-Done authority fixture. Their complete traffic totals are not directly
comparable. A probe that projected the old fixture through current Explain also
found a changed resume precondition: an explicit issue target can be ready when
the old implicit resume command refused. Other old cases lack the current
commit, worktree, and delivery evidence needed for an equivalent decision.

## Comparison contract

Keep both historical captures byte-for-byte and identify each by its digest.
Use the #1767 ordered lifecycle as the common event manifest. On the current
side, count its captured public CLI command, stdout and stderr verbatim, along
with separately identified receipt and explicit diagnostic traffic. On the
current side, a `--known` response counts as receipt output only when its
returned guidance is `not-modified`; expanded guidance counts as operational
stdout. On the legacy side, construct a **modeled projection** over that same
manifest: retain
the actual historical Markdown snapshots as static input and count every
projected command and returned text. Label each projected byte as modeled; it
must never be described as captured legacy execution or substituted for the
frozen 14-scenario baseline.

The manifest records transitions and external approval/merge as distinct
events. Both sides must use the same ordered event IDs and starting authority
digest. The report refuses missing, duplicated, reordered, or unaccounted
agent-visible events and shows captured and modeled totals separately. The
source capture bytes, scenario manifest digest, and transcript digest are
checked against the pinned #1767 capture before projecting either adapter. The
historical 14-case baseline remains a characterization and a negative control
for any attempted direct 14-versus-24 comparison.

The heavy-input appendix uses a captured v2 decision as a seed, then constructs
a schema-valid four-child, three-dependency, seven-refusal presentation. It
checks that four distinct child identifiers and three typed dependency
identifiers survive serialization and calibrates routine and diagnostic text
with the pinned tokenizer. This is a protocol
sensitivity sample; the combination is not represented as an observed guard
outcome or a universal maximum. The older candidate-model heavy case remains
identified separately for historical comparison.

## Release boundary

This comparison answers the context-cost question with explicit provenance.
It cannot claim behavioral parity from projected legacy text, and it cannot
certify final installed adapter text. #1770 measures authority reads and
publishes the pre-slim report; #1678 reruns the final release gate on installed
bytes. Fixed budgets and the red pre-slim release gate do not change.
