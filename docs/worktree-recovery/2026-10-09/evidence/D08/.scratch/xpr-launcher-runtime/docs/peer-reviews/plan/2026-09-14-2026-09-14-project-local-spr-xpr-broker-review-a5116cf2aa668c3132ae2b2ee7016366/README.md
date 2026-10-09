# Project-local SPR/XPR broker plan review record

The accepted plan is
[`docs/plans/2026-09-14-project-local-spr-xpr-broker.md`](../../../plans/2026-09-14-project-local-spr-xpr-broker.md),
reviewed at commit `310893d79ba78b581acc0ed6997cbb65f30a61b8`,
blob `9665885d49b01ee03488a254871556a8338815c1`.

## Accepted attempt

Review `review-41fe00bc644d30de210814514e77b924` reached `accepted` with
reviewer consensus from Claude Opus 5 at high effort. No required findings
remain. The reviewer retained optional implementation observations.

The [acceptance manifest](../2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-review-manifest.md)
and [sealed reviewer response](../2026-09-14-2026-09-14-project-local-spr-xpr-broker-review-a5116cf2aa668c3132ae2b2ee7016366-recovery-1/review-41fe00bc644d30de210814514e77b924-reviewer-response-1.md)
were committed by the package in
`65651a4c1c65f9a29d3457eb8085f05844df7f97`.
The review used normal commit mode and manual transport; Human Authority
assurance was unavailable.

## Superseded attempt

Review `review-a5116cf2aa668c3132ae2b2ee7016366` was marked `superseded`
through the package CLI in favor of the accepted attempt above. Its first
three reviewer responses and corresponding author revisions remain preserved
in this directory.

**`review-a5116cf2aa668c3132ae2b2ee7016366-reviewer-response-4.md` is an
unsubmitted draft, not accepted evidence.** Its decision text says accepted,
but submission failed with `APR_REVIEWER_GIT_VIOLATION` after concurrent work
in another linked worktree created and updated
`refs/heads/37-claude-launch-permissions`. The artifact, HEAD, index, and
worktree matched the sealed boundary; the retained-ref digest did not.

The successor reviewed the identical committed plan in an isolated clone with
an independent Git ref database. The same Claude reviewer independently
verified the plan again and successfully submitted there. No Git boundary was
weakened or rewritten. The package-generated finalization commit was then
fast-forwarded into the original worktree without changing its bytes.

Startup and invitation documents retain the original generated paths for audit
purposes. These terminal attempts are historical records, not invitations to
start new work from those paths. Scratch runtime state and raw provider session
handles are not included in this commit.
