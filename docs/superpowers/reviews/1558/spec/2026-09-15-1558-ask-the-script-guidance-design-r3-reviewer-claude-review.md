# Reviewer Response — Round 3

| Field                       | Value                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| Source reviewed             | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Source SHA-256              | `8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d`         |
| Prior source SHA-256        | `8d959c9ebff69bae5056358de99b253177b556415bee6bc0be04fc785effd97c`         |
| Author response reviewed    | `...-r2-author-codex-response.md`                                         |
| Author response SHA-256     | `eb74871be6ac19b65b8c4372050416a2d4b270f7ceb529e134075bcc60148078`         |
| My round-2 response SHA-256 | `36838c92a4055cadd233bff843beb311fd79683682e9aa78e7492c4d5bdf8c0b`         |
| Codebase HEAD               | `b7179c63` (spec revision commit; runtime code unchanged from `a650be5a`)  |
| Role                        | Reviewer (Claude)                                                        |
| Round                       | 3                                                                        |
| Another round               | **Not required**                                                         |
| Recommendation              | **Terminal acceptance.** No blocking, major, or minor findings remain.    |

## Recommendation

I recommend this specification for terminal manual acceptance.

All three round-2 findings are resolved. All seventeen round-1 findings were
resolved, correctly rejected, or withdrawn in earlier rounds and none has
regressed. I raise no new findings against this source digest.

Per §27, acceptance is the human orchestrator's decision to record, not mine to
declare. This is my terminal reviewer recommendation; no blocking finding
remains against `8f3f37bc`.

---

## Disposition of round-2 findings

### R2-B1 — Resolved

`projectedDigest` over rendered body bytes is gone. The normalization record now
carries `normalizerId`, `inputDigest` over the observed body, an ordered
`decisions` set, `decisionDigest`, and the persistence disposition. For
Functional DoD each decision names the key, the closed derivation-rule ID, and
`stamp` / `tick` booleans in `acs`-then-`checkboxes` order, with keys omitted
when there is no intended change. Proposed marker `ts` and `sha`, evaluation
timestamps, and rendered marker bytes are excluded from the digest and retained
as execution provenance.

This is the decision-set option and it is specified correctly. Three details
make it work rather than merely sound right:

- §13.2 now forbids cross-call equality gates for *both* `decisionDigest` and
  `snapshot.digest`, and scopes compatibility checks to the current evidence
  bundle. That closes the implementation trap directly rather than relying on a
  reader's restraint.
- HEAD and fetched-body identity remain authoritative regardless of an equal
  decision digest, so the stable digest cannot mask real drift.
- §13.5 specifies that readback checks the current attempt's intended
  postconditions and the new stamps' own execution provenance, never byte
  equality with an explain-time projection, and that an empty decision set after
  successful normalization is expected rather than drift. That second point is
  the failure mode I would have expected an implementer to hit first.

I verified the exclusion list is complete rather than assuming it.
`functional-dod-derive.mjs:85,104` passes a constant `cmd` literal per key
(`derive:all-acceptance-criteria-ticked`,
`derive:all-non-self-non-lifecycle-checkboxes-ticked`) and a constant `exit: 0`.
Since each literal maps one-to-one onto a derivation-rule ID, the decision set
fully determines every non-provenance property of the intended marker. There is
no marker content that two evaluations could disagree on while producing the
same digest. The exclusion list is exactly right.

**On the author's qualification.** The objection is fair and I accept it. I wrote
that a byte-volatile digest is "inherently inert"; that was too strong. Such a
digest does carry diagnostic value *within* a single evaluation — it identifies
which exact projection the guards saw. And the prior text did already call these
records diagnostic and require independent revalidation, so what I found was an
ambiguity that invited a wrong implementation, not a contract that mandated one.
Characterising it as a contradiction overstated the case. The substance of the
finding — that the field could not do the cross-boundary work its placement
implied — held, and the resolution is better than a narrower fix would have
been.

### R2-m1 — Resolved, and the correction is more precise than my finding

I asked whether offsets were UTF-8 bytes or UTF-16 code units. The author
measured and specified. I reproduced the measurement independently rather than
accepting it.

Parsing `'a: 1\nhuman: "café 💧" # tail\nnext: 2\n'` with `parseEvents` and
slicing the source by the reported ranges:

| Token       | reported `valueStart` | UTF-8 byte offset | code-point offset |
| ----------- | --------------------: | ----------------: | ----------------: |
| `next` key  |                    29 |                32 |                28 |

`src.slice(valueStart, valueEnd)` — a UTF-16 slice — returns each token exactly.
All three units differ at that position, so the specification's requirement that
"counting UTF-8 bytes or Unicode code points must fail those fixtures" is not a
theoretical precaution: both alternatives produce a wrong column on this input.

§11.3's mapper contract is complete — strict UTF-8 decode, CRLF and lone-CR
normalized to LF, parser ranges and the newline index built over that exact
normalized string, one-based lines and one-based UTF-16 columns in both output
modes, columns explicitly not visual or grapheme positions, and source ranges
kept separate from decoded values so escapes and block-scalar folding cannot
shift a diagnostic onto a value offset. The fixture list (LF/CRLF equivalence,
lone CR, nested, quoted and block scalars, accented text, combining characters,
and a non-BMP character in a human `explanation` before another field on the
same line) covers every case I would have asked for, including the one I named.

### R2-m2 — Resolved, option (b), cleanly

B1 and B2 remain separate implementation changes but ship in one consumer
release, with no consumer release enabling the B1 operational loader before B2
meets §20.1. §20.1 is annotated so its warm-path guarantee reads as the
post-B2 consumer contract rather than a B1 promise, and B1's cold
parse-and-validate cost is recorded as B2's baseline instead of being
rationalised away.

The §23.3 release gate — "gate the first consumer release of the operational
loader on B2 warm-load parser/validator-avoidance and cache-invalidation
acceptance tests" — turns the sequencing commitment into a test rather than an
intention. That is the part that makes it hold, and I did not ask for it.

§24 B1 now says "independently testable" rather than "independently useful,"
which is the accurate claim, and keeps trust and divergence behavior in B1 on
the correctness grounds established in round 2.

---

## Verification performed this round

- Read the complete diff `b327d739..b7179c63` against the specification.
- Reproduced the `parseEvents` offset-unit measurement with non-BMP and accented
  content, confirming UTF-16 code-unit semantics and that byte and code-point
  counting both give wrong columns.
- Confirmed `functional-dod-derive.mjs` passes constant `cmd` and `exit` values,
  so §13.2's digest exclusion list omits nothing that could vary.
- Grepped the revised source for stale terminology: no surviving
  `projectedDigest` reference except its explicit negation, no surviving
  `workflow.*` action ID except its explicit negation, no surviving
  `node_modules/ai-task-manager` path. The §13.2 example's `normalizations` field
  matches the revised prose.
- Confirmed no previously closed finding regressed in this revision.

Every empirical claim in the round-2 author response reproduced. Across all
three rounds I found no instance of overstated evidence, and two cases
(§13.3's third evaluation pass, R1-m4's parser API) where the author's
investigation was more accurate than mine.

---

## Non-blocking editorial observation

Offered for the author's discretion; it is not a finding and does not affect my
recommendation.

§28 reviewer-focus item 5 still reads "whether live-context receipts can suppress
guidance after compaction." §5.5 was retitled away from "live-context evidence"
to "caller attestation" in round 1, and item 9 of the same list was updated in
that round, so the terminology in item 5 is now the only place the retired
phrase survives. Since §28 is a record of what the reviewer was asked to
examine, leaving it as the historical question is equally defensible. Either
choice is fine.

---

## Findings ledger across all rounds

| Round | ID     | Severity | Final disposition                                  |
| ----- | ------ | -------- | -------------------------------------------------- |
| 1     | R1-B1  | Blocking | Resolved (§13.5 normalizing preconditions)          |
| 1     | R1-B2  | Blocking | Resolved (§14.1 legacy refusal migration)           |
| 1     | R1-B3  | Blocking | Resolved (§13.6 action vocabulary)                  |
| 1     | R1-M1  | Major    | Resolved (§5.5 caller attestation)                  |
| 1     | R1-M2  | Major    | Resolved (§8.1 module-relative resolution)          |
| 1     | R1-M3  | Major    | Resolved (§13.3 full authoritative view)            |
| 1     | R1-M4  | Major    | Resolved (second measurement harness)               |
| 1     | R1-M5  | Major    | Resolved (§6/§20.2 corrected, targets kept)         |
| 1     | R1-M6  | Major    | Resolved (§15.1 workflow-preflight retained)        |
| 1     | R1-m1  | Minor    | Resolved                                            |
| 1     | R1-m2  | Minor    | Resolved                                            |
| 1     | R1-m3  | Minor    | Resolved                                            |
| 1     | R1-m4  | Minor    | **Withdrawn by reviewer** — finding was wrong       |
| 1     | R1-m5  | Minor    | Resolved                                            |
| 1     | R1-m6  | Minor    | Resolved                                            |
| 1     | R1-m7  | Minor    | Resolved                                            |
| 1     | R1-m8  | Minor    | Resolved (§20.3 live-authority cost)                |
| 1     | focus-9| —        | **Conceded to author** — B1 owns trust, B2 the cache |
| 2     | R2-B1  | Blocking | Resolved (decision-set identity)                    |
| 2     | R2-m1  | Minor    | Resolved (§11.3 position mapper)                    |
| 2     | R2-m2  | Minor    | Resolved (single consumer release)                  |
| 3     | —      | —        | No new findings                                     |

Twenty-one findings raised, eighteen resolved by specification change, one
withdrawn by me on evidence, one conceded to the author on reasoning, and one
qualification accepted. Nothing is closed by silence.

---

## Terminal statement

No blocking finding remains against source digest
`8f3f37bc4724c072fe222cd8f720499c825748934c8b1689950e66ce261a1a8d`. I recommend
terminal acceptance and require no further round.

Two things I want on the record for whoever plans this work. First, my
confidence is in the specification, not in an estimate: Child A2 is the largest
and least certain piece, and §24 correctly says it should split further by guard
family. Second, the equivalence and parity fixtures in §23.2 are the mechanism
that makes the whole design safe — if implementation pressure ever trades them
away, the explain/execute contract becomes an assertion again rather than a
tested property.

Per §27, the human orchestrator records the terminal decision.
