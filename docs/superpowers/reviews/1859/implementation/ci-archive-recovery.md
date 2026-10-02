# CI replay recovery for #1859

GitHub CI on the merge-conflict recovery commit exposed two historical replay tests that passed locally because the original Git objects existed. CI could not read the captured planning text and shim from commit `1b300cd8121b33631c5c3119daed583eb1d636fb`, or the archived recertification runner from `95db22a0306ddbf8bc07c79b8e547778efd68c5d`.

The existing captured-source archive now retains those three exact `git show` byte streams with SHA-256 checksums. The test helper uses its checksum-bound archive when the original object and any known reachable equivalent are unavailable. Historical capture artifacts, their assertions, and frozen maintenance runners are unchanged.

The new isolated-repository regression removes access to original Git objects and verifies all three snapshots reproduce the original bytes. Negative cases reject changed bytes and an undeclared archive entry. The initial red run reproduced the missing archive/object failures; the green run passed all nine focused tests, including current recertification replay. Focused ESLint passed. Raw diagnostics are retained beside this note. Full governed verification and exact-head GitHub CI are recorded separately on the issue.
