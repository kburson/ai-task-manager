# Native worker bootstrap evidence — #2088 and #2107

This report records genuine execution in the existing app-owned worker. It
delivers evidence for the already-delivered bootstrap implementation; it is
not a second implementation, a lifecycle receipt or permission to resume R1.

## Source and independent review

Reviewed runtime source is `d3a2142445e5993aa94291f7ff945ab71555a1ea`, tree
`8f94b6e8c6c96230e6a1087e361b8dcb5761c198`. Required independent GPT-6.1
Sol/medium review against `64aa8c278dba7f92c60bdca55b694518f028076a` found no
unresolved findings in the original bootstrap scope, including the later
branch-renewal helper integration. Source, tests and review limitations are
recorded on [original #2088](https://github.com/kburson/ai-task-manager/issues/2088)
and [wrapper #2107](https://github.com/kburson/ai-task-manager/issues/2107).

The worker used accepted `8116f04e3d6f626ffa2d9babe981cb7e6c7585d7`. Its only
commit difference from that runtime source is #2105's factual report;
runtime, package and lock paths are unchanged. This report's own Git commit
is a separate delivery identity and requires fresh exact-source gates.

## Actual native bootstrap

Existing worker chat `01a16802-877c-7092-a221-780a859a2313` retained its old
`5dc6` checkout and created a native managed worktree at
`/Users/kpburson/.codex/worktrees/2107-native-runtime-canary/ai-task-manager`.
Old roots, branches, ignored evidence and failed attempts remain preserved.
The worker did no #2048 leaf implementation.

The first active turn successfully ran setup and Start but later hooks still
invoked the old directory. That mismatch refused Explain and cleanup before
execution. It was retained as a failure, not counted as a successful proof.
After that turn ended, the app's persisted working directory changed to the
new root. A fresh turn independently verified actual directory, native
identity and existing binding before successfully proving and releasing it.
No setup or Start was blindly retried while its claim was uncertain.

The final observation began in the corrected native default directory with
clean source, no binding, no active timer and no occupancy. The exact
standalone command `bash scripts/dev-env/setup-local-worktree.sh` exited 0
(execution session 32896). It installed lockfile dependencies, repaired the
ordinary self-link and passed the canonical environment verifier. No workdir,
session, foreign-root or Git-system-configuration override was used.
Ordinary `npx aitm start 2107 --role agent` then exited 0 (session 35887),
without a relocation flag; native status and Explain both exited 0.

## Independent CLI and genuine hook observation

The real invocation `npx aitm doctor --json --runtime-proof
53246ef6ca328b6cb0915984c23cd5844576dcebd53a89d3` exited 0. It reported
`diagnosticPassed: true`, with no binding mismatches or helper-comparison
reasons. All eight fields agreed:

| Field              | Both actual observations                                                      |
| ------------------ | ----------------------------------------------------------------------------- |
| Session            | `01a16802-877c-7092-a221-780a859a2313`                                        |
| Physical root      | `/Users/kpburson/.codex/worktrees/2107-native-runtime-canary/ai-task-manager` |
| Ref                | `HEAD`, detached                                                              |
| Source HEAD        | `8116f04e3d6f626ffa2d9babe981cb7e6c7585d7`                                    |
| Issue              | `#2107`                                                                       |
| Binding generation | `5e7e4fb6-1e38-4c6f-880c-62b35c1dae40`                                        |
| State              | `develop`                                                                     |
| Entry              | `2026-10-29T16:58:22.573Z`                                                    |

Both processes observed the same repository helper URL for
`scripts/task-tracker/lib/native-runtime-observation.mjs`: 8,114 bytes,
SHA-256 `d0be7d92234b8b4f652250e17f53f1f1576a90f52df6d786ab7931ba02d72219`.
The matching configuration observation was SHA-256
`78643fd8686169f81c287335529f757675b11f45a28d4ec4d3c8251b52b36d65`.
The worker reported genuine hook refusal of the one consumed-nonce replay
before CLI execution. Controller review retained the actual successful
diagnostic output and worker invocation evidence; it did not impersonate
the worker or independently replay that consumed nonce.

## Runtime qualification and its limits

The selected worker runtime is the repository fallback; no scoped package
was installed there. The separately qualified scoped installation and
activation evidence from #2106 remains distinct. Runtime/package/lock paths
in the worker match reviewed source. Canonical `npm ci` verified locked
archive integrity. All 319 installed package versions and hidden-lock
integrity/resolution entries matched, with no missing entries or errors.
The expected dogfood self-link was the sole extraneous inventory entry.

The installed-tree census observed 7,050 entries and 97,736,230 file bytes,
digest `90ad6e368fe962c61cc8533dc58b9ee60b8865e8c33e6677236b057197234aeb`.
That digest is a current observation, not an independent archive-to-file
comparison. The diagnostic proves observed helper parity, not whole-runtime,
executable, hardware or same-user tamper attestation. Trusted native OS and
toolchain assumptions from the approved scope remain explicit.

Canonical setup retained npm's existing audit notices and blocked optional
browser-install script notice. No audit fix, extra script approval, dependency
upgrade or suppression was performed for this canary.

## Cleanup and separate completion authority

Ordinary native Stop exited 0 after the final proof. Independent readback
confirmed binding null, actor active/entry null, #2107 occupancy null and
own occupancy empty. The controller also independently observed no #2107
claim. Historical Unknown timing stayed Unknown; known observations do not
replace it with estimated durations.

Original #2088 and wrapper #2107 each still require their own fresh exact-source
acceptance, review, approval, delivery receipt and all eight native Close
steps. This report pre-claims none of those outcomes. The source implementation
was delivered earlier; this report receives an ordinary pre-merge intent for
original #2088. Existing strict reconstruction may then establish the wrapper's
own receipt only if its single-source and attribution checks actually pass.
No earlier intent is borrowed, no provider merge is repeated, and no predicate
or authority boundary is weakened. No new repair story or R1 work is included.
