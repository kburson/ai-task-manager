# #2146 exact archive inventory review

Independent reviewer requested as Astra6/xhigh; actual runtime configuration independently unattested. Verdict: accepted for the authorized tracked-transfer/publication scope. This does not accept executable implementation, native qualification or lifecycle completion.

- index.json: 255394 bytes; SHA256 c67a987feba8924e7ed54fa5615a739c14a99e3eb5696ee66f447b1220e4a2b5.
- objects.json.gz: 1841366 bytes; SHA256 e0ec6b6fa0ba3c60be2bbf102cd71028072652fdeb6fe329cc315c5446afa859.
- All 1133 original manifest artifacts plus the manifest retained: 1134 files, 593 unique objects, 541 repeated-content entries, 119208600 expanded bytes and 5549342 unique bytes.
- Every content hash and size matches. Original manifest/verifier/harness/report/plan and historical commit/tree pins match. Twelve historical source-hash entries exist; actual source reconstruction remains pending.
- All candidate modes are 0644. Original permission equality cannot be independently established from the pinned original manifest, which records hashes but not modes.
- Missing/extra entries, unused objects, collisions, traversal/link/escape metadata and non-UTF-8 files: zero.

## Bounded disclosure observations

Selected credential/token/private-key patterns, sensitive credential-key labels, authorization-value or URL-userinfo patterns and whole-word sk: zero matches. This does not prove universal credential absence.

Known personal paths: 743 files / 4295 occurrences. Exact known native owner identity: 526 files / 2194 occurrences. Native identity-key names: 163 files / 900 occurrences. The earlier unqualified 415-file identity count was not reproduced and is superseded by these query-specific observations.

Cookie: 81 files / 405 occurrences, exclusively path fields in dependency inventory records containing mode,path,sha256,size, across five Puppeteer Cookie filenames. Qualification secrets fragments: 9 files / 12 occurrences, all literal plural fragments. Authorization scope references: 3 files / 9 occurrences, exclusively original report-v2.md, defect-plan markdown and verify-v2.mjs.

Known provenance paths/IDs remain faithfully retained under the explicit authority. No credential blocker identified in these exact bytes. Actual credential discovery would block publication, not authorize silent redaction.

## Limits and review actions

Gzip header timestamp 0, flags 0, OS byte 19. Cross-platform determinism is not yet qualified. Adapter correctness, author-reported tests, source reconstruction, native Test and completion were excluded.

Admitted file reads, decompression, hashes, inventory comparisons and category inspection only. Archived execution, mutations, copies, publication and delegation: zero. Earlier reviewer Git/runtime refusal remains retained; no proxy or retry performed.
