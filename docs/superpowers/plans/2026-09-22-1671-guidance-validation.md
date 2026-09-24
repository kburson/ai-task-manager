# Guidance Catalog Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The accepted #1558 specification and WBS Task 19 remain normative.

**Goal:** Validate a complete offline guidance catalog with precise syntax diagnostics, closed references, bounded content, and deterministic fingerprints before any operational loader can consume it.

**Architecture:** Parse strict UTF-8 through `js-yaml` 5.4.2 events to retain raw field ranges before construction. Apply ten ordered but independently accumulating validation stages to an inert normalized model. Derive completeness from core registries and compute the five §10 digests only from validated semantic data and normalized raw source.

**Tech Stack:** Node.js ESM (`>=24`), `js-yaml` 5.4.2 event API, `node:test`, SHA-256, repository package/doc inventory.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` §§9–11 and accepted WBS Task 19 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Story Intent

- **Beneficiary:** guidance maintainer
- **Capability:** validate a complete catalog with precise independent diagnostics before it becomes operational instruction
- **Need:** malformed YAML, ambiguous references, or incomplete entries can otherwise be mistaken for usable guidance
- **Value or failure prevented:** invalid guidance cannot be silently accepted, partially loaded, or mislocated during repair

## Global Constraints

- Keep `js-yaml` at exact production version `5.4.2`; use `parseEvents` then `constructFromEvents`, never plain `load()` or an unreviewed second parser.
- Treat the catalog as presentation data, not guard/execution authority. No operational entrypoint is wired in this child.
- Decode UTF-8 fatally and build positions over the identical CRLF/lone-CR-to-LF normalized JavaScript string passed to the parser. Lines and columns are one-based; columns count UTF-16 code units.
- Reject aliases, anchors, tags, merge keys, duplicate keys/IDs, unknown schema keys, arbitrary operations/values, and all unresolved references; never partially accept a catalog.
- Accumulate independent errors in deterministic source order. Skip only dependent checks on unusable nodes; bound every excerpt to 2 KiB.
- Preserve package-relative documentation containment and heading/explicit-anchor resolution; this is separate from curated `lint:doc-anchors`.
- Versioned limits: source 1 MiB, 512 entries, 128-character IDs, 64 instructions/entry, 64 items/binding list, explanation 32 KiB, excerpt 2 KiB. Proxy maxima: agent block 1,000; human block 16,000; entry 17,000; agent aggregate 64,000; human aggregate 160,000; normalized catalog 240,000. The complete seed must retain at least 20% headroom.
- Keep the #1671 branch and `[#1671]` commit attribution. Child #1672 owns admission and source trust; #1674 owns cache certification.

## File map and sizing

- `guidance/positions.mjs`: strict decoding, newline normalization, UTF-16 line index/range-to-position.
- `guidance/parse.mjs`: event walk, raw path/range map, syntax/duplicate/forbidden construct diagnostics, then construction.
- `guidance/requirements.mjs`: core-derived required IDs/bindings, agent operation/prohibition constants, versioned field and proxy limits.
- `guidance/documentation.mjs`: package-relative shipped-file containment and explicit/slug anchor resolution.
- `guidance/validate.mjs`: one offline `validateGuidance` pipeline, ten stages, deterministic errors/warnings and normalized model.
- `guidance/fingerprints.mjs`: canonical semantic serializer and five digests.
- `instructions/aitm-guidance.schema.json`: closed schema and versioned limit declaration.
- `instructions/aitm-guidance.yml`: complete minimal lifecycle seed.
- `scripts/tests/helpers/guidance-fixtures.mjs` and `scripts/tests/unit/task-tracker/lib/guidance-validator.test.mjs`: adversarial and packaged-seed VC1.
- `package.json`/`package-lock.json`: production parser and explicit `instructions/` allowlist.

Three reviewable implementation units fit the 20-hour/L Refine estimate: parser/positions (6h), validation/references (9h), seed/fingerprints/packaging (5h). If a fourth unit or ≥24-hour forecast emerges, stop for the accepted WBS split rule rather than absorb it.

### Task 1: Event parser and source positions (6h)

**Interfaces:** `parseGuidanceSource(input)` returns `{normalizedSource, value, ranges, diagnostics}` where `ranges` maps JSON-like field paths to `{start,end}` UTF-16 offsets. `positionAt(offset)` returns one-based `{line,column}`. Parsed `value` is unavailable when fatal syntax/forbidden constructs prevent safe construction.

- [ ] **Step 1 — Write RED parser fixtures.** In `guidance-validator.test.mjs`, assert exact raw offsets and positions for nested flow/block mappings and sequences, quoted/escaped/folded scalars, accent/combining/non-BMP text, CRLF/lone-CR, and the full-source unknown-field fixture. Include `human: { explanation: "😀", bad: true }` in a valid entry; the `bad` key's same-line column is 29 in that substring and compare its full-source location to the normalized-LF copy.
- [ ] **Step 2 — Add rejection fixtures.** Assert diagnostic code/path/range for duplicate mapping keys, duplicate IDs (later stage), explicit tags, anchors, aliases, unquoted and quoted `<<`, and invalid UTF-8 byte sequences. Confirm `parseEvents` exposes raw ranges before value construction.
- [ ] **Step 3 — Run VC1 RED.** `node --test scripts/tests/unit/task-tracker/lib/guidance-validator.test.mjs` must fail on missing parser/validation behavior. If event ranges cannot meet the complete contract, preserve the failing case and stop for manual parser-selection review.
- [ ] **Step 4 — Implement parser and positions.** Decode with fatal `TextDecoder`, normalize newlines once, index LF offsets, walk event stack before `constructFromEvents`, retain key/value raw ranges and duplicate-key evidence, reject tag/anchor/alias/merge syntax before construction.
- [ ] **Step 5 — Run focused parser tests and commit.** Commit only after the parser fixture subset passes; preserve RED/GREEN output in the work log.

### Task 2: Closed validation, registries, and documentation (9h)

**Interfaces:** `validateGuidance({source, sourcePath, packageRoot, profile})` returns the §11.3 result schema with `valid`, `errors`, `warnings`, `catalogDigest`, and, when valid, normalized `entries` and `fingerprints`. `requirements.mjs` reads installed core vocabulary, not candidate-declared completeness. `documentation.mjs` returns `{ok, code, path, line, column}` for each shipped reference.

- [ ] **Step 1 — Write RED validation cases.** Cover each of the ten §11.2 stages, at least two simultaneous independent failures, and dependent-stage skipping. Assert exact JSON diagnostic code/path/line/column/expected/remediation and bounded excerpts. Test unknown top-level/entry/human/agent keys, types, duplicate IDs, missing required summary/explanation, unknown operations and values, invalid typed human examples, missing required core IDs/bindings, bad provenance, and limit+1 failures.
- [ ] **Step 2 — Write RED reference cases.** Derive action IDs from `listLifecycleActions`, guard IDs from the registered guard inventory, remediation IDs from `listRemediations`, and prohibition IDs from the closed v1 set. Refuse invented IDs. Resolve shipped docs under package root only, including explicit HTML anchors and duplicate GitHub-compatible heading slugs; reject traversal, absolute paths, missing files, and escaping symlinks.
- [ ] **Step 3 — Implement requirements and documentation resolver.** Keep the core completeness table explicit and versioned; never read required IDs from YAML. Read only package-shipped docs. Build deterministic slug counters and explicit-anchor index from raw Markdown without interpreting unrelated prose as authority.
- [ ] **Step 4 — Implement ten-stage validator and schema.** Validate source containment/profile, bytes/UTF-8, events, top-level grammar, entry identity/types, closed agent grammar, all references, core completeness, provenance/digests, and budgets. Accumulate independent diagnostics in source order. Define closed schema and constants consistently; fail closed on unknown versions.
- [ ] **Step 5 — Run VC1 focused and commit.** Keep the entrypoint offline/read-only; verify no GitHub, lock, or mutation calls are introduced.

### Task 3: Fingerprints, complete seed, and package contract (5h)

**Interfaces:** `fingerprints.mjs` exports deterministic `agentDigest`, `humanDigest`, `entryDigest`, `catalogSemanticDigest`, and `catalogFileDigest` producers. `validateGuidance` returns those on a valid source; the packaged seed has all core-required IDs and references.

- [ ] **Step 1 — Write RED digest/budget tests.** Assert map-key order does not change semantic digests, list order does; comment-only edits change only file digest, human-only edits do not change agent digest, and agent-only edits do not change human digest. Assert exact normalized-LF bytes and the six proxy limits plus source/field limits at limit and limit+1.
- [ ] **Step 2 — Implement canonicalization and digests.** Sort mapping keys recursively, preserve array order, hash the exact §10 projections, and include raw comments only in file digest.
- [ ] **Step 3 — Move parser and write complete seed.** Move `js-yaml` to production dependency at exact `5.4.2`, update lockfile mechanically, add `instructions/` package allowlist, and author the minimal complete YAML seed with valid shipped documentation references and no operational consumer.
- [ ] **Step 4 — Verify seed and headroom.** Validate the packaged seed and schema offline; record exact source bytes, counts, and proxy totals/headroom for every declared maximum in test output or a tracked fixture. Ensure ≥20% unused headroom without relaxing limits.
- [ ] **Step 5 — Full verification and commit.** Run VC1, `npm test`, `npm run test:slow`, `npm run lint`, `npm run format:check`, and `git log --oneline -1`; review the final diff before exact-head AITM stamps.

### Governed handoff

- [ ] Resolve the WBS Task 19 Story Intent source mismatch through a reviewed source-record amendment before `plan-approve`; do not use a waiver, stale source digest, or a fabricated root fallback.
- [ ] Semantically review the child story against all seven questions, approve the plan under Full-Auto, and promote Plan → Develop one step.
- [ ] Stamp three root ACs from VC1, run Test and Review against committed HEAD, obtain Full-Auto task approval, fast-forward the child into `feature/epic/1558`, push the epic branch, and close #1671.
