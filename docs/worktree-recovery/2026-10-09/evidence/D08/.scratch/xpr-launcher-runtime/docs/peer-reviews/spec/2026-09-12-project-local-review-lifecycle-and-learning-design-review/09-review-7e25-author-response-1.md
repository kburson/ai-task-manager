<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7e25eb3b042cddffce22259d099bbdc0"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-12-project-local-review-lifecycle-and-learning-design.md"
artifact_commit: "239de38c342c30694b6787ef8267274b464324c5"
artifact_blob: "f536ac2ec72e3398a2944a247565fb7237e57adb"
artifact_digest: "sha256:d40a8669d587735fcfa07102f0df315943a55950846e1224607097ccdc64faa9"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-5"
  model_display: "Codex GPT-5"
  session_fingerprint: "sha256:456d5a7897c12020d183e80d52838e2d15823217d106281afe30cf7c7065e08f"
  identity_source: "runtime"
started_at: "2026-09-12T23:39:00.355Z"
submitted_at: "2026-09-12T23:45:08.262Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Closed the remaining concurrency gap by defining a sealed reviewer interval
from boundary installation through reviewer submission or governed
intervention, including pending and interrupted delivery. Also made ranking
statistics and tie-breakers snapshot-local so unrelated indexed branch events
cannot change selected context.

## Finding dispositions

- `R1-F001` — Accepted. Initial join installs the seal atomically under the
  mutation lease, and author submission registers the next sealed interval
  before releasing the same lease. Resume never replaces its ref baseline.
- `R1-F002` — Accepted. All lexical, embedding, normalization, and tie-breaking
  inputs must derive solely from the pinned snapshot and recorded retrieval
  configuration.

## Changes made

- Defined the complete sealed-reviewer interval, its only terminal transitions,
  and its persistence across pending delivery, suspension, process loss, and
  recovery.
- Added a delayed-resume two-worktree test and an interruption test covering the
  handoff-to-activation gap.
- Prohibited post-scoring snapshot filters over shared FTS5 statistics and
  allowed snapshot-scoped tables or provably independent scoring.
- Added a fresh-clone versus unrelated-branch-index retrieval equivalence test.

## Declined changes and rationale

None.

## Verification

Validated the seal timing against current author submission and reviewer
boundary checks, and evaluated the FTS5 scoring concern against SQLite's
corpus-level ranking behavior. Preserved generated response metadata, ran
Prettier and Markdownlint over the design, and ran CSpell, placeholder scans,
and `git diff --check` over both files.
