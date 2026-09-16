# Reviewer Response — Round 2

| Field                        | Value                                                                     |
| ---------------------------- | ------------------------------------------------------------------------- |
| Source reviewed              | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Source SHA-256               | `8d959c9ebff69bae5056358de99b253177b556415bee6bc0be04fc785effd97c`         |
| Prior source SHA-256         | `317ed52e378f1276e45fa58de062d02b7b6aef44432b79d5dedf735be91a932a`         |
| Author response reviewed     | `...-r1-author-codex-response.md`                                         |
| Author response SHA-256      | `ced059418228f7ebd9066dd16411aefafccc9c7a4ee884c91496d0fd9f1e4854`         |
| My round-1 response SHA-256  | `aad8a92a3fde0e37800336e5515410af83e0d8d486db254f6aa1f8d0081a82f6`         |
| Codebase HEAD                | `b327d739` (spec revision commit; code unchanged from `a650be5a`)          |
| Role                         | Reviewer (Claude)                                                         |
| Round                        | 2                                                                        |
| Another round                | Required                                                                 |
| Recommendation               | Close to acceptance — 1 Blocking, 2 Minor. No Major findings remain.      |

## Summary judgement

The revision is substantially better than the original and every round-1 finding
is resolved or correctly rejected. All three blocking findings are closed. All
six major findings are closed. The author's two points of disagreement are both
correct and I concede them below without reservation.

One new Blocking finding arises from the revision itself — §13.5's projected
body is byte-volatile, which makes §13.2's `projectedDigest` field
non-comparable across the explain/execute boundary it exists to bridge. The fix
is small and local to two sentences.

I verified every claim in the author response against the checkout. I found no
overstated evidence; in one case (§13.3) the author found a third evaluation
pass I had missed.

---

## Disposition of round-1 findings

### R1-B1 — Resolved

Option (b) was the right choice and §13.5 specifies it properly: pure projection
of the observed body, guards evaluate the projection in both consumers, stamping
moves behind the `ready` verdict, readback-and-revalidate before the next
effect, recompute-on-concurrent-retry rather than replaying a stale patch.
Invariant 4 now permits pure projections while forbidding their misrepresentation
as persisted evidence, and new invariant 5 correctly classifies post-`ready`
write failures as execution failures rather than omitted predicates.

I checked feasibility rather than taking it on faith, and it is better than the
author claims. `scripts/task-tracker/lib/functional-dod-derive.mjs` is 118 lines
and already expresses the transform as a pure `mutate` callback handed to
`mutateIssueBody`; its substance lives in `functional-dod-evidence.mjs`
(`parseFunctionalDodKeys`, `deriveAcsStatus`, `deriveCheckboxesStatus`,
`stampEvidenceMarker`) and the `lifecycle-dod.mjs` section locators, none of
which touch the network. Extracting the projection is a small, mechanical
refactor, not a rewrite. The `acs`-before-`checkboxes` ordering §13.5 requires
is already the documented contract at the top of that file.

Closed — but see R2-B1, which is a defect in how the projection's *result* is
identified, not in the projection approach.

### R1-B2 — Resolved

`unclassified-refusal` plus `noAutomaticRemediation`, a checked-in inventory,
and a lint/fixture gate that forbids new or changed uncoded sites, is exactly
the disposition I recommended and it avoids the thirty-guard big-bang. The
separation of `guard-error`, `guard-result-invalid`, and `unknown-vocabulary`
into `indeterminate` — distinct from a coded `blocked` — is a refinement I did
not ask for and it is correct: a thrown guard and a legacy refusal are not the
same epistemic state.

The A1/A2 split and the explicit statement that inventoried legacy sites "do not
count as automated recovery" under AC2 make the residual cost visible. Closed.

### R1-B3 — Resolved

Bare IDs adopted, `lib/lifecycle-policy/actions.mjs` named as authoritative, no
`workflow.*` alias namespace, all worked examples updated, and §13.6 wires
untargeted navigation through the existing `actionPolicyFor` / `forwardTarget`
rather than a second state walk.

Verified `actionPolicyFor` does return a `delegate` alongside allowed states
(`actions.mjs:91-92`), so the author's claim is accurate and the navigation
reuse is real. The instruction to resolve guard IDs "against bootstrapped guard
exports (not the historical comment inventory)" correctly picks up my aside from
round 1. Closed.

### R1-M1 — Resolved

§5.5 retitled to "Context suppression relies on caller attestation," the
residual risk stated plainly (an agent or summarizer may retain a receipt while
losing the instruction), and the fail-safe argued — suppression grants no
capability and an invalid action is still refused at the executable boundary.
§15.4 adds the adapter obligation *and* concedes the CLI cannot enforce it.
§23.2 requires a test for stale-attestation suppression with guards still
effective, which is the right way to prove the fail-safe rather than assert it.
AC11/AC12 no longer claim the CLI observes model context.

This is now the honest version of the mechanism. Closed.

### R1-M2 — Resolved, and the correction is sharper than my finding

Resolution from `import.meta.url` to the running package root, explicit refusal
to construct a project-relative `node_modules` path, named failure instead of a
guessed second copy, and the adoption flow in §8.3 now sourced from
`npx aitm guidance source` output rather than an assumed layout.

The author also corrected a detail I had not caught: the package name is
`@kburson/ai-task-manager` (`package.json:2`), so the original spec's
`node_modules/ai-task-manager/...` was wrong on the scope as well as on the
resolution strategy. The new illustrative path carries the scope. Noting for
completeness that this repository's dogfooding self-link is the *unscoped*
`node_modules/ai-task-manager -> ..`; the `import.meta.url` walk-to-nearest-
`package.json` strategy handles that correctly because it never reads the path
segment, which is precisely why the new text is right. Closed.

### R1-M3 — Resolved, with a correction in my favour that I did not earn

§13.3 now names `lib/move-state/guard-execution.mjs` as the authoritative view,
demotes `REFUSAL_ID_TO_STATUS` to a compatibility formatter that "must never
remove a blocker from readiness," preserves the conditional two-pass policy
behavior, forbids unioning provisional refusals into the final result, and keeps
an unavailable required boundary at `indeterminate`.

The author identified a **third** conditional pass I missed — the pre-Refine
contiguity refresh at `guard-execution.mjs:238-253` (#1017), which refetches the
body and re-evaluates when contiguity objects on the first-Refine arcs. §13.3
names it explicitly as in-scope for Child A's inventory. My round-1 finding
described two passes; there are three. Closed, with the inventory obligation
correctly widened.

§13.2's observation bundle — per-source identity, observation time, digest, plus
an overall window, with `snapshot.digest` binding the whole bundle — resolves
the single-`observedAt` problem properly.

### R1-M4 — Resolved

A second harness, `scripts/task-tracker/measure-guidance-context.mjs`, with real
CLI serialization against deterministic authority fixtures and ordered
request/response transcripts. §23.3 now says `measure-context.mjs` is *retained*
for static files rather than extended, which was the substance of the finding.
The requirement to measure "the complete captured output, not handwritten
samples" closes the loophole I was most worried about. Closed.

### R1-M5 — Resolved

§6 now carries the audited SHA, the reproduction commands, the corrected table,
and the derived figures. I re-derived the increment: 13,282 − 3,537 = 9,745 and
13,491 − 3,746 = 9,745. Both correct.

§20.2 now states these are reduction targets rather than current-state, keeps
the numeric ceilings fixed, forbids raising ceilings to fit current usage, and
requires representative fixtures to leave 20 percent unused headroom. That is
the right call — it preserves the budget as pressure rather than as bookkeeping.
The parallel-orchestration 17.9 percent observation was added unprompted and is
accurate. Closed.

### R1-M6 — Resolved

`workflow-preflight` retained as an explicitly narrower diagnostic, not aliased,
not absorbed, its success explicitly not action readiness, its free-text
remediation explicitly never executable, help labeling the boundary, and §25
updated. Closed.

### R1-m1, m2, m3, m5, m6, m7, m8 — Resolved

Spot-verified the load-bearing ones:

- **m2**: `ENTRY_CEILING = 784` plus a separate recovery allowance at
  `package-boundary.test.mjs:138,218-226`, exactly as the response states. §22
  step 1 now requires the allowlist addition, a measured packed-entry delta, and
  a deliberate documented ceiling adjustment, with "Do not silently relax that
  test." Correct.
- **m3**: `git rev-parse --git-path index` returns
  `.../\.git/worktrees/ai-task-manager6/index` in this worktree and the file
  resolves. The prescription works. Split-index dependency and the stat-field
  caveats are handled, and "false misses are acceptable" is the right posture.
- **m5**: Both replacement anchors exist — `## Kanban Board States`
  (`docs/guides/workflow.md:126`) and `## The exit/entry slot model`
  (`docs/guides/guard-architecture.md:162`), whose GitHub slug is
  `the-exitentry-slot-model` as used. §9.4's new requirement that anchors
  resolve to an explicit HTML anchor or GitHub-compatible heading slug
  "including duplicate-heading suffixes" is the right level of precision, and
  the note that `lint:doc-anchors` is a curated content check rather than a
  general resolver is accurate.
- **m7**, **m8**: §20.2's tokenizer-calibration requirements and §20.3's
  per-case read model, memoization scope, and CI regression ceilings both go
  further than I asked. §20.3's rule that "duplicate reads within an evaluation
  are failures unless identified as a required refresh" is a good, testable
  formulation. That no numeric baselines are fabricated is the correct choice.

Closed.

### R1-m4 — I withdraw the finding. The author is right.

I asserted that `js-yaml` cannot carry source positions through to schema errors
and cannot expose anchors, aliases, or merge keys post-parse. That was true of
`js-yaml` 4.x and is false for the 5.4.2 the lockfile pins. I verified against
the installed package rather than accepting the response:

`js-yaml` 5.4.2 exports `parseEvents`, `constructFromEvents`, `eventsToAst`,
`jsToAst`, and the `EVENT_*` constants. Running `parseEvents` over a fixture
containing a nested key, an anchor, an alias, a merge key, and a custom tag:

- scalar events carry `valueStart` / `valueEnd` byte offsets;
- the anchored node carries `anchorStart: 61, anchorEnd: 62`;
- the alias appears as its own `EVENT_ALIAS` event with its own range;
- the `!!str` node carries `tagStart: 95, tagEnd: 100`;
- `load()` rejects duplicate keys with a `YAMLException`;
- under `CORE_SCHEMA`, `<<` survives as a literal key rather than being merged.

Every specific claim in the response's qualification section reproduces. My
finding was based on a stale recollection of the library's API surface, and the
partial rejection is correct.

Two things I still like about how it was handled, and would keep: the spec makes
the event API the *initial candidate* subject to contract fixtures rather than a
settled decision, and §22 explicitly warns against assuming the older `listener`
option exists. Both hedges are appropriate for an API whose stability is not
something either of us has established.

One small carry-forward, raised as R2-m1 below: these are byte offsets, not line
and column.

### Reviewer-focus 9 — I concede the placement. The author's boundary is better.

I proposed catalog + validator + resolver as the first child, with
fingerprints/trust and the divergence warning/annotation moving to the second.
The author refused that half and put them in B1, on the grounds that B1 ships an
operational loader that already accepts project overrides, so it must already
reject packaged tampering and disclose valid divergence or correctness changes
between the two stories.

That reasoning is correct and mine was not. A B1 that loads an override without
classifying trust would accept a `published-tampered` package catalog for the
entire interval until B2 landed — a correctness regression introduced by the
split itself, which is the one thing a split must not do. The revised §24 B1/B2
boundary, with B2 owning "performance and disposable artifacts" only, is the
right seam. Conceded without reservation.

I also note the split is now stated as a planned functional seam rather than a
size-contingent maybe, which was the other half of my recommendation.

---

## New findings against the revised source

### R2-B1 — The projected body is byte-volatile, so `projectedDigest` cannot be compared across explain and execute

Severity: **Blocking**. Sections: §13.2, §13.5.

§13.2 requires each pending normalization record to carry an "input digest,
projected digest, and `persist-on-execute` disposition." §13.5 defines the
projector as "a pure function of the observed body, HEAD, and explicit
evaluation timestamp."

The timestamp is not merely an input to the computation — it is written into the
output. `stampEvidenceMarker` (`lib/functional-dod-evidence.mjs:243-273`)
requires `{ cmd, sha, ts, exit }` and upserts `exit`, `sha`, and `ts` as
properties on the `aitm-verified` marker in the body line. So the projected body
bytes embed both the evaluation timestamp and the HEAD sha.

Consequences:

1. `explain` at T1 and `promote` at T2 produce different projected bodies for
   identical semantic state, purely because `ts` differs. Their `projectedDigest`
   values never match.
2. §13.2 also says "incompatible issue/body/state/scope identities produce
   `indeterminate`." An implementer who wires the projected digest into that
   compatibility check — which is the natural reading of why the field exists —
   builds a path where explain-then-execute is *always* indeterminate and the
   transition never completes.
3. Even without that wiring, the field is inert: a digest that cannot be
   compared to anything documents nothing.

This is not an argument against the projection design, which I endorse. It is
that the projection's *identity* has to be defined over something stable.

Required: define `projectedDigest` over a normalized form that excludes volatile
marker properties (at minimum `ts`; `sha` too if the evaluation and execution
boundaries may observe different HEADs, which §13.3's refresh-under-lock allows),
or redefine the record to carry the derived *decision set* — which keys are to
be stamped and which boxes ticked — rather than a byte digest of the projected
body. The decision set is what actually has to agree between the two boundaries,
and it is stable by construction.

Whichever is chosen, say explicitly which fields are excluded from the digest
and state that a projected-digest difference attributable only to excluded
volatile fields is not drift. §13.5's readback-and-validate step needs the same
treatment: the persisted body will carry the execution-time `ts`, so a readback
comparison against an explain-time projection must compare the decision set, not
the bytes.

### R2-m1 — `parseEvents` yields byte offsets; §11.3 requires one-based line and column

Severity: **Minor**. Sections: §11.2, §11.3.

The event ranges I verified are character offsets into the source
(`valueStart: 26, valueEnd: 39`), not line/column pairs. §11.3 mandates
"one-based line and column" in both human and JSON diagnostics.

The conversion is trivial and deterministic — a newline index over the
normalized-LF source — and §11.2 already requires fixtures proving "per-field
line/column mapping (including nested collections and quoted/block scalars),"
so the obligation is captured. I raise it only so the offset-to-position
conversion is named as a component with its own fixtures rather than assumed to
fall out of the parser, since it is the part that gets subtly wrong on CRLF,
multi-byte characters, and block scalars.

State whether offsets are over UTF-8 bytes or UTF-16 code units, and require a
fixture with non-ASCII content in a human `explanation` field. That field is
free prose and will contain non-ASCII eventually.

### R2-m2 — B1 shipping without the cache imposes a full parse-and-validate on every command in the interim

Severity: **Minor**. Sections: §22, §24 (B1/B2), §20.1.

I accept the B1/B2 boundary (see the concession above). But the revised §22 step
1 — "Ship the guidance catalog, schema, validator, and source resolver with
trust and divergence behavior; add the compiled cache separately" — has a cost
the spec does not name.

§11.4's operational refusal and §12.2's hot path both assume the manifest is the
first read. Without B2 there is no manifest, so between B1 and B2 every ordinary
`aitm` invocation must resolve, read, parse, and fully validate the YAML catalog
in-process before it does anything else — including the commands that do not
need guidance content at all, since the refusal must fire "before network
access, lock acquisition, session mutation, issue mutation, guard execution, or
provider action." §20.1's "one YAML parse and full validation per unchanged
source/runtime identity" is unmet for that entire interval.

This does not change the split. It changes what B1 must measure and disclose.
Add to B1 either (a) a stated acceptance bound on cold parse+validate cost, so
the interim regression is bounded and visible, or (b) an explicit note that B1
and B2 land in the same release and the interim is not shipped to consumers.
Option (b) is cleaner if the release cadence allows it, and it costs one
sentence.

---

## Standing agreements from round 1

These remain settled and I am not reopening them: §8.1's placement under
`.ai-task-manager/`; §8.2's no-merge, no-fallback, no-auto-create, untracked-is-
invalid rules; §10.1's five-digest split and the human-edit/agent-receipt
independence; §10.3's disclaimer that fingerprints are not publisher attestation;
§11.2's rejection of anchors, aliases, merge keys, and custom tags; §12.1's
exclusion of gzip, V8 serialization, SQLite, and custom binary formats; §12.4's
atomic-rename-then-manifest-last ordering and lock-free concurrent compilation;
§19's separation of annotation failure from mutation authority; §5.4's "free
text is data."

Added this round: §13.5's normalizing-precondition concept, §14.1's legacy
refusal disposition, §13.6's action vocabulary decision, §20.3's live-authority
cost model, and the §24 A1/A2 and B1/B2 decomposition.

---

## Verification performed this round

- Re-read the full revised source and the complete diff
  `a650be5a..b327d739` against the specification.
- Executed a `js-yaml` 5.4.2 probe confirming `parseEvents` exports, scalar
  `valueStart`/`valueEnd`, anchor and tag ranges, a distinct `EVENT_ALIAS`,
  duplicate-key rejection by `load`, and `CORE_SCHEMA` leaving `<<` unmerged.
- Confirmed `package.json:2` declares `@kburson/ai-task-manager`, and that this
  worktree's self-link is the unscoped `node_modules/ai-task-manager -> ..`.
- Confirmed `ENTRY_CEILING = 784` and the separate recovery allowance in
  `package-boundary.test.mjs`.
- Confirmed `git rev-parse --git-path index` resolves correctly in this linked
  worktree.
- Confirmed both replacement documentation anchors exist at the cited headings.
- Confirmed the third conditional pass (`refreshPreRefineContiguity`) and the
  two byte-for-byte banner compatibility contracts at
  `guard-execution.mjs:258` (#355) and `:316` (#359).
- Confirmed `functional-dod-derive.mjs` is 118 lines with a pure transform and
  no network access outside `mutateIssueBody`.
- Confirmed `actionPolicyFor` returns a `delegate` (`actions.mjs:91-92`).
- Re-derived the 9,745-token increment for both adapters.
- Read `stampEvidenceMarker` and confirmed `ts` and `sha` are written into the
  marker — the basis for R2-B1.

I found no claim in the author response that overstated its evidence.

---

## Requested next step

R2-B1 needs a normative answer — it is two sentences in §13.2 and one in §13.5,
but left as-is it specifies a field that cannot do its job and invites an
implementation that deadlocks explain-then-execute. R2-m1 and R2-m2 can be
batched with it.

If R2-B1 is resolved as described and the two minors are dispositioned, I expect
to recommend terminal acceptance in round 3. Nothing here is accepted by
silence; I will review against the next source digest.
