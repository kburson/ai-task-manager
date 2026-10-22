# Original failed CI artifacts for wave 10

These original GitHub Actions artifact ZIPs retain failed test output, actual timing, shard plans and exit codes. Connected GitHub artifact downloads produced the original bytes; each SHA-256 matched the digest returned by GitHub. The enclosing deterministic ZIP and every member were verified after compression.

All three original artifacts have exit code 1. Run 39802814237 tested db3b1bd56f56b3ec2a439f5b3b8f47a1ee4f36aa; run 39811322712 tested 4e3190bf910733a852a02e5a9ac459da1819600f. The diagnostic artifact independently records Node v24.22.1, a matching published catalog digest and 25 documentation-path-missing errors across 23 entries. These are historical failure evidence, not current green receipts or native acceptance.

These archives do not contain complete job setup logs. Complete job logs remain in GitHub and the retained connector tool record; the earlier refused manual log-file write was not retried. The connected REST reads are outside CLI collector coverage. No complete traffic coverage or quota savings claim follows. Original scratch files are untouched.

Archive: `2026-10-22-original-failed-ci-artifacts.zip`, 36978 bytes, SHA-256 `ad3f863579715bc80f5070a0d2f90b7ab2d9ebdec9b6ba8c880ae263a9e46e2a`.

| Member | Bytes | SHA-256 |
| --- | ---: | --- |
| `2039-39802814237-ci-integration-2-1.zip` | 10694 | `69024917482a4b3310ddb8415ea7cf277ccdda5a5fcc7f39930e9755dbba22a7` |
| `2039-39802814237-ci-integration-3-1.zip` | 11927 | `92098cf8347c76b786bddb226df2e3cf16f20ba7036541ecb8c681bede0fedfe` |
| `2084-diagnostic-39811322712-ci-integration-3-1.zip` | 12851 | `f4371d8eae534a4981e60c87ef9e10064eec7a7e6a45c2ddba4721b3571de92a` |
| `failed-ci-artifacts.index.json` | 3391 | `86c3e1c248e4dbb230f0f471dbe7da8772deaa15a820eca429e5ab429757ea8f` |
| `2084-diagnostic-artifact-summary.json` | 633 | `47443105a24d16e9f75f79f636ce14b35aef92cb68dde6387bb683ab46ded47c` |
