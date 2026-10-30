# Issue #2057 — compatibility review R3 author disposition

The complete fresh Sol / medium report is retained verbatim alongside this
file. R3 reviewed `178bdff4d..c7bb727010fcb392ffbca1f2b0b856e75fde1f66`.
It independently passed 16 handoff binding tests, 29 native binding/relocation
tests and six additional filesystem-preservation probes. It separately
reproduced one Important / P1 defect; those successful probes did not excuse
that defect or establish full workflow acceptance.

## Finding and repair

**Accepted.** The author independently reproduced missing refusals with a
surviving native presence record after moving the registry identity, registry
directory and local cache aside. Both valid-config and missing-config cases
observed RED before repair. The evidence shortcut now includes durable shared
writer presence names. Once any retained authority exists, missing configuration
refuses directly. Existing native scope inspection validates the actual
presence/identity correspondence; a presence name itself grants no ownership.

The new census reads only the shared metadata directory's entry names. It does
not initialize a namespace, scan retained histories, infer a historical duration
or perform any cloud read. Unreadable metadata still throws rather than becoming
absence. The no-evidence legacy path still returns without reading an empty or
malformed repository configuration. The linked-root regression additionally
checks the shared presence when both local cache namespaces are unavailable.
No archive or raw byte was deleted to make a case pass.

The reviewer archive and probe sources remain preserved under the reported
project scratch directory. The rejected scratch placement was not retried as a
policy change. Its initial artifact-root fixture failure is retained as a harness
failure, not counted as a product regression or passing test.

## Explicit declined-boundary rulings

1. **Public staging/publication activation:** accepted deferral; no public route
   is introduced by this cache-binding compatibility repair.
2. **Cloud assignment freshness/historical polling:** accepted caller boundary;
   this local census performs no cloud operation and provides no freshness proof.
3. **Estimation/model calculation:** accepted separate ownership. Local retained
   S / 3.5h remains unchanged and no cloud history feeds estimation.
4. **Foreign-host adoption/server locking:** accepted exclusion. Native shared
   registry and supported physical root identity remain authoritative.
5. **Destruction of all evidence:** accepted excluded guarantee; surviving
   presence is retained evidence and therefore explicitly protected here.
6. **Hostile same-owner filesystem rewrites:** accept the cooperative boundary
   without weakening normal safe-path, alias or integrity checks.
7. **Full handoff protocol recertification:** accept the precise repair scope.
   Earlier complete protocol reviews and targeted tests remain retained, while
   this new guard change still needs independent acceptance of its own.
8. **Full fast/lint/package/runtime-budget/remote CI:** executor verification
   remains mandatory. Prior full CI at 178 is historical and cannot accept the
   presence repair or compatibility source changes.
9. **Native Test/Review/approval/Close/merge/delivery:** executor-owned gates,
   still pending. Nothing in the offline report advances the issue or root.
10. **Bare/submodule/separate Git layouts:** accept existing physical-root
    support boundaries; no new layout support is claimed by this repair.
11. **Performance benchmarking:** accept the stated verification limit. This
    bounded local entry-name read is not a benchmark or a cloud-cost saving.
    Native deadlines, capture caps and verification requirements remain intact.

The P1 finding is repaired, not waived. A fresh precise review and final
exact-head verification remain necessary before native Test.
