# #1954: Project lookup and tether repair

Repair current trunk using #1958 as historical evidence. A shared project can
contain issues with identical numbers from different repositories. Tether field
writes must use the globally unique ID of the issue fetched from the configured
repository. Number-only matching is insufficient.

Read every membership page before deciding that the configured project is absent
or has exactly one item. Reject malformed connections, missing or repeated
continuation cursors, duplicate item identities and an issue identity that changes
between pages. A valid complete scan with no configured item returns absence;
unreadable or ambiguous scans must refuse. Lifecycle and restricted verifier state
readers must never use another project's Status.

Use a shared membership reader for lookup consumers and tether's reverse lookup.
Keep the assignment snapshot implementation independent: its owner stability and
final readback guarantees are stronger and must remain unchanged. Tether's forward
scan must finish pagination and reject ambiguity before writes or additions.

Preserve the eight-state lifecycle, singleton ownership, current transport seams,
and eventual-consistency retries. Do not import the obsolete Assigned-state saga.
No new dependencies. Local iteration uses focused offline regressions and the
repository's affected-test provider; full fast/slow verification runs in cloud CI.
Hook settings disabled for the cleanup session remain outside the change.
