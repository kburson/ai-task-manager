<!-- cspell:words hashlib pathlib hexdigest -->

# Reproducible source map

## Archive availability after integration

The selected branch is `codex/aitm-mcp-adapter-architecture`; its canonical spec remains the SAR → SPR → XPR result. Only the second experiment's evidence and research were copied into it. The reverse branch is retained as `archive/XPR-SPR-SAR-experiment` and is not merged. Its original Git objects are preserved in the tracked [history archive](../../superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/archive/README.md).

Before the retrieval commands below in a fresh clone, import those historical objects without creating or checking out the archived branch:

```bash
git bundle verify docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/archive/xpr-first-history.bundle
git bundle unbundle docs/superpowers/reviews/aitm-mcp-adapter-architecture/XPR-first/archive/xpr-first-history.bundle
```

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

## End-of-stage artifacts

Stage 1 compares the terminal **SAR-only** artifact with the terminal **XPR-only** artifact, both derived from the same original baseline. Stage 2 compares SAR → SPR with XPR → SPR. Stage 3 compares the complete trajectories already evaluated in this paper. Stage completion is the terminal clean self-pass or peer consensus after corrections, not the first review response. These are recorded review dispositions, not claims of human ratification or absence of all defects.

The [stage manifest](stage-artifacts.json) identifies both the commit containing the final corrected spec and the later commit recording stage completion. Each pair resolves to byte-identical spec content. The local copies below are derived, ignored scratch files; the immutable Git blobs and manifest are the durable sources.

| Arm | Stage | Method | Final spec commit                          | Terminal evidence commit                   | Lines | Local snapshot                                           |
| --- | ----: | ------ | ------------------------------------------ | ------------------------------------------ | ----: | -------------------------------------------------------- |
| A   |     1 | SAR    | `c5cff0e6ce254cb8872d28fd24ecadc932d9b0a0` | `559df32bb43eb07dc26212c708847ef2fe9be7c8` | 1,377 | `.scratch/review-order-research/stages/A-stage-1-SAR.md` |
| A   |     2 | SPR    | `0a7e3c6a6283feddd4a7d7f16d81ac856cc5f1eb` | `7a0b08c7ce42d83e80565227761414708ddf008d` | 1,508 | `.scratch/review-order-research/stages/A-stage-2-SPR.md` |
| A   |     3 | XPR    | `267b91b9218b59342a0d70e0859a0e38523a3923` | `54d6daa3337ef4b2cde4e1bda8c103f4b5a0bd1d` | 1,853 | `.scratch/review-order-research/stages/A-stage-3-XPR.md` |
| B   |     1 | XPR    | `09551213ec6ee18e90d2d6d39f3fff00e9ade055` | `49f0c84274ef4116523784f64e51e0de8cc0caad` | 1,118 | `.scratch/review-order-research/stages/B-stage-1-XPR.md` |
| B   |     2 | SPR    | `6edf917bdd2d0441ad9c296f69419da08307f758` | `4693327ee3638cb5cee94265465dddfa01d5c475` | 1,224 | `.scratch/review-order-research/stages/B-stage-2-SPR.md` |
| B   |     3 | SAR    | `20412884a31fc353096f826430c9da7962516792` | `5b54f897c7a5d039536cba1153579e3246f219f9` | 1,327 | `.scratch/review-order-research/stages/B-stage-3-SAR.md` |

From the repository root, reconstruct and verify every checkpoint without checking out either branch:

```bash
python3 - <<'PY'
import hashlib, json, pathlib, subprocess
manifest = pathlib.Path('docs/research/2026-09-20-review-order-experiment/stage-artifacts.json')
for snapshot in json.loads(manifest.read_text())["snapshots"]:
    object_name = snapshot['artifact_commit'] + ':' + snapshot['artifact_path']
    content = subprocess.check_output(['git', 'show', object_name])
    assert hashlib.sha256(content).hexdigest() == snapshot['sha256']
    output = pathlib.Path(snapshot['local_materialization'])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(content)
    print(output)
PY
```

The initial stage snapshots are `A-stage-1-SAR.md` and `B-stage-1-XPR.md` in `.scratch/review-order-research/stages/`. Line references in the stage comparison point to these exact blobs, rather than the final-spec A/B line numbers. Recreating these copies overwrites only the manifest-listed scratch outputs.
