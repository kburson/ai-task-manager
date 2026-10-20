# #2073 author dispositions — round 2

Input: spec.r1.md, SHA256 `f39c366da1dab5cb9e8994822ec27a74ee77715a387b29eec860cadbd903c9a7`.
Output: [spec.r2.md](spec.r2.md), SHA256 `5820102f7e5e775b0067bfa294f33a663b619e0ebed546c0cc22d543c2e5f651`.

| Finding | Disposition | Revision and source rationale |
| --- | --- | --- |
| F9 | Addressed | Section 2 now isolates extra node IDs in an invocation-local envelope, retains the sealed four-key subject and existing digest/manifest shapes, and requires old-record replay fixtures. It explicitly disclaims durable issue-ID binding across historical attempts. Source: exact subject-key validator and existing membership return value. |
| F10 | Addressed | Section 2 sets three-page connection caps, a single aggregate deadline bounded by GH_API_TIMEOUT_MS, 4 MiB per-response ceiling, finite planned connection/request count and refusal/late-result handling. Conservative fallback must satisfy identical validation. Section 3 defines clock/ID control or explicit volatile-field exclusions without masking identity or digest changes. |

Round counts: 2 addressed, 0 deferred, 0 rejected. Cumulative: 10 addressed, 0 deferred, 0 rejected; next review determines whether additional actionable issues remain. All requirements remain document-level; no estimate, implementation or protocol acceptance is claimed.
