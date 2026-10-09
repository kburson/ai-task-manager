Introduce a pull-request-side head relation alongside the existing local one, so an advanced pull-request head is a distinct, recognizable condition rather than an absent match.

When exactly one pull request for the branch has a head that is a descendant of the accepted SHA, and the accepted SHA's content is provably included in that head, treat it as an accepted-SHA-superseding delivery rather than as no match at all. Verifying inclusion — not merely ancestry — is what keeps this from becoming a hole: a descendant commit could revert the approved change, so ancestry alone must not be sufficient.

Prefer surfacing this as an explicit, auditable envelope so the receipt records that the pull-request head advanced past the accepted SHA and states what was verified about the relationship, rather than silently accepting a different head.

Alternatively or additionally, provide a first-class re-verification entry point that regenerates an exact-head receipt at the current head without requiring `demote --rework`, since the code-rework flag misdescribes this situation.

Do not weaken the exact-head evidence contract. A pull request head that is not a descendant of the accepted SHA, or that does not provably include the approved content, must still refuse.
