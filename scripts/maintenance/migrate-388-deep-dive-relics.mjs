#!/usr/bin/env node
// #388 (sub of EPIC #369) — migrate the four legacy JSON-verdict
// `aitm-deep-dive-complete` relic markers on issues #96, #97, and #102 into
// proper `## Plan Metadata` body sections, then normalize the markers to the
// canonical `ts="..."` form.
//
// The C3 corpus-migration transform deliberately skips JSON-payload
// deep-dive-complete markers (rewriting structured payloads automatically is
// unsafe), so these relics are resolved here by hand first.
//
// Per-issue:
//   #96  — `## Plan Metadata` already present (P0/XL/12.5h/Seq 10). Verdict was
//          `XL / 13h / P0` (+0.5h dual-keying delta). Add a reconciliation note
//          (body 12.5h chosen over verdict 13h; subs already in Sub-issues
//          block) and normalize the marker.
//   #97  — no `## Plan Metadata`. Verdict `M / 8h / P0` DISAGREES with the live
//          board (L / 16h / Seq 11). Board wins (later, post-inventory value).
//          Author the section, record the reconciliation, normalize the marker.
//   #102 — no `## Plan Metadata` and TWO duplicate `trivial` markers. Board
//          fields all null. Author the section from the verdict (XS / 0.5h),
//          dedupe the two markers to a single canonical one.
//
// Idempotent: the section guard keys off `## Plan Metadata` presence and the
// relic regex only matches the JSON-payload form, so a re-run is a no-op once
// migrated. All writes route through `mutateIssueBody`.

import { loadConfig } from '../task-tracker/config.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { serializeMarker } from '../task-tracker/lib/marker-grammar.mjs';

const cfg = loadConfig();
const TS = '2026-06-13T00:05:00.000Z'; // migration stamp (relics carried no original ts)
const CANON = serializeMarker('deep-dive-complete', { ts: TS });
const RELIC_RE = /<!-- aitm-deep-dive-complete:[^\n]*-->/g;

async function migrate96() {
  return mutateIssueBody({
    issueNumber: 96,
    repo: cfg.repo,
    mutate: (base) => {
      let next = base;
      const recon =
        '\n**Reconciliation:** deep-dive verdict was `XL / 13h / P0` ' +
        '(including a +0.5h delta for sub-4 dual-keying); the refined body/board ' +
        'value of 12.5h is chosen as best-supported (−0.5h vs the verdict). ' +
        'The verdict `subs` list is already represented by the Sub-issues block below.';
      if (!next.includes('**Reconciliation:** deep-dive verdict was `XL / 13h')) {
        next = next.replace(/^(\*\*Sequence:\*\* 10[^\n]*)$/m, (m) => `${m}\n${recon}`);
      }
      return next.replace(RELIC_RE, CANON);
    },
  });
}

async function migrate97() {
  const PM = [
    '## Plan Metadata',
    '',
    '**Priority:** P0',
    '**Size:** L',
    '**Estimate:** 16h',
    '**Sequence:** 11',
    '',
    '**Reconciliation:** the deep-dive verdict was `M / 8h / P0`; the live board ' +
      'refined to Size L / Estimate 16h after the actual file inventory ' +
      '(18 production + 21 test files). The board value is chosen as later and ' +
      'best-supported. The original groom estimate of 3h was an under-estimate ' +
      '(M-tier median ~8h; board final 16h).',
    '**Validation:** in-flight `aitm-last-known-state` markers are handled by an ' +
      'inert-fallback path (no migration script required).',
  ].join('\n');
  return mutateIssueBody({
    issueNumber: 97,
    repo: cfg.repo,
    mutate: (base) =>
      base.includes('## Plan Metadata')
        ? base.replace(RELIC_RE, CANON)
        : base.replace(RELIC_RE, `${PM}\n\n${CANON}`),
  });
}

async function migrate102() {
  const PM = [
    '## Plan Metadata',
    '',
    '**Priority:** — (board field null; the deep-dive verdict carried no priority)',
    '**Size:** XS',
    '**Estimate:** 0.5h',
    '**Sequence:** — (board field null)',
    '',
    '**Reconciliation:** board fields were never set (priority/size/estimate/' +
      'sequence all null); values are derived solely from the deep-dive verdict ' +
      '`trivial`. Size XS / 0.5h reflects three small edits: rewrite the verb-map ' +
      'block in the `bin/cli.mjs` installer stub, drop the deprecated-slug table, ' +
      'and fix one test comment in `markers.test.mjs`.',
  ].join('\n');
  return mutateIssueBody({
    issueNumber: 102,
    repo: cfg.repo,
    mutate: (base) => {
      let next = base.replace(
        /<!-- aitm-deep-dive-complete: \{"verdict":"trivial","note":"3 small edits"\} -->\n?/,
        ''
      );
      return next.replace(RELIC_RE, `${PM}\n\n${CANON}`);
    },
  });
}

const r96 = await migrate96();
const r97 = await migrate97();
const r102 = await migrate102();
console.log('#96 :', JSON.stringify({ status: r96.status, version: r96.version }));
console.log('#97 :', JSON.stringify({ status: r97.status, version: r97.version }));
console.log('#102:', JSON.stringify({ status: r102.status, version: r102.version }));
