# #2039 plan SAR round 3

Same requested/used `gpt-6-astra` / `high` reviewer. Exact formatted input `plan.r2.md`, SHA256 `94520939e2e126d51a21f75385bbdc86c8f2d766e6f7b40482999d4587b0bd44`. The full plan and named schema/seed interfaces were reread; the native timing event catalog and workflow scope-identity implementation were inspected.

## Findings and dispositions

### P2 F12 — Retention input and seed identifiers did not match concrete contracts

The manifest is now a generation pointer, while the retention helper inspected dirtyKeys/batch as if they lived in the manifest. The timing seed used an invented `timer:paused` slug; the receipt seed used a transition ID outside the native move-UUID format. Cache hex digests versus native prefixed record hashes and authorized title staging also needed explicit interfaces.

**Disposition:** Retention takes the loaded generation and refuses missing data; the store validates pointer/payload integrity first. Seeds use canonical `paused` and a valid move UUID. The plan distinguishes cache hex hashes from native `sha256:` values and adds title staging into the single final issue mutation. These changes do not add a separate title write or new automatic publication event.

### P1 F13 — Timing aggregation must distinguish interval deltas from cumulative totals

The new normalized event shape allowed measured seconds but did not explicitly say whether they were per-interval or cumulative. Repeated native timer snapshots summed as events could double count real work even with different event IDs.

**Disposition:** Required nonoverlapping native interval deltas derived once from the existing cursor semantics, retained backdated identity, and restart/repeated cumulative-snapshot tests. Unknown stays null, never zero; no competing timer clock is introduced.

## Result

**Revise.** F12–F13 addressed in formatted `plan.r3.md`, SHA256 `3c521e094970f306a47a409422368f3eacdc586fbf55a531336d0cb340defc55`. Static document parsing found twelve valid JavaScript seed programs, twelve task headings, twelve verifier labels and twelve shell verifier blocks. That is syntax/structure verification, not test execution or provider-budget proof.
