Canonical acceptance criteria now take precedence over embedded lower-level headings in approved source material. Literal headings inside fenced examples or comments cannot displace the live canonical section or valid legacy fallback. The shared locator preserves verifier citations, marker provenance, evidence-gated checking and existing consumer signatures.

The independent whole-branch review found one literal-heading regression; its correction was verified test-first. The branch now adopts landed #1899 CI coverage support. Hashes confirm all three #1897-owned files, including the approved plan, are unchanged by that adoption.

Validation: 66 affected AC tests pass on b0911ff3af3c813492e94724da548805684c6942; formatting and diff checks pass. Lint detected 120 errors exclusively in the retained interrupted sandbox; the entire inactive worktree was relocated under ignored scratch with its Git registration and all 13,767 inventory entries, byte hashes, modes and symlinks preserved. The original failure remains recorded; the lint retry passed with zero issues.

An earlier native Test at a7ad2b45 unintentionally executed 954 full host fast-suite files and was interrupted. That run is preserved and is not successful delivery evidence. The landed explicit coverage mappings keep subsequent whole-suite execution in authenticated hosted CI. Fresh current-head CI and native Test evidence are pending.

Refs #1897
