// Refine → Plan exit gate (#147).
//
// Layered on top of the existing `planRefinementEstimate` gate (which already
// checks Size + Estimate + Priority + AC items + rationale marker). This gate
// adds the Refine-EXIT signals required before an issue can advance to Plan:
//
//   - Sequence set on the project board
//   - Labels set on the issue (≥ 1)
//   - Start Time set on the project board (auto-stamped at backlog→refine)
//
// Returns `{ ok, blockers, projectValues, labels }`. All I/O is injectable;
// the production wiring uses `projectValuesForIssue` and a GraphQL labels
// query.

import { projectValuesForIssue, splitRepo, gql } from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';
import { lintChecklistCommands } from './checklist-command-lint.mjs';
import {
  findAcsWithoutVerifierOrInvalidTag,
  findAcsWithLegacyVerificationForm,
} from './body-invariants.mjs';

async function defaultFetchBody({ cfg, issueNumber, gqlFn = gql }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gqlFn(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

async function defaultFetchLabels({ cfg, issueNumber, gqlFn = gql }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gqlFn(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          labels(first: 50) { nodes { name } }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const nodes = data?.repository?.issue?.labels?.nodes ?? [];
  return nodes.map((n) => n.name).filter(Boolean);
}

export async function gateRefineToPlan({ cfg, issueNumber, deps = {} } = {}) {
  if (!cfg) throw new Error('gateRefineToPlan: cfg is required');
  if (!issueNumber) throw new Error('gateRefineToPlan: issueNumber is required');

  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  // #630 — thread an injectable `gql` into the default fetchers so their
  // GraphQL round-trips are unit-drivable. Production passes no `deps.gql`, so
  // the defaults bind the real `gql` — byte-identical to the prior behavior.
  const gqlFn = deps.gql || gql;
  const fetchLabels = deps.fetchLabels || ((a) => defaultFetchLabels({ ...a, gqlFn }));
  const fetchBody = deps.fetchBody || ((a) => defaultFetchBody({ ...a, gqlFn }));

  const fieldDefs = fieldDefsLoader();

  let projectValues = {};
  try {
    projectValues = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
  } catch (err) {
    return { ok: false, blockers: [`refine-exit-board-fetch-failed: ${err.message}`] };
  }

  let labels = [];
  try {
    labels = await fetchLabels({ cfg, issueNumber });
  } catch (err) {
    return { ok: false, blockers: [`refine-exit-labels-fetch-failed: ${err.message}`] };
  }

  const blockers = [];

  if (projectValues.rank == null || projectValues.rank === '') {
    blockers.push(
      'refine-exit-missing: Rank is not set on the project board — set it before promoting to Plan'
    );
  }
  if (!Array.isArray(labels) || labels.length === 0) {
    blockers.push(
      'refine-exit-missing: issue has no labels — add at least one label before promoting to Plan'
    );
  }
  if (!projectValues.startTime || String(projectValues.startTime).trim() === '') {
    blockers.push(
      'refine-exit-missing: Start time is not set on the project board — re-enter Refine or backfill before promoting to Plan'
    );
  }

  // #236 — reject compound CLI commands in AC evidence markers / VC section.
  // #676 — also gate on a top-level Pickup Directive heading, mirroring
  // `deep-dive-gate.mjs`'s plan-develop-pickup-directive-missing check one
  // stage earlier so a Plan-column issue is guaranteed to already carry it.
  try {
    const body = await fetchBody({ cfg, issueNumber });

    const strippedForPickup = body.replace(/<details[\s\S]*?<\/details>/gi, '');
    if (!/^##\s+Pickup Directive\s+—\s+MANDATORY,\s+DO NOT SKIP\s*$/m.test(strippedForPickup)) {
      blockers.push(
        'refine-exit-pickup-directive-missing: body must contain a top-level `## Pickup Directive — MANDATORY, DO NOT SKIP` heading (not inside a `<details>` block) before promoting to Plan'
      );
    }

    const lint = lintChecklistCommands(body);
    for (const v of lint.violations) {
      if (v.severity !== 'error') continue;
      blockers.push(
        `refine-exit-forbidden-command: ${v.section}:${v.lineIndex + 1}: \`${v.command}\` — forbidden ${v.rule}. Split into separate backtick-quoted commands.`
      );
    }
    // #523 — Demonstrable-AC exit gate. Every AC must bind to a targeted
    // verifier (`aitm-verified cmd="…"`) or carry the honest
    // `invalid — non-demonstrable` opt-out. `npm run test:all` is the
    // regression floor, not an AC verifier.
    for (const ac of findAcsWithoutVerifierOrInvalidTag(body)) {
      const why = ac.reason.startsWith('malformed-verifier')
        ? `declared verifier ${ac.reason.slice('malformed-verifier: '.length)} — bind a real targeted command or tag the AC \`invalid — non-demonstrable\``
        : ac.reason === 'test-all-verifier'
          ? '`npm run test:all` is the regression floor, not an AC verifier — declare a targeted verifier or tag the AC `invalid — non-demonstrable`'
          : 'no `aitm-verified cmd="…"` verifier and not tagged `invalid — non-demonstrable` — bind a targeted verifier test or tag it invalid';
      blockers.push(
        `refine-exit-demonstrable: AC line ${ac.lineIndex + 1}: "${ac.label}" — ${why}.`
      );
    }
    // #773 — VC-citation id-scheme guardrail. New work must bind ACs through the
    // `vc-list="vc:N"` id-citation form; the three legacy verification forms are
    // forbidden at Refine→Plan exit so the corpus converges (child C, #774,
    // heals the backlog).
    for (const ac of findAcsWithLegacyVerificationForm(body)) {
      const why =
        ac.reason === 'ordinal-cmd-citation'
          ? 'cites verification commands through the deprecated `cmd` attribute — move the citation to `vc-list="vc:N"`'
          : ac.reason === 'dangling-vc-list'
            ? '`vc-list` cites a `vc:N` with no matching `## Verification Commands` id — fix the citation or add the entry'
            : ac.reason === 'empty-vc-list'
              ? '`vc-list` is present but empty / not a `vc:N` citation — a verified AC must cite at least one `## Verification Commands` entry, never a silent zero-command green'
              : ac.reason === 'missing-vc-list'
                ? 'declares a verifier marker with no `vc-list` citation — add `vc-list="vc:N"` naming a `## Verification Commands` entry so the AC resolves to a real command'
                : 'declares a literal `cmd="`…`"` command — replace it with a `vc-list="vc:N"` citation into `## Verification Commands`';
      blockers.push(
        `refine-exit-vc-citation: AC line ${ac.lineIndex + 1}: "${ac.label}" — ${why}.`
      );
    }
  } catch (err) {
    blockers.push(`refine-exit-body-fetch-failed: ${err.message}`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
    projectValues,
    labels,
  };
}
