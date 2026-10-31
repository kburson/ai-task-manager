# Disposable workspaces and durable integration (#2134)

## Purpose

A delivery maintainer must be able to retire a completed story checkout and replace an epic operator without losing verifiable delivery history or the ability to integrate the next child. Git commits and existing issue evidence remain durable; session bindings, occupancy and checkout paths are temporary.

## Existing failure

The location reader treats the last append-only location as current authority indefinitely. The graph mapper exposes that path as authoritativeWorktree; merge-back executes Git inside that historical directory. A removed parent checkout therefore produces ENOENT even when the custom epic branch and all accepted commits remain available. Close already has a main-anchored terminal ledger and resumable release helpers; reuse them.

## Required behavior

Separate strict historical location parsing, durable branch selection and live checkout ownership. Terminal delivered evidence ends the old location's operational authority while preserving raw history. Open epics keep their opaque custom branch. Live bindings and occupancy validated against actual repository identity and issue ownership remain write authority.

Resolve integration targets in the child's real shared repository. Prefer the registered clean checkout actually holding the target branch; otherwise use a temporary integration checkout under existing machine scratch. Use ordinary Git checkout and merge so target index and files stay consistent. Refuse dirty work, foreign repositories, conflicting live writers and target advancement during verification. Preserve accepted-source checks and existing verification providers. Short integration locking and fresh target and ownership observations bound concurrent integration.

Close uses its existing transaction and release inspection to recover interrupted release. Verify binding and occupancy removal against original terminal identity and preserve newer legitimate bindings. Retain delivery evidence in existing issue and main-anchored mechanisms before disposable source cleanup. Historical timing Unknown remains Unknown.

## Replacement checkout bootstrap

Managed worktrees begin detached. Existing draft-branch requires an exact detached binding in a drafting state, then switches branches and injects a session override during renewal; native renewal rejects that override and detached or drafting predecessors. Repair only this admission seam so a real owned checkout can receive its initial branch or existing durable epic branch without synthetic identity, source changes, bypass flags or manual ledger mutation. The ordinary binding writer owns renewal and read-back verification.

## Scope and validation

One standalone defect based on trunk; do not import unfinished #2039 or #2068. No parallel store, broad R1 activation, historical rewrite or generic override. Real-Git fixtures cover retired source and parent checkouts, custom target branches, replacements, interrupted Close, dirty work, concurrent target movement, foreign repositories, live writers and reopened bindings. Targeted tests run locally; complete suites run in GitHub Cloud at exact accepted source. The orchestrator owns independent review, delivery and Close.
