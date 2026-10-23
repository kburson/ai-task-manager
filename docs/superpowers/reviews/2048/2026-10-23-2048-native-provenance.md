# Issue 2048 native execution provenance

<!-- cspell:ignore dcfc -->

## Origin and proof limits

Actual worker chat and native SID:
`01a16802-877c-7092-a221-780a859a2313`.
Physical checkout:
`/Users/kpburson/.codex/worktrees/5dc6/ai-task-manager`.
These are the worker's own app checkout and identity. No SID/project override,
foreign-worktree allowance, hand-edited binding, hook disabling, replacement
worker or alternate proof transport was used.

The three files named `2048-native-hook-<nonce>.json.consumed` in `evidence/`
are byte-for-byte copies of the original native hook diagnostic transport
files. They are not rebuilt from the CLI result. The original files remain in
`.tmp/aitm/native-binding-proof/<SID>/`. Their copied bytes, sizes and hashes
are in the manifest. They retain native observation time and hook tuple.

The CLI and hook origins are genuine native tool invocations in this chat.
CLI completion outputs and hook additionalContext are retained in the chat
history; no standalone raw CLI stdout file was captured at those moments.
The tables below are documentary transcriptions of those actual results,
not newly generated CLI receipts or substitute hook proofs. No proof command
was rerun during evidence collection. The diagnostic itself states that local
transport is not mutation authority or cryptographic attestation.

The proof's `sourceHead` field is computed by Git at the physical invocation
root. It identifies invocation HEAD, not the hash or path of the guard code
loaded by the host. Historical loaded guard module paths/hashes were not
independently captured by the proof schema. They must not be inferred from a
matching `sourceHead`. The current candidate's `.codex/hooks.json` is copied
as `2048-hook-config-snapshot.json`: it describes configured scoped-package
then repo-relative resolution, but that current snapshot alone does not
attest the host's effective historical loaded hook source. The setup did
verify the dogfood self-link to this checkout. None of these observations
converts an invocation-source pin into an unobserved loaded-guard pin.

## Native identity and canonical setup

Separate native invocations, without environment assignments:

| Command | Actual stdout | Actual exit / origin |
| --- | --- | --- |
| `printenv CODEX_THREAD_ID` | `01a16802-877c-7092-a221-780a859a2313` | 0; chunk `edb702` |
| `printenv CODEX_SESSION_ID` | `01a16802-877c-7092-a221-780a859a2313` | 0; chunk `82b512` |

Initial pwd and Git root both identified the physical checkout above. Git was
clean at `8d051fffcbca2035aecef2eb136de7b343fd6601`, detached HEAD. Canonical
setup was invoked once as the exact standalone command
`bash scripts/dev-env/setup-local-worktree.sh` from that checkout. Initial
session 69590 / chunk `e0c754`; completion chunk `a123be`, actual exit 0.
It installed dependencies, repaired and verified the self-link to the physical
checkout and reported GitHub CLI authentication available. No hooks setting
was changed. npm reported 14 dependency vulnerabilities and blocked the
Puppeteer installation script under existing allowScripts policy; no audit
fix or policy change was attempted.

Initial Start exited 12 with the registered worktree-relocation prompt, before
mutation. The authorized `--confirm-relocation` retry exited 0 and bound #2048.
No occupancy force or steal occurred. Fresh Explain, native status, actor
state and main-root occupancy API readbacks agreed on the worker SID, physical
root, issue and binding generation. Setup was never repeated for planning or
implementation.

## Three genuine eight-field matches

Every proof used the exact native command grammar:
`env AITM_GRAPHQL_USAGE=1 TT_FULL_AUTO=1 npx aitm doctor --json --binding-proof NONCE`.
For all three, actual CLI completion was 0 with healthy, bound and matching
results, no mismatches, and genuine hook additionalContext carrying the same
nonce and eight tuple fields. The CLI output was independent of the hook
additionalContext, with normal native exec and no constructed hook payload.

| Proof | Nonce | Native exec / completion origin |
| --- | --- | --- |
| Initial canary | `ec5951642052d54df83919be786c118e18a523afbdcefc1a` | Session 64248; start chunk `539944`; final chunk `3cd533` |
| After native draft branch | `277a200db409206cc4dc588777d77ed6e5f3f86822644cb2` | Session 76274; start chunk `914287`; final chunk `54d146` |
| After admitted Develop and authorized fast-forward, before product writes | `022c3982aea83f6b60b3fc9b0f50103a1f3defdf75ea7e44` | Session 90709; start chunk `924333`; final chunk `dcfc10` |

| Tuple field | Initial canary | Draft branch | Pre-product Develop |
| --- | --- | --- | --- |
| sessionId | `01a16802-877c-7092-a221-780a859a2313` | same | same |
| root | physical checkout above | same | same |
| branch | `HEAD` | `codex/2048-draft` | `codex/2048-draft` |
| sourceHead | `8d051fffcbca2035aecef2eb136de7b343fd6601` | same | `c0ca120cc8a08d3bc74887daac5ba1f50b436fce` |
| issue | `#2048` | same | same |
| bindingGenerationId | `8e66591a-480e-405e-aa8b-eea216c39680` | same | same |
| state | `ready-for-plan` | `plan` | `develop` |
| entryStartTs | `2026-10-23T09:07:18.586Z` | `2026-10-23T10:02:41.986Z` | `2026-10-23T10:17:05.310Z` |

The first proof was paused with native exit 0 pending controller acceptance.
After planning, a separate native Pause exited 0. The controller then
explicitly authorized implementation. Ordinary Start, fresh Explain and
native Plan-to-Develop promotion completed with exit 0 before the authorized
`git merge --ff-only codex/2039-draft`, exit 0, to exact c0ca120cc. This
fast-forward changed only accepted documentation/offline fixture corrections;
the third proof occurred before this worker's product writes.

## Source candidate, trace and Pause

Native source commit exited 0:
`4fd03020d39a2c0c1bd5a303e99bdfdb6881f585`.
Subject: `[#2048] Validate immutable completion receipts and historical timing subsets`.
It contains exactly the two owned files and no shared package change.
Native `commit-trace 2048` completed with exit 0, session 6890, completion
chunk `49e87f`, reporting a created canonical trace. The exact named verifier
then completed with exit 0, session 26325, chunk `ff0e0b`, 36/36 tests; its
actual raw log is preserved as `2048-standalone-post-commit.log.gz`.

The binding readback before source-turn Pause remained #2048, this physical
checkout, `codex/2048-draft`, generation
`8e66591a-480e-405e-aa8b-eea216c39680`, Develop, and entry
`2026-10-23T10:17:05.310Z`. Source-turn Pause completed with actual exit 0,
session 66527, chunk `3e69b5`: Unknown active minutes, wall 18 minutes,
+731 words. Git was clean after commit. The product file hashes are in the
source review and manifest.

## Refusals and authority still pending

An optional compound inspection in Ready for Planning was classified
COMMIT_CODE and refused before execution. It stayed unperformed. A nested
apply_patch attempt for planning prose was refused as an invalid patch payload;
that tool did not write a file. The later authorized documentation writer did
not change hooks, config or product scope. No alternate identity or transport
was used to bypass an authority refusal.

Four negative fixture tests initially tried mutating frozen readbacks and one
later fixture copied functions; their actual failed logs are retained and
clearly distinguished from behavioral RED failures. The exact native setup,
binding and proof steps were not bypassed or fabricated.

The optional source-turn ledger append after Pause was hook-refused with
`Native hook session has no active issue binding` and stayed unapplied. The
append is not retried. Required review collateral was separately authorized
by the controller, then ordinary Start resumed this same binding with exit 0.
Fresh collateral Explain exited 0, session 93976, chunk `ca1ba5`, and returned:

- Action `promote`, status `blocked`.
- Guard `develop-exit-code-complete`, code
  `code-complete-ac-evidence-incomplete`, condition `unticked`, section
  `Acceptance Criteria`, with operator-action-required remediation.
- Warning `test-develop-finalization-pending`.
- No normalization and no humanDecision.

Those typed fields remain unresolved. No AC stamp, checkbox tick, stage move,
native Test, Review, approval, Close, Stop, push or controller integration was
performed in this collateral task. GraphQL usage soft-byte/soft-file cap
warnings were visible in native command outputs; no quota bypass was used.
Final native acceptance and exact-head CI remain pending after static review.
