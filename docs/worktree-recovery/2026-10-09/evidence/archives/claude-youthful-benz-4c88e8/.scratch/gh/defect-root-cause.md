`lib/delivery-verification.mjs:517` — `if (observedMergeMethod !== intent.mergeMethod) throw verificationError('merge-method')`. The intent's method comes from configuration (`resolveMergeMechanism` over `fullAutoMerge`), not from observation, so a divergence between the declared method and the performed one is unrecoverable by construction.

`lib/close-delivery-receipt.mjs:61` — the no-commit-kind exemption requires `pullRequests.length === 0`. An issue of a no-commit kind that nevertheless delivered through a pull request falls onto the delivery lane and cannot fall back.

Neither behavior is wrong on its own. The verifier **should** refuse to write a receipt claiming a squash that did not happen — that refusal is the system working, and this defect is emphatically not a request to loosen it. The gap is that refusal is the only outcome: there is no way to record "merged, but by a method other than the configured one" as a truthful terminal state.

The exposure is ordinary rather than exotic. The GitHub UI offers whichever buttons the repository allows, a human merging by hand picks one, and any pick other than the configured method strands the issue.
