# #2041 manifest validation verification

Native Plan approval and Develop admission completed before production/test edits. Local agent estimate remains S/3h/rank3. No cloud task history, calibration corpus or rubric was an input.

The initial 53 offline behavior cases were written before manifest.mjs. The named verifier failed with ERR_MODULE_NOT_FOUND for that module. First implementation passed 52 cases; the remaining test failed in fixture setup because the fixture retained the predecessor's frozen revision object. Detaching fixture observation data with structuredClone corrected setup; all 53 passed. No production check was removed to fix that test.

Three new metadata tests then observed RED: missing transport coverage, a string masquerading as a numeric field value with an otherwise correct digest, and an impossible observed calendar date. The validator now checks those shapes; 56 manifest cases passed. A further characterization test persists actual snapshot-reader output and validates foreign comment metadata, all five configured field kinds and the absent sentinel. Final focused run: 57 manifest + 38 observation + 52 snapshot = 147 passed, no failures. The later characterization test is not claimed RED before implementation.

Pure validation authenticates exact generation bytes, canonical JSON, all declared payload references and the full subject identity. It returns detached frozen data. It does not open paths, establish filesystem containment, prove current assignment or authorize publication. The existing observer validates supported native revision structure against retained bytes, without replacing stored provenance with a new observation time. Dirty resource keys are treated as a sorted set; event order and cursor JSON remain unchanged for their separate domain validators.

The manifest's payloadDigest is the generation checksum; no circular self-checksum field is introduced. Initial storage generation is 1, subsequent pointers are consecutive, and publicationGeneration can remain unchanged across many storage generations. A batch must bind that separate positive counter. Whole-history allocation semantics remain with durable commit/freeze owners.

The real npm pack guard passed 9/9 after registering the exact one-module delta and required manifest.mjs presence. Runtime dependency/exclusion rules remain unchanged. Independent review and full native exact-head verification remain pending.
