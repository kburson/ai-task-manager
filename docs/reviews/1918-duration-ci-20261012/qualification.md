# Temporary duration suspension — CI compatibility repair

At source a694a6d1d49aa7e839c95388eb64ad19a4c8fdc5, GitHub run38290008916 unit group failed two of992 files. Local reproduction with the exact suspended setting retained both failures: guidance-legacy-inventory reported the unclassified process-timeouts AITM_TEST_EXECUTION_LIMITS read; lane-split-dod-stamp expected1200000 although the explicitly suspended effective deadline was0. See red.log (3pass/2fail).

Extend the live behavioral inventory with a separate #1918 fixture, leaving frozen #1558 evidence intact. The exact production excerpt and fingerprint classify the operator control, its strict suspended setting, retained default and functional/authority boundaries. Existing removal controls now also reject removing the suspension classification.

The lane verifier control now explicitly checks separate lane processes for default1200000, suspended0 and misspelled setting1200000 without inheriting the CI runner environment. Original two-lane command and functional result assertions remain. Functional failure under suspension is still checked by the genuine failing Node subprocess test.

The affected inventory, lane verifier and duration controls pass12/12, zero fail/cancel/skip (green.log). Full unit qualification and quality checks follow. This repair does not waive any verification/review gate or complete a child lifecycle. Active owner remains #1918 under the existing authorized recovery train; no new issue.

Full unit qualification on the stable repaired source: all992 test files passed, exit0, aggregate136.8seconds. Full output: full-unit.log. Duration enforcement is explicitly suspended, not a performance pass. Full lint passed with exit0; formatting is checked before commit.
