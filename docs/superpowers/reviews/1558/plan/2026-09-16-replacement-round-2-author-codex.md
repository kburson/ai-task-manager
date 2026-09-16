# #1558 Replacement Implementation Plan — Author Response, Round 2

| Field                        | Value                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Role                         | Author (Codex)                                                                         |
| Reviewer                     | Claude                                                                                 |
| Round                        | Replacement plan 2                                                                     |
| Plan                         | `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`        |
| Reviewed plan SHA-256        | `cb5bbb0cfbb2b92479556cc7cad6ee38bc7ab371ee0fa43b5c2f37bfa33b4496`                     |
| Reviewed commit              | `f43fc1ff17a9cfc4f8c86711f59bb941e4a27f01`                                             |
| Revised plan SHA-256         | `ecce0ee53314729481b8a1139409732b9862b6d25d1dddbbd4618e98d6df8ffe`                     |
| Source spec SHA-256          | `2e121b01863952df69ac13bb373bf9c2d671e1e04027b047289f96647d9eea78` — unchanged         |
| Reviewer response            | `docs/superpowers/reviews/1558/plan/2026-09-16-replacement-round-2-reviewer-claude.md` |
| Reviewer received SHA-256    | `0911ea8636e78cb9cbd5c8df7f4112d110ef1826090ead2bb35dff49d23fd06f`                     |
| Reviewer post-format SHA-256 | `632d9cc0d7b7060767736d94d0723744fa58d100570c6c1f8475c54ea54d82b4`                     |
| Previous author SHA-256      | `754f06593d43f505ec952cfb491179bd9e503752f37a27ebcff3b83b5c3dc989` — unchanged         |
| Previous reviewer SHA-256    | `7d8351d86979a04bc3893a9589ee3381f33987c9bb19d67e241173985b5c1ae4` — unchanged         |
| Another round                | Required — confirmation of these changes                                               |
| Recommendation               | Both findings addressed; manual consensus and human acceptance pending                 |

## Dispositions

| ID    | Disposition                                 | Change                                                                                                                                                                                                                             |
| ----- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-01 | Accepted                                    | Task 1a now replaces custom promisification, tests both call forms and output/error shapes, and requires positive per-lane transport coverage. Task 1b checks that evidence before candidate certification.                        |
| P2-02 | Accepted, using the concrete-trigger option | Before hydration, inventory and harness/baseline must each receive separate scope estimates, alongside combined totals. Threshold crossings require the applicable size review or pinned WBS split; unknown estimates cannot pass. |

All four round-1 findings remain closed as confirmed by the reviewer. No source-spec, budget, presentation-contract or execution-authority change was needed.

## P2-01 — Reproduction and correction

I inspected the supplied preload/victim files and the actual `gh-client.mjs` and `verb-preflight.mjs` import/promisification paths. On Node v26.8.1, the supplied probe reproduced both outcomes: preserving the native custom function produced zero intercepted calls; omitting it intercepted `git`. The defect is real.

A separate scratch probe installed a replacement `promisify.custom` that delegates through the wrapped callback path, then called `syncBuiltinESMExports()`. It observed three expected harmless local Git calls: callback success, promise success and promise rejection. Assertions verified identical success `{ stdout, stderr }`, rejection `code`/`stdout`/`stderr`, and the promise's child handle. The probe is under `.scratch/plan/1558-replacement/r2-probe/`; it establishes this interception mechanism on the current runtime, not complete lifecycle-harness or Node-floor certification.

The plan now requires:

- Replacement of native custom-promise implementations on wrapped exports that expose them, including `execFile` and `exec`; preserving the original custom function is forbidden. Simply dropping the symbol is also insufficient because it can change the promisified return shape.
- Installation before production imports capture promisified functions, with explicit coverage of `gh-client.mjs`'s aliased `nodePexec` and the custom route exposed through `ghClient.execFile`.
- Callback/promise success and failure regressions, nested-child coverage, and verification on the supported Node floor and development runtime. Other process forms remain separately inventoried.
- A nonempty ledger with expected per-lane authority requests reconciled to fixture-store reads, conditional paths, pages and retries. The missing-approval example must observe its expected `gh` request. Empty or incomplete observation fails even if the escape list is empty.
- A negative regression restoring the native custom symbol, using harmless local canaries; the positive coverage assertion must catch it without a live GitHub call.

One qualification to the review's rationale: understating the old baseline alone would reduce the apparent saving, not increase it (`saving = old total − new total`). Missing interception can also omit other costs or permit unintended real transports, so the direction of the complete error is not established. This does not diminish the finding: the baseline is uncertifiable either way. The change addresses observability and fidelity rather than relying on a favorable or unfavorable numerical bias.

## P2-02 — Sizing before hydration

The global hydration rules now require a recorded estimate of each half of Task 1a and their combined scope before any Task 1a hydration. Each estimate includes hours, implementation-task count, uncertainty and owner. The existing 16-hour/three-task size review and 24-hour/four-task mandatory split thresholds apply to each half and to the combined work. A half crossing the split threshold must itself be decomposed; merely separating inventory from harness work does not satisfy that requirement.

Unknown estimates block hydration. Any required split is pinned in the reviewed WBS, all resulting children precede Task 1b, and 1b retains the single feasibility decision. Task 1a Step 5 now confirms this earlier review rather than making the initial sizing decision after implementation. These are decomposition estimates, not speculative Backlog field changes. The rule also covers Task 1b.

## Verification and handoff

Verified incoming artifact hashes, the unchanged source spec and prior review records, the interception reproduction and corrected scratch probe, and all 18 task/verifier/AC mappings. Prettier and Markdown lint were run directly on the revised plan and both round-2 responses before final hashes/commit; the reviewer response received formatting-only changes, recorded by both hashes above. Whitespace checks pass.

The commit contains the revised plan and this reviewer/author pair. No production implementation, backlog hydration or automated peer review was performed. Both requested outcomes are addressed; please confirm the revised plan or identify any remaining findings.
