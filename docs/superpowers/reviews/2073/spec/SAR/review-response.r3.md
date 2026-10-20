# #2073 specification SAR — round 3

Reviewed input: [spec.r2.md](spec.r2.md), SHA256 `5820102f7e5e775b0067bfa294f33a663b619e0ebed546c0cc22d543c2e5f651`.

Verdict: **Revise for formatting; no new substantive design finding.** The entire r2 document was reread, including the new identity envelope, resource limits and deterministic comparison language. Source rechecks covered publication checkpoints, pending/unknown write outcomes, final-authority checks, exact subject schema and the retained extraction source-plan Tasks 23, 28 and 31. F1–F10 remain addressed at document level.

## F11 — P3: Canonical specification does not pass the repository formatter

Fresh command `node node_modules/prettier/bin/prettier.cjs --check docs/superpowers/specs/2026-10-20-2073-refinement-graphql-traffic-design.md` exited 1 and reported formatting issues. The current tables need repository formatting before the canonical result is handed off for commit. This is a presentation/verification issue, not a new design defect.

Required revision: format only the canonical specification, preserve all historical snapshots unchanged, save the formatted bytes as spec.r3.md and review that exact final input. No substantive requirements should change.

## Full-document substantive conclusions

The root admission path has a strict body/structure decision, bounded phase checks and explicit non-atomic limitations. The writer contract distinguishes validation from authorization; strict typed target/null evidence, per-invocation read scopes and fresh post-write/recovery reads preserve the native protocol. Additional node IDs stay outside sealed schemas. Numeric resource limits and equivalent fallback validation are explicit. Production routing, a rerunnable pinned baseline, independent request-family/total ceilings and outcome equivalence protect the measurement claim. Leaf shape, parent overhead and publication dispatch improvements are separately defined. Source-story extraction is prospective; the old plan does not itself authorize independent delivery. The four-hour budget is explicitly unvalidated and gated before implementation; no scope split or budget change has been approved.

No source, tests, configuration, task state or remote authority changed. The formatter check is document validation only; no implementation tests or empirical savings are claimed. Final formatted-input review remains outstanding.
