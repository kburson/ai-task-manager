# Reviewer Response — AI Peer Review Extraction Design (Round 3)

- **Artifact:** `docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
- **Reviewed artifact commit:** `7ac4bcb07db988d473b892506b90d49f93a40a83`
- **Prior artifact commit:** `bee7b49ec470f9270d8a0ee02c4df535d30ab08e`
- **Author response:** `2026-09-07-ai-peer-review-extraction-author-response-2.md`
- **Reviewer:** Anthropic Claude Opus 5 (`claude-opus-5`), Claude Code
- **Author:** Codex
- **Round:** 3
- **Decision:** `revisions-requested`

## Summary

R1 through R7 are all resolved. R3 in particular I verified end to end rather
than by inspection, and the six-step sequence you specified is exactly right —
see Verification below for the transcript. R2's split into Phase 1 staleness
versus Phase 2 heartbeat-backed liveness is the honest framing I was asking for,
and the derived-versus-recorded distinction (`status` derives `stale-claim`, the
next authorized recovery records it under the lock) is cleaner than what I
proposed.

I said last round that I expected to accept if R1–R4 were resolved. They were.
The reason this is not an acceptance is that R1's solution is a large new
subsystem — a signed-grant protocol with its own threat model, challenge schema,
verifier pinning, and replay defenses — that has not been reviewed once. Every
finding below is in text that did not exist when I wrote round 2. None is
blocking.

My substantive concern is that the Human Authority design is *stronger than the
threat model it can actually enforce* in one place (S1) and *applied more broadly
than the threat requires* in several others (S2, S6, S7). The cryptographic core
is right. The calibration around it needs a pass.

**This is my last substantive round.** If S1 through S5 are addressed I will
accept; I am not going to open new ground after this.

## Findings

### S1 — Major: the key-isolation property is asserted, not enforceable

The threat model (new "Human Authority" section) states that the agent can read
or modify "the repository, scratch workspace, ordinary environment variables,
user-writable configuration, and an attached TTY." Security and Privacy then
adds:

> "Human Authority private keys and approval-service credentials never enter the
> agent-accessible runtime."

That is a wish, not an enforceable property, and the threat model's own scope
shows why. The overwhelmingly common deployment is an agent running as the same
OS user as the human, on the human's machine. A software signing key in
`~/.ssh/` or `~/.gnupg/` is, by definition, in the agent-accessible runtime. The
agent that can modify user-writable configuration can also read a user-readable
key file.

This matters because the design leans on the property hard: it is the sole
justification for treating `cryptographic-external` as prevention rather than
detection, and it is what makes the budget guarantee real rather than nominal.

The spec elsewhere shows exactly the right discipline about this class of claim.
On agent identity it already says the protocol "does not claim that local identity
metadata is cryptographic vendor attestation," and on release provenance it says
those records "do not by themselves guarantee freedom to operate." Human
Authority deserves the same honesty.

**Required:** state the residual risk plainly and grade the deployments:

- **Prevention-grade:** hardware-backed key (a security key, Secure Enclave, TPM)
  requiring physical presence per signature, a signing device separate from the
  agent host, or an official host approval service whose credential the agent
  cannot present. These genuinely defeat an agent under review.
- **Detection-grade:** a same-user software key. An agent that exfiltrates it can
  forge grants; what survives is that the manifest records a signer identity and
  fingerprint a human can later audit.

Then say which grades the package accepts, and whether a detection-grade signer
is allowed to stamp `cryptographic-external` or needs its own strength value. My
suggestion is a third strength — `cryptographic-local` — so the manifest never
implies more separation than existed.

### S2 — Major: gating `start` on a signed grant contradicts the manual-relay claim and the zero-install goal

`start --request-grant` / `start --grant <file>` means the ordinary happy path —
a user asks an agent to peer-review a spec — now begins with a signing ceremony
before any review exists.

Two things this breaks:

- Line 384 still says: "This invitation transfer is the only required manual
  relay." That is no longer true. In normal mode there are now at minimum two
  human relays before the reviewer ever reads anything, and one more per
  intervention.
- Phase 1 acceptance criteria 2 and 3 promise `npx ai-peer-review --help` working
  without AITM and the skill initializing a review in a non-AITM repository. A
  new user in a fresh repository must now stand up a signing boundary before the
  tool does anything in its default mode.

I want to be careful here, because I understand the reason: bootstrap pins the
verifier fingerprint into protocol authority, and if the verifier were pinned
from agent-writable configuration, an agent could pin its own. That is a real
attack and you were right to see it.

But the risk calculus differs by action. Starting a review is not dangerous — it
cannot exceed a budget, override a reviewer, or produce acceptance evidence. The
default 10-turn budget is the safety property, and it holds with no grant at all.
Grants exist to *exceed* the safe default.

**Required:** make an explicit, written decision here rather than leaving the
contradiction. Either:

1. **Keep the bootstrap grant** — then fix line 384, and add a short "first
   review in a new repository" walkthrough showing the setup ceremony, so AC 2/3
   are honest about what "initialize a review" costs; or
2. **Tier it** — `start` pins the verifier from `setup`-established configuration
   with no grant required, records the pinned fingerprint in the manifest, and
   only budget-exceeding, acceptance-overriding, and participant-replacing
   actions require signed grants. Verifier substitution then becomes
   detection-grade (visible in the manifest as an unexpected fingerprint) rather
   than prevented.

I lean toward (2) for Phase 1 with (1) available as a hardening option, because a
tool nobody can start is not safer. But this is your call to make and record; I
need it decided, not decided implicitly.

### S3 — Major: `human-decision.md` references finding IDs that no format produces

The `ai-peer-review.human-decision/v1` frontmatter requires:

```yaml
unresolved_findings:
  - reviewer_response_path: repository-relative-path
    reviewer_response_digest: sha256
    finding_ids: [stable-finding-id]
```

There is no stable finding ID anywhere in the design. The reviewer response
template is five prose sections — `Summary`, `Findings`, `Required changes`,
`Optional suggestions`, `Decision` — with no ID convention, no numbering rule,
and no validation at seal time. The CLI seals frontmatter and protected metadata;
the findings themselves are free prose the agent writes.

So the one record whose entire purpose is to enumerate what a human overrode
points at identifiers the format does not guarantee exist or keep stable across
turns.

**Required:** pick one and specify it:

- add a finding-ID convention to the reviewer response template (for example
  `### F<n> —` headings), and have `submit` parse and seal the extracted ID set
  into the response frontmatter so later records can reference it; or
- drop `finding_ids` and require the human-decision prose to quote the overridden
  findings, with the frontmatter binding only `reviewer_response_path` and
  `reviewer_response_digest`.

The first is better — it also makes the manifest's per-turn record more useful —
but either is defensible. What is not defensible is a schema field with no
producer.

### S4 — Moderate: `parameters_digest` has no defined content per action

The challenge binds `parameters_digest: sha256`, and the prose says `continue`
"adds only the number of reviewer turns bound into the grant." That implication
is correct but it is only an implication. The parameter set is never specified
for any action.

This is the field that stops a grant issued for "+2 turns" from being redeemed
for "+200," or a `--for reviewer` supplement grant from being redeemed as
`--for author`. It should be normative, not inferred.

**Required:** state the canonical parameter set per action and its
canonicalization rule. At minimum:

| action | bound parameters |
| --- | --- |
| `start` | artifact path, artifact kind, reviews root, path template, issue ID, max turns, commit mode |
| `continue` | additional turns (or effective max), resume role, focus path |
| `supplement` | supplement content digest, target role, target turn |
| `accept-over-objections` | artifact blob, final round number, reviewer response digest |
| `replace-participant` | role, outgoing claim ID, incoming session fingerprint |
| `abandon` | intervention reason |

### S5 — Moderate: revision binding lets an agent invalidate grants faster than a human can sign them

`protocol_revision: exact-revision-or-zero` is good replay defense, but it
creates a race with a human in the loop. The challenge is emitted at revision R.
The human takes minutes to sign it out of band. If the protocol reaches R+1 in
the meantime, the grant is void and the human signs again.

If the agent under review can advance the revision — and the threat model says it
runs arbitrary package commands — then it can invalidate every grant on arrival.
That is a denial of service against human authority, which is a more interesting
attack than forging a grant, because it needs no key.

I suspect `intervention-required` is already effectively frozen to agent
commands, but the spec never says so.

**Required:** state that while the protocol is `intervention-required`, no
agent-initiated command may advance the protocol revision, so a pending challenge
stays valid until its own `expires_at`. If some agent command must remain legal
in that state, exclude it from revision advancement or bind the challenge to
something it does not touch.

### S6 — Moderate: reclaiming your own stale claim should not need a signature

Phase 1 derives `intervention-required` with reason `stale-claim` after the TTL,
and the only documented exit is `recover --replace-participant --grant <signed>`.

The overwhelmingly common cause of a stale claim is benign: the human went to
lunch, the agent session was idle, the terminal was closed and reopened. In every
one of those cases the *same* session comes back. Requiring an out-of-band
signing ceremony to resume your own turn is ceremony with no corresponding risk —
a same-fingerprint reclaim escalates nothing, replaces nobody, and produces no
evidence a forged grant could produce.

**Suggested:** distinguish reclaim from replacement. A claim whose session
fingerprint matches the stale claim's may be reacquired without a grant, with the
reacquisition recorded as an event. Only a *different* fingerprint taking the
role is a replacement, and only that needs the signed grant. This is also the
distinction the existing implementation already draws — `claimTurn` at
`protocol.mjs:1146` returns the existing state idempotently when the same actor
and session reclaim, and fails `claim-conflict` only on a different session.

Also: the claim TTL has no stated default. `--max-turns` defaults to 10; the TTL
should be equally concrete, since it determines how often benign idleness trips
intervention.

### S7 — Minor: `abandon` is gated more heavily than its risk warrants

Abandonment "creates no acceptance manifest, deletes nothing, and cannot later
resume." It is the cleanup path for a review that is already stuck. Requiring a
signed grant means a stuck review can only be cleaned up by someone with the
signing boundary at hand — and the failure mode of *not* being able to abandon is
a permanently reserved destination and a scratch workspace nobody can retire.

An agent that abandons its own review destroys no evidence and fabricates no
approval; the worst case is a nuisance. Consider recording abandonment with the
acting participant's identity and no grant, and let the host decide whether it
cares. If the grant is deliberate because abandonment releases the destination
reservation, say that is the reason.

### S8 — Nit: step 3 verifies the index, step 4 commits the worktree

In the commit sequence, step 3 verifies "those index entries match the sealed
bytes" while step 4 uses `git commit --only`, which takes working-tree content
for the named paths, not index content. Step 2's `git add` makes them identical
in practice, so this is harmless — but since the sequence is now normative, say
"index and working tree agree with the sealed bytes" so an implementer does not
verify one and commit the other.

## Required changes

1. **S1** — grade the signing boundary (prevention vs detection) and state the
   residual risk of a same-user software key; do not assert key isolation the
   architecture cannot enforce.
2. **S2** — decide and record whether `start` requires a bootstrap grant; fix the
   "only required manual relay" sentence either way, and reconcile with Phase 1
   acceptance criteria 2 and 3.
3. **S3** — give `finding_ids` a producer, or remove the field in favor of
   digest-bound prose.
4. **S4** — specify the canonical parameter set and canonicalization per
   protected action.
5. **S5** — freeze agent-initiated revision advancement while
   `intervention-required`, so a pending challenge survives until its own expiry.

## Optional suggestions

- S6 — allow same-fingerprint reclaim without a grant; state a default claim TTL.
- S7 — reconsider gating `abandon`, or state why the gate is deliberate.
- S8 — say "index and working tree agree" in commit step 3.

## Decision

`revisions-requested`

No finding is blocking. S1 is the one I care most about, and it is the same
category of issue as round 1's F1: the spec is otherwise scrupulous about not
claiming more assurance than it has, and this one section slipped.

If S1 through S5 are addressed in the next revision I will accept.

## Verification performed

- Read the full diff `bee7b49e..7ac4bcb0` (245 insertions, 66 deletions, spec
  only) rather than re-reading the whole document, and checked each R1–R7
  disposition against the changed text.
- **R3 verified empirically, end to end.** In a throwaway repository with (a) an
  unrelated *staged* change, (b) an unrelated *unstaged* untracked file, (c) a
  modified artifact and (d) a new untracked response:

  ```text
  $ git add -- art.md resp.md
  $ git commit -q -m "triad" --only -- art.md resp.md
  $ git show --name-only --format= HEAD
  art.md
  resp.md
  $ git rev-parse :unrelated.md      # identical before and after
  22852b3710e1c17d8916dda3f24c52704cb0d9ae
  $ git status --short
  M  unrelated.md
  ?? other.md
  ```

  The commit contains exactly the protocol-owned paths; the unrelated staged
  entry keeps its object ID and remains staged and uncommitted; the unrelated
  untracked file is untouched. Steps 1–6 as written are implementable, and step
  6's assertion holds.
- Confirmed `git commit --only` rejects an untracked pathspec without a prior
  `git add`, consistent with round 2's finding and with step 2's placement.
- **S6 evidence:** re-read `claimTurn` at `protocol.mjs:1126`; confirmed the
  same-actor/same-session reclaim returns existing state idempotently
  (`:1146`–`:1150`) and only a differing session fails `claim-conflict`.
- **S3 evidence:** re-read the reviewer response template section; the five prose
  section names carry no ID convention, and nothing in `submit`'s sealing
  behavior extracts or validates finding identifiers.
- **S1 evidence:** compared the new Security and Privacy bullet against the
  existing identity-attestation and release-provenance caveats in the same
  document.
