// @story #551 #1279 #1497 #1501 #1578 #1486 #1615 #1625 #1630 #1661 #1662 #1714 #1716 #1720 #1728 #1787 #1793 #1794 #1795 #1796 #1797
// Package-boundary guard. The published tarball must ship only runtime material:
// no test suites, no archived docs, no maintenance/report-only tooling. This test
// runs `npm pack --dry-run --json`, inspects the entry list, and fails loudly if
// the surface regrows past a ceiling or an excluded path reappears. It backstops
// the `files` allowlist negations in package.json so the boundary cannot silently
// drift (e.g. a new `scripts/**/tests/**` dir leaking back into the package).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';

// Walk up from this file to the repo root (the dir holding package.json).
function repoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url)) + '/..';
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, '.git'))) return dir;
    dir = dirname(dir);
  }
  // Fall back to the known relative depth: unit/ -> tests/ -> task-tracker/ -> scripts/ -> root.
  return join(dirname(fileURLToPath(import.meta.url)) + '/..', '..', '..', '..', '..');
}

// The ceiling is set with headroom above the current runtime surface but well
// below the pre-tightening surface (797, of which 427 were test files). A
// regression that re-ships the test suite blows straight past this.
//
// #728 raised this from 400 to 500: shipping the curated durable memory seed
// (`docs/ai-memory/*.md`, ~47 files) is an intentional, one-time surface growth
// to ~442 entries. The seed is bounded (ephemeral trackers and `archive/` are
// excluded), so 500 kept headroom without re-opening the door to the test suite.
//
// #912 raised this from 500 to 550: the two-axis delivery model + epic-branch
// guardrail ship a bounded set of new runtime libs (`close-gates-lineage`,
// `two-axis-delivery`, `gated-delivery`, `tests-lane-split`, `full-auto-merge*`,
// etc.), taking the runtime surface to ~502 entries. 550 restored headroom while
// staying well below the pre-tightening surface (797) — a test-suite re-ship
// still blows straight past it.
//
// #910 raised this from 550 to 600. The branch had crept to its ceiling (zero
// headroom), which made this count assertion intermittently fail under the
// concurrent full suite: a peer test transiently writing an untracked packed-path
// file pushed the momentary `npm pack` count past the limit. We are still in active
// development and cannot predict how much more runtime material we will add, so
// 600 restores comfortable headroom while staying far below the 797 pre-tightening
// surface — a re-shipped test suite still blows straight past it. (#910 also
// dropped `docs/introduction/` from the package, so the live surface fell too.)
//
// #1113 raised this from 600 to 625 for the approved #1067 GitHub-native
// authority sequence. Measured surfaces were 599 on trunk, 606 after Tasks 1-8,
// and 608 with Task 9. The remaining plan names five packed runtime modules and
// three packed documentation artifacts, projecting 616 entries; 625 leaves nine
// entries of bounded contingency while remaining 172 below the 797-entry
// pre-tightening surface. Exclusions and required-entry assertions remain the
// controlling guardrails.
// #1133 later added one focused runtime reconciliation module and measured the
// packed surface at 601 entries, confirming that the same ceiling still leaves
// bounded development headroom well below the pre-tightening surface.
// #1166 adds one shipped Bash-hook policy module; keep the ceiling exact so any
// further package-surface growth still requires an explicit review.
// #1167 adds the shared evidence-provenance runtime module; this one-entry
// increase is the intentional package surface for the write-side contract.
// #1191 adds the issue-resident location marker and its relocation gate; both
// are shipped runtime modules, so the exact packed surface grows by two.
// #1205 adds one shared bounded JSONL scanner used by the word-count and
// active-time lifecycle readers; the exact packed surface grows by one.
// #1206 adds the explicit Assigned Status migration entry point and its
// injected runtime library; both ship so operators can preview/apply it from
// an installed package. The exact packed surface grows by two.
// #1249 adds one shipped maintenance CLI and its pure timing interval authority.
// #1210 intentionally ships two governed verbs, their generic owned-comment
// store, and the task-skill rule that documents the governed surface.
// #1212 intentionally ships five ownership authorities/verbs: canonical
// policy, exact snapshot, Plan commitment guard, assign/transfer, and unassign.
// #1213 intentionally ships the snapshot authority, its guard, and cancel-plan.
// #1217 intentionally ships the final board-cutover CLI, transaction authority,
// shared lifecycle-freeze reader, and operator migration guide. The measured
// package surface therefore grows by exactly four entries.
// #871 intentionally ships one runtime lib — the base-aware cleanup planner
// (scripts/task-tracker/lib/cleanup-base-aware.mjs) — growing the surface by one.
// #1279 intentionally ships the WBS coverage reconciler used by the Plan-exit
// guard, growing the measured package surface by exactly one entry.
// #1208 adds one pure scheduling seam for the bounded subprocess phase.
// #1295 adds the temporary capture guide, control CLI, process shim, and capture
// authority module. The four files are required for installed-package parity.
// #1317 adds one shared proof resolver so Test exit and close validate the same
// current docs-only lane-skip receipt before waiving suite-derived checkboxes.
// #1324 adds the Grok guide, adapter, skill, wire bridge, hook-idempotency
// authority, and provider-selection parser as six intentional runtime entries.
// #1297 adds the shipped closed-binding lifecycle authority used by close,
// fleet recovery, and the worktree guard.
// #1354 accounts for the intentionally shipped Codex guide
// (`docs/guides/codex-unattended-token-burn.md`) from trunk commit b6548b0c.
// #1356 ships `scripts/task-tracker/lib/stamp-receipt-reuse.mjs` and, at operator
// direction, restores development headroom: 900. Measured surface at this raise
// is 686. Path exclusions and required-entry assertions remain the controlling
// guardrails; the count is a coarse tripwire, not an exact inventory.
// #1296 intentionally publishes the reviewed docs/introduction/ set. The
// post-change dry-run count is 715 entries; 750 retains 35 entries of bounded
// growth headroom while staying 47 below the 797-entry pre-tightening surface.
// The exact introduction-set assertion above keeps additions review-visible.
// #1497 ships eleven evidence-v2 runtime modules and one input-contract guide.
// Audited npm-pack manifests grow from 742 to 754 entries with no test files or
// excluded material added. Raise by exactly those twelve entries, preserving
// the existing eight-entry headroom; path exclusions remain unchanged.
// #1500 adds the reviewed v2 enrollment, runtime-capability and command adapters.
// #1512 intentionally ships the manual PR-review policy module and shared rule.
// #1226 intentionally ships the cloud Test performance-baseline runtime module.
// #1562 ships one runtime module, the merge-method reconciliation record used by
// the delivery recovery lane. Exactly one packed entry on top of the 777 surface
// this branch merged from trunk; raise by one so any further package-surface
// growth still requires an explicit review.
// #1578 accounts for #1546's shipped peer-review adapter. The synchronized
// branch surface was 778 before that one required runtime entry; raise by one
// and retain no contingency headroom.
// #1591 shipped the bounded legacy-index reconciliation CLI and its lock-safe
// implementation module. #1592 removes those files with the rest of the legacy
// review runtime; the measured post-decommission package surface is 768 entries.
// #1486 ships one shared graph-node authority adapter that replaces five
// duplicated mapping boundaries. The measured surface grows by exactly one.
// #1579 ships one linked-plan policy validator used by Plan approval. The
// measured surface grows by exactly that maintained runtime entry.
// #1618 ships one Project workflow compatibility policy used by init.
// #1625 ships the four pure workflow-policy core modules. The measured package
// surface grows by exactly those four entries; no test or excluded path ships.
// #1626 ships the exception record, authority resolver, immutable store, and
// governed verb. These four runtime entries are the entire intentional growth.
// #1627 ships the snapshot builder, aggregate evaluator, and read-only preflight
// verb. Those three runtime files are this child's complete package growth.
// #1628 ships one shared enforcement adapter used by mutation boundaries.
// The measured package surface grows by exactly that maintained runtime entry.
// #1630 ships the ratified workflow-exception design as the package's governing
// specification. That one deliberate document is the complete surface growth.
// #1692 ships the four install-contract/manifest runtime modules consumed by
// the installer. The doctor observer/CLI additions and their explicit package
// assertions remain owned by the later child.
const ENTRY_CEILING = 788;

let packedFileCache = null;
function packedFiles() {
  if (packedFileCache) return packedFileCache;
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const entry = parseNpmPackReport(out, {
    expectedPackageName: '@kburson/ai-task-manager',
  });
  packedFileCache = entry.files.map((f) => f.path);
  return packedFileCache;
}

test('package-boundary: no test files are packed', () => {
  const files = packedFiles();
  const tests = files.filter((p) => /\.test\.mjs$/.test(p) || /(^|\/)tests?\//.test(p));
  assert.deepEqual(
    tests,
    [],
    `expected zero packed test files, found ${tests.length}: ${tests.slice(0, 10).join(', ')}`
  );
});

test('package-boundary: excluded directories do not reappear', () => {
  const files = packedFiles();
  const forbidden = files.filter(
    (p) => /^docs\/archive\//.test(p) || /^scripts\/maintenance\//.test(p)
  );
  assert.deepEqual(
    forbidden,
    [],
    `excluded paths leaked back into the package: ${forbidden.slice(0, 10).join(', ')}`
  );
});

// #1296 — consumers need the complete onboarding set locally. Keep this exact
// so future additions to docs/introduction/ are deliberate package-surface
// decisions rather than silent directory-level allowlist growth.
test('package-boundary: ships the exact docs/introduction/ set', () => {
  const files = packedFiles();
  const intro = files.filter((p) => /^docs\/introduction\//.test(p)).sort();
  assert.deepEqual(
    intro,
    [
      'docs/introduction/README.md',
      'docs/introduction/adoption-guide.md',
      'docs/introduction/agentic-development-process.md',
      'docs/introduction/assets/agentic-workflow.png',
      'docs/introduction/assets/aitm-system-map.png',
      'docs/introduction/assets/measurement-loop.png',
      'docs/introduction/bus-factor-executive-brief.md',
      'docs/introduction/context-management-skill-architecture.md',
      'docs/introduction/core-workflow.md',
      'docs/introduction/install-and-setup.md',
      'docs/introduction/measurement-and-roi.md',
    ],
    'docs/introduction/ must ship its complete reviewed Markdown and diagram set'
  );
});

// #910 — the shipped README is the package entry point; once docs/introduction/
// stopped shipping, a relative link into it became a dead link in the tarball.
// Assert the shipped README carries no relative docs/introduction/ link (an
// absolute project URL is fine — it does not depend on packed files).
test('package-boundary: shipped README has no dead docs/introduction link', () => {
  const readme = readFileSync(join(repoRoot(), 'README.md'), 'utf8');
  const deadLinks = readme.match(/\]\(docs\/introduction\//g) || [];
  assert.deepEqual(
    deadLinks,
    [],
    `README links relatively into unshipped docs/introduction/: ${deadLinks.length} occurrence(s)`
  );
});

test('package-boundary: total entry count stays under the ceiling', () => {
  const files = packedFiles();
  // #1635 ships one false-delivery recovery authority. Keep its allowance
  // separate so the preserved #1624 branch can apply its exact ceiling change
  // without both histories editing the same base hunk.
  const recoveryEntryAllowance = 1;
  // #1693 adds the standalone doctor entry point and its read-only observer.
  const doctorRuntimeAllowance = 2;
  // #1709 ships the pure story contract and shared Markdown views.
  const storyContractAllowance = 2;
  // #1711 ships the contained intent adapter and independent binding guard.
  const storyBindingAllowance = 2;
  // #1714 ships the operator-facing story-quality adoption and repair guide.
  const storyQualityGuideAllowance = 1;
  // #1709 ships the shared provider rule alongside the two runtime modules.
  const storyQualityRuleAllowance = 1;
  // #1720 ships the typed Plan-to-Develop transition-authority record.
  const planTransitionAuthorityAllowance = 1;
  // #1756 ships the SHA-preserving delivery source inventory module.
  const deliverySourceInventoryAllowance = 1;
  // #1758 ships one exact delivery attribution authorization record module.
  const deliveryAttributionRecordAllowance = 1;
  // #1759 ships one operator-facing delivery attribution exception command.
  const deliveryAttributionCommandAllowance = 1;
  // #1661 ships three shared action-decision runtime assets and one guide.
  const actionDecisionContractAllowance = 4;
  // #1662 ships the single compact operational presentation runtime module.
  const actionPresentationAllowance = 1;
  // #1728 ships the read-only authority observation collector.
  const actionObservationAllowance = 1;
  // #1729 ships the complete shared action evaluator.
  const actionEvaluatorAllowance = 1;
  // #1731 ships the pure Functional DoD projector used by explanation and execution.
  const functionalDodProjectorAllowance = 1;
  // #1732 ships one execution-only normalization runtime module.
  const actionNormalizationAllowance = 1;
  // #1750 ships the read-only session authority collector.
  const sessionReadinessAllowance = 1;
  // #1751 ships the complete early-promotion readiness collector.
  const earlyPromoteReadinessAllowance = 1;
  // #1752 ships canonical action navigation for the completed early adapters.
  const actionNavigationAllowance = 1;
  // #1666 ships the read-only Test-entry authority collector.
  const testEntryReadinessAllowance = 1;
  // #1667 ships the read-only Review-entry authority collector.
  const reviewEntryReadinessAllowance = 1;
  // #1668 ships the read-only delivery authority collector.
  const deliveryReadinessAllowance = 1;
  // #1669 ships the read-only close authority collector.
  const closeReadinessAllowance = 1;
  // #1671 ships six validator modules, a schema, and a complete seed catalog.
  const guidanceValidationAllowance = 8;
  // #1672 intentionally ships two source/admission modules, the offline
  // recovery CLI, the release manifest, and the project-adoption guide.
  // Measured dry-run package surface grows from 822 to 827 entries.
  const guidanceSourceTrustAllowance = 5;
  // #1673 adds the serialized guidance annotation and direct-entrypoint gate.
  // The measured dry-run package surface grows from 827 to 829 entries.
  const guidanceEntrypointAllowance = 2;
  // #1674 ships the cache identity, compiler, and read-many loader only.
  // The measured production surface grows from 829 to 832 entries.
  const guidanceCacheAllowance = 3;
  // #1675 ships the receipt protocol and public read-only explanation verb.
  // The measured production surface grows from 832 to 834 entries.
  const guidanceExplanationAllowance = 2;
  // #1769 shares one fixed-budget module with the installed static meter.
  // Its tokenizer-backed calibration CLI is development-only and excluded.
  const guidanceContextBudgetAllowance = 1;
  // #1773 ships five detailed human references outside routine model context.
  const adapterReferenceAllowance = 5;
  // #1793 ships the canonical delivery scope codec used by v2 exception records.
  const deliveryScopeAllowance = 1;
  // #1794 ships one runtime partition module for isolated exception chains.
  const exceptionPartitionAllowance = 1;
  // #1795 ships closed delivery proposal and host authority modules.
  const deliveryAuthorityAllowance = 2;
  // #1796 ships the durable journal and consumption state machine.
  const deliveryWaiverConsumptionAllowance = 2;
  // #1797 ships the pure pinned waiver evidence and receipt assembler.
  const deliveryWaiverEvidenceAllowance = 1;
  // #1799 ships the effect-time delivery waiver transaction.
  const deliveryWaiverTransactionAllowance = 1;
  const effectiveCeiling =
    ENTRY_CEILING +
    recoveryEntryAllowance +
    doctorRuntimeAllowance +
    storyContractAllowance +
    storyBindingAllowance +
    storyQualityGuideAllowance +
    storyQualityRuleAllowance +
    planTransitionAuthorityAllowance +
    deliverySourceInventoryAllowance +
    deliveryAttributionRecordAllowance +
    deliveryAttributionCommandAllowance +
    actionDecisionContractAllowance +
    actionPresentationAllowance +
    actionObservationAllowance +
    actionEvaluatorAllowance +
    functionalDodProjectorAllowance +
    actionNormalizationAllowance +
    sessionReadinessAllowance +
    earlyPromoteReadinessAllowance +
    actionNavigationAllowance +
    testEntryReadinessAllowance +
    reviewEntryReadinessAllowance +
    deliveryReadinessAllowance +
    closeReadinessAllowance +
    guidanceValidationAllowance +
    guidanceSourceTrustAllowance +
    guidanceEntrypointAllowance +
    guidanceCacheAllowance +
    guidanceExplanationAllowance +
    guidanceContextBudgetAllowance +
    adapterReferenceAllowance +
    deliveryScopeAllowance +
    exceptionPartitionAllowance +
    deliveryAuthorityAllowance +
    deliveryWaiverConsumptionAllowance +
    deliveryWaiverEvidenceAllowance +
    deliveryWaiverTransactionAllowance;
  assert.ok(
    files.length <= effectiveCeiling,
    `packed entry count ${files.length} exceeds ceiling ${effectiveCeiling}; ` +
      `the package surface grew — confirm intentional and raise the ceiling, or prune.`
  );
});

test('package-boundary: development-only context calibration is not shipped', () => {
  const files = new Set(packedFiles());
  assert.equal(files.has('scripts/task-tracker/measure-guidance-context.mjs'), false);
  assert.equal(files.has('scripts/task-tracker/lib/context-budgets.mjs'), true);
});

test('package-boundary: runtime entry points are still shipped', () => {
  const files = new Set(packedFiles());
  for (const required of [
    'bin/cli.mjs',
    'bin/aitm.mjs',
    'scripts/reports/generate-value-report.mjs',
    'scripts/task-tracker/verbs/start.mjs',
    'scripts/task-tracker/lib/verification-receipt-retirement.mjs',
    'scripts/task-tracker/lib/graph-node-authority.mjs',
    'scripts/task-tracker/lib/governed-plan-policy.mjs',
    'scripts/task-tracker/lib/action-decision/observations.mjs',
    'guidance/source.mjs',
    'guidance/admission.mjs',
    'guidance/annotation.mjs',
    'guidance/cache-identity.mjs',
    'guidance/compile.mjs',
    'guidance/cache.mjs',
    'scripts/task-tracker/lib/direct-guidance-admission.mjs',
    'scripts/task-tracker/guidance.mjs',
    'instructions/aitm-guidance.yml',
    'instructions/aitm-guidance.schema.json',
    'instructions/aitm-guidance.release.json',
    'docs/guides/aitm-guidance-source.md',
    'scripts/gh/move-state.mjs',
    'skill/adapters/claude/SKILL.md',
    'package.json',
  ]) {
    assert.ok(files.has(required), `required runtime file missing from package: ${required}`);
  }
});

test('package-boundary: production parser and guidance release guard are declared', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot(), 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['js-yaml'], '5.4.2');
  assert.match(pkg.scripts.prepublishOnly, /lint:guidance-release-consumer/);
  assert.match(pkg.scripts['lint:guidance-release'], /--check/);
  assert.doesNotMatch(pkg.scripts['lint:guidance-release'], /--assert-consumer-release/);
  assert.match(pkg.scripts['lint:guidance-release-consumer'], /--assert-consumer-release/);
  assert.match(
    pkg.scripts['lint:guidance-release-consumer'],
    /measure-guidance-context\.mjs --all --assert-budgets/
  );
  assert.match(pkg.scripts['lint:guidance-release-consumer'], /guidance-release\.test\.mjs/);
});

test('package-boundary: tag and explicit release CI retain the B2 consumer gate', () => {
  const workflow = readFileSync(join(repoRoot(), '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /release_candidate:/);
  assert.match(workflow, /guidance-release:\n[\s\S]*?lint:guidance-release-consumer/);
});
