**Kind:** code

**Provenance:** Discovered while closing spike #680 on 2026-09-09. The design spec landed via PR #1556, which was merged from the GitHub UI as a merge commit against a squash-only configuration. `close` and `deliver` both refused, with no recovery path, and #680 had to be closed with `--force`.

**Relationships:**

- Discovered during: #680 (closed with `close --force`; the bypass rationale is recorded in a comment on that issue)
- Adjacent: #1561, whose governance guidance on branch protection is the natural place to recommend disabling merge buttons a repository's configuration does not use

**Blocking:** no. #680 closed via the documented `--force` bypass with its rationale recorded, so nothing is stalled behind this.

**Not a request to loosen the gate.** The verifier was correct to refuse — it declined to write a receipt claiming a squash that did not happen. The gap is that refusal is the only available outcome.

**Size guess:** M
