# Reproducible source map

## Specification snapshots

All `A:line` and `B:line` citations in this research refer to the specification path `docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md` at the named Git commit. Line numbers use `nl -ba` on the exact blob.

| Label    | Commit                                     | Expected SHA-256                                                   | `wc -l` |
| -------- | ------------------------------------------ | ------------------------------------------------------------------ | ------: |
| Baseline | `c2e33f4d0ae704900437a0659119bad6eb30dc01` | `7066ff40fdfffa399d279f453b3e4ee7dd0e26f96effcc2dff0475b76c2cf783` |     883 |
| A        | `94c32e12d845b621311a4597ac1dbaf3715c9d67` | `4c3e51d93861e93ced662efbdbd551221be1e5e114fe0c68c3d3219d822f2382` |   1,853 |
| B        | `5b54f897c7a5d039536cba1153579e3246f219f9` | `99c5ca567e533e6b1b7913dc98b2723b1f561ab5a0903cfa5d6fe227b449fddf` |   1,327 |

Example retrieval and verification:

```bash
git show 94c32e12d845b621311a4597ac1dbaf3715c9d67:docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md | shasum -a 256
git show 94c32e12d845b621311a4597ac1dbaf3715c9d67:docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md | nl -ba | sed -n '801,940p'
git show 5b54f897c7a5d039536cba1153579e3246f219f9:docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md | shasum -a 256
git show 5b54f897c7a5d039536cba1153579e3246f219f9:docs/superpowers/specs/2026-09-20-aitm-mcp-adapter-architecture-design.md | nl -ba | sed -n '811,971p'
```

## Original review roots

Use records from these immutable roots. Publication mirrors add provenance headers and are not additional reviews.

| Arm/stage | Commit                                     | Original root                                                          | Protocol ID                               |
| --------- | ------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------- |
| A SAR     | `94c32e12d845b621311a4597ac1dbaf3715c9d67` | `docs/superpowers/reviews/aitm-mcp-adapter-architecture/SAR`           | self-review records; no peer protocol ID  |
| A SPR     | same                                       | `docs/superpowers/reviews/aitm-mcp-adapter-architecture/SPR`           | `review-1ea55e3127774ff3817f44752efcbc79` |
| A XPR     | same                                       | `docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR`           | `review-cf0c320256eb77ed12fe9e531ed9744f` |
| B XPR     | `5b54f897c7a5d039536cba1153579e3246f219f9` | `docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/XPR` | `review-bf339e74f46697b4da5d2d19cb3c822e` |
| B SPR     | same                                       | `docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/SPR` | `review-d25ab35478c17f6f87b2b8bc4c67190a` |
| B SAR     | same                                       | `docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/SAR` | self-review records; no peer protocol ID  |

To extract immutable collateral into a new empty directory:

```bash
mkdir review-A
git archive 94c32e12d845b621311a4597ac1dbaf3715c9d67 docs/superpowers/reviews/aitm-mcp-adapter-architecture | tar -x -C review-A
mkdir review-B
git archive 5b54f897c7a5d039536cba1153579e3246f219f9 docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first | tar -x -C review-B
```

## Event-defined peer-review durations

These are protocol create-to-finalize wall clocks, not active reasoning time, telemetry attribution windows, or billable duration.

| Arm/stage | Start UTC                  | End UTC                    | Elapsed seconds |
| --------- | -------------------------- | -------------------------- | --------------: |
| A SPR     | `2026-09-20T20:27:05.409Z` | `2026-09-20T20:38:25.400Z` |         679.991 |
| A XPR     | `2026-09-20T20:51:09.520Z` | `2026-09-20T21:27:56.112Z` |       2,206.592 |
| B XPR     | `2026-09-20T21:48:14.763Z` | `2026-09-20T22:07:39.218Z` |       1,164.455 |
| B SPR     | `2026-09-20T22:18:52.612Z` | `2026-09-20T22:29:47.813Z` |         655.201 |

SAR used sequential self-review records rather than the peer protocol, so no directly comparable create-to-finalize interval is reported. The wider usage-attribution windows and their exact boundaries are recorded separately in `cost-evidence.json`.
