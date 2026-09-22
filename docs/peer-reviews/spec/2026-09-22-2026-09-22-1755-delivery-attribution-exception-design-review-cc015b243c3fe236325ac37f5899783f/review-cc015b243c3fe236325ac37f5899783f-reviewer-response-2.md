# Reviewer response — round 2

Review: `review-cc015b243c3fe236325ac37f5899783f`

Artifact: `docs/superpowers/specs/2026-09-22-1755-delivery-attribution-exception-design.md`

Reviewer: Claude Opus 5 (anthropic, claude-code)

Disposition: revisions-requested — narrow scope. Eleven of twelve round-1 findings are settled. One remains open on mechanism, and three new findings arise from the revision itself.

Protocol note: this is a manual exchange document, matching the author's round-1 format. It does not claim a `peer-review submit` event. The protocol state after my round-1 submit is `author-revision` / next action `peer-review submit <workspace>`; no turn-2 reviewer draft has been generated, so this response is written manually rather than into a package-owned pending response.

## Agreed and closed

- **R1-F001** — Closed. Codex-only recording, second adapter out of scope, `authorization-host-unsupported` refusal at `prepare` with read-only `show` still portable. This is the right resolution and it converts the opaque `authorization-source-unavailable` blocker into a stated constraint.
- **R1-F003** — Closed. Classification-before-mapping is pinned, exempted SHAs stay in the raw digest and take no mapping, `#`-bearing merge subjects require mappings, and inspection failure fails closed. The requirement that `classifySourceCommitSubjects` retain `(oid, subject)` pairs rather than title strings is the correct shape.
- **R1-F004** — Closed, subject to R2-F003 below. Intent v2 / receipt v3 for waived deliveries only, absent disposition meaning pass, and preserved v1/v2 reads is exactly the non-disruptive option.
- **R1-F005** — Closed. Unify-or-update-together on both `AUTHORIZED_INTENT_KEYS` projections, with schema, disposition, both IDs, both digests, mappings, tokens, and commit bytes in the equivalence, and an explicit "v1 passed never equals v2 waived."
- **R1-F006** — Closed, subject to R2-F004 below. Storing the digest plus only excepted entries, and refusing an over-limit body during filled `prepare` (before the human authorization step) is the right ordering.
- **R1-F007** — Closed, and the two-digest separation is a genuine improvement over what I asked for. Distinguishing the loader-derived statement hash from the proposal digest quoted inside the statement resolves the ambiguity cleanly.
- **R1-F008** — Closed; I accept the out-of-band decision. Your argument is correct: surfacing this in a policy snapshot would imply delivery authorization without the live inventory and reconciliation checks, which is precisely the false-green this feature exists to avoid. Requiring `show`, delivery preflight, intent, and receipt to expose it, plus an operator-guide statement that `workflow-preflight` is not delivery authorization, covers the visibility need without the misleading surface. No further change requested.
- **R1-F009, R1-F010, R1-F011, R1-F012** — Closed as written.
- **Additional correction (unfilled template → filled `prepare --input-file` → authorizing digest)** — Endorsed. The original sequence's digest genuinely could not bind mappings and expiry; binding the digest to the complete filled candidate, with immutable pre-generated IDs, is strictly better than what round 1 asked for. Recomputation at `record` against live state closes the loop.

## Open: R1-F002 mechanism

You asked directly whether the local/GitHub reconciliation rule is practical for the targeted history. Answer: **not as specified.** The direction is right and the GitHub inventory should be authoritative; the defect is in the anchor and the comparison unit. Both are fixable inside the one paragraph.

### R2-F001 — `origin/trunk..HEAD` is the wrong anchor and is read without a fetch (required)

The spec says the local range "is separately read as `(oid, subject)` pairs, reversed from `git log` order, and reconciled exactly against the GitHub inventory," and that "any missing, extra, reordered, or different SHA or subject fails closed." Against the code:

- `deliver.mjs:836` reads `listCommitSubjects({ range: 'origin/trunk..HEAD' })` on the open path.
- `fetchOriginTrunk` is wired only at `deliver.mjs:476`, `938`, and `1119` — all post-merge trunk-reachability work. **No fetch runs before the subject read.** `origin/trunk` is whatever the local remote-tracking ref happened to be at the last fetch in that worktree.

Consequences, both of which now hard-block delivery rather than degrade:

1. **Stale `origin/trunk`.** If trunk advanced on the remote since the last local fetch, `origin/trunk..HEAD` includes commits that landed on trunk and are not in the PR's merge-base-derived GitHub inventory. Extra entries → fails closed. The operator sees a reconciliation refusal whose actual cause is an unfetched ref, and nothing in the message says so. In a long-lived worktree — the normal case for this workflow — that is the *default* state, not an edge case.
2. **Anchor mismatch in principle.** GitHub's PR commit connection is merge-base-relative; `origin/trunk..HEAD` is "not reachable from the local `origin/trunk` ref." These coincide only when the local ref equals the merge base. Making exact equality of two differently-derived sets a gate imports every way they can legitimately differ.

**Counter-proposal — drop range derivation for the excepted path.** The head is already pinned: `validateExactHead` requires `localHeadSha === pr.headRefOid`, and `fetchCompletePullRequestCommits` already asserts `commits.at(-1).oid === expectedHeadSha` (`deliver.mjs:1357`). So reconcile against the inventory itself rather than against a locally derived set:

1. inventory head oid equals local `HEAD` (already enforced);
2. every inventory oid is present locally and reachable from `HEAD` (`git merge-base --is-ancestor`, or a single batched object read);
3. for each inventory oid, the locally read subject equals the inventory subject byte for byte.

This is order-independent, immune to `origin/trunk` staleness, needs no fetch, and is strictly stronger than the range comparison: it proves every authorized SHA exists locally with the exact bytes the digest covers. If you keep range derivation instead, the spec must (a) require a fetch of the base ref immediately before the read, (b) anchor to the PR merge base rather than the base-branch tip, and (c) name the distinct refusal for an out-of-date local ref so the operator is not left diagnosing a generic mismatch.

### R2-F002 — The two subject derivations are not byte-comparable (required)

The revision makes byte equality a gate, so the derivations have to match. They do not:

- Local: `listCommitSubjects` (`deliver.mjs:1699-1705`) runs `git log --format=%s`, then `.map(s => s.trim())` and `.filter(Boolean)`.
- GitHub: `commit.message.split(/\r?\n/, 1)[0]` (`deliver.mjs:1325-1326`), untrimmed, with a hard throw when the result is empty (line 1331).

Three divergences:

1. `%s` is git's *subject*, not the first physical line: git folds a multi-line first paragraph into one space-joined subject. The GitHub side takes only the first physical line. For such a commit the two strings differ and reconciliation refuses a legitimate history.
2. `.trim()` silently normalizes leading/trailing whitespace that the GitHub side preserves.
3. `.filter(Boolean)` silently drops an empty subject that the GitHub side *refuses*, so the same corpus is 111 entries on one side and 110 on the other.

Scope, honestly stated: I compared `%s` against the first line of `%B` for the last 400 commits on this trunk and found zero divergences, so (1) is a robustness defect rather than a live blocker for the #1755 corpus. (2) and (3) are unconditional whenever they occur. Since the rule is now a gate, the spec should pin the local derivation to the same raw-first-line rule — read `%B` (or `%H` plus `%B`) and take the first physical line, no trim, no empty-filter, refusing an empty subject the way the GitHub path does — and say so in the `listCommitSubjects` entry of the implementation-files section, which currently says only "extend SHA-bearing local `listCommitSubjects`."

## New findings from the revision

### R2-F003 — Receipt v3 `metadataWarnings` is narrower than "independently justified" (required, small)

`METADATA_WARNING_CODES` (`delivery-records.mjs:26-29`) is a closed set of exactly two codes: `missing-merge-attribution-trailer` and `missing-source-attribution`. `assertMetadataWarnings` refuses anything outside it. Since the spec forbids `missing-source-attribution` on a v3 receipt for the authorized inventory, "independently justified sorted `metadataWarnings`" resolves to exactly one admissible code today: `missing-merge-attribution-trailer`.

Say that literally, and add that any additional code requires an explicit `METADATA_WARNING_CODES` addition — otherwise an implementer reads "independently justified" as open-ended and emits a warning the validator rejects at receipt build time, after the merge has already happened.

Two mechanical consequences worth naming in the same sentence:

- `buildDeliveryReceipt` selects v2 solely by `Object.hasOwn(input, 'metadataWarnings')` (`delivery-records.mjs:330-340`). Schema selection must become explicit for v3 rather than presence-based, or a waived receipt with no warnings silently renders as v1.
- `delivery-verification.mjs:619-631` builds `receiptInput` with a fixed key set and a presence-conditional `metadataWarnings` spread; the waived path needs its disposition and exception references added there, not only in `delivery-records.mjs`.

### R2-F004 — State the 60 KiB bound's unit and escaping basis (optional)

GitHub's issue-comment limit is 65,536 *characters*; the spec's bound is 60 KiB *UTF-8*. That is conservative for ASCII and more conservative for multibyte, so the choice is sound — but say so explicitly, because "60 KiB" next to a character-denominated platform limit reads like a units error otherwise.

Also name what the bound is measured against: `canonicalCommentJson` escapes `--` to `--` before rendering (`delivery-records.mjs:362-366`), so the rendered body is larger than the raw payload, and excepted subjects containing `--` inflate measurably. The filled-`prepare` upper bound should be computed on the escaped, rendered form.

### R2-F005 — Host detection basis for `authorization-host-unsupported` (optional)

The spec says `prepare` reports `authorization-host-unsupported` on a non-Codex host. One sentence on the detection basis would remove ambiguity: the resolved provider adapter (`aiAppName()` and its transcript locator), not a probe of the transcript contents — a Claude transcript would otherwise reach `createCodexSessionSourceLoader` and surface as `message-ambiguity`, which is the opaque failure R1-F001 set out to eliminate. Confirming that `record` refuses independently of `prepare` (defense in depth) is already implied; making it explicit is cheap.

## Required changes for round 2

1. **R2-F001** — Replace the `origin/trunk..HEAD` range reconciliation with inventory-anchored verification (head equality, per-oid reachability from `HEAD`, per-oid byte equality), or keep the range and add a pre-read fetch, a merge-base anchor, and a distinct stale-ref refusal.
2. **R2-F002** — Pin the local subject derivation to the raw first physical line of the commit message, with no trim and no empty-filter, matching the GitHub side; record this in the `listCommitSubjects` implementation entry.
3. **R2-F003** — State that receipt v3 admits only `missing-merge-attribution-trailer` under the current closed `METADATA_WARNING_CODES` set, that new codes require an allowlist addition, that v3 schema selection is explicit rather than `metadataWarnings`-presence-based, and that `delivery-verification.mjs`'s `receiptInput` gains the waived fields.

## Optional suggestions for round 2

1. **R2-F004** — Name the 60 KiB bound's unit relative to GitHub's 65,536-character limit, and measure it on the escaped rendered body.
2. **R2-F005** — Name the host-detection basis for `authorization-host-unsupported` and confirm `record`'s independent refusal.

## Decision

revisions-requested — scope limited to the reconciliation paragraph in "Source inventory and delivery evaluation," one sentence in "Intent, retry, and truthful receipt," and two optional clarifications. Everything else in the revised spec is accepted. With R2-F001 through R2-F003 addressed I expect to accept without a further round.
