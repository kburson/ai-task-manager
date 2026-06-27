#!/usr/bin/env node
// Audit: every closed issue, extract aitm-commits SHAs, check each is an
// ancestor of trunk. Reports stranded SHAs and which issues carry them.

import { execFileSync } from 'node:child_process';

const REPO = 'kburson/ai-task-manager';
const TRUNK = 'trunk';
const MAIN_REPO = '/Users/kpburson/projects/Vibe-Coding/ai-task-manager';

// Dual-grammar (#381): match both the legacy colon CSV form and the new
// consolidated `shas="..."` property form. One capture group per branch.
const MARKER_RE = /<!--\s*aitm-commits(?::\s*([^-]*?)|\s+shas="((?:[^"]|&quot;)*)")\s*-->/g;

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
}

// A git object name is 7-40 lowercase hex chars. Anything else — including
// shell metacharacters from a crafted `aitm-commits` marker — is rejected
// before it can reach git.
const SHA_RE = /^[0-9a-f]{7,40}$/;

export function isAncestor(sha, { repo = MAIN_REPO, trunk = TRUNK } = {}) {
  // Validate first: a non-hex value is never executed, just classified.
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) return 'unknown-sha';
  try {
    // argv array, no shell — the SHA is a literal argument, not interpolated
    // into a command string (cf. the safe `gh` call above).
    execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', sha, trunk], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return 'on-trunk';
  } catch (e) {
    // Distinguish "not an ancestor" (exit 1) from "unknown object" (exit 128).
    if (e.status === 1) return 'stranded';
    return 'unknown-sha';
  }
}

export function extractShas(text) {
  if (!text) return [];
  const shas = [];
  let m;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    // m[1] = legacy CSV branch, m[2] = new quoted-attribute branch.
    const payload = m[1] ?? (m[2] != null ? m[2].replace(/&quot;/g, '"') : '');
    for (const s of payload
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)) {
      shas.push(s);
    }
  }
  return shas;
}

function runAudit() {
  const issues = JSON.parse(
    gh([
      'issue',
      'list',
      '-R',
      REPO,
      '--state',
      'closed',
      '--limit',
      '500',
      '--json',
      'number,title',
    ])
  );
  console.error(`Auditing ${issues.length} closed issues against ${TRUNK}…`);

  const report = { onTrunk: [], stranded: [], unknown: [], noCommits: [] };

  for (const { number, title } of issues) {
    const data = JSON.parse(
      gh(['issue', 'view', String(number), '-R', REPO, '--json', 'body,comments'])
    );
    const shas = new Set([
      ...extractShas(data.body),
      ...data.comments.flatMap((c) => extractShas(c.body)),
    ]);
    if (shas.size === 0) {
      report.noCommits.push({ number, title });
      continue;
    }
    const perSha = [...shas].map((s) => ({ sha: s, status: isAncestor(s) }));
    const stranded = perSha.filter((x) => x.status === 'stranded');
    const unknown = perSha.filter((x) => x.status === 'unknown-sha');
    if (stranded.length || unknown.length) {
      const entry = {
        number,
        title,
        stranded,
        unknown,
        onTrunk: perSha.filter((x) => x.status === 'on-trunk').length,
      };
      if (stranded.length) report.stranded.push(entry);
      else report.unknown.push(entry);
    } else {
      report.onTrunk.push({ number, title, count: perSha.length });
    }
  }

  console.log('=== Audit summary ===');
  console.log(`Closed issues:           ${issues.length}`);
  console.log(`  fully on trunk:        ${report.onTrunk.length}`);
  console.log(`  with stranded SHAs:    ${report.stranded.length}`);
  console.log(`  with unknown SHAs:     ${report.unknown.length}`);
  console.log(`  with no aitm-commits:  ${report.noCommits.length}`);

  if (report.stranded.length) {
    console.log('\n=== Stranded (SHA exists locally but NOT an ancestor of trunk) ===');
    for (const e of report.stranded) {
      console.log(`#${e.number} — ${e.title}`);
      for (const s of e.stranded) console.log(`    stranded: ${s.sha}`);
      for (const s of e.unknown) console.log(`    unknown:  ${s.sha}`);
      if (e.onTrunk) console.log(`    (${e.onTrunk} other SHAs on trunk)`);
    }
  }

  if (report.unknown.length) {
    console.log("\n=== Unknown SHAs (object not in local repo — may be GC'd or never fetched) ===");
    for (const e of report.unknown) {
      console.log(`#${e.number} — ${e.title}`);
      for (const s of e.unknown) console.log(`    unknown:  ${s.sha}`);
    }
  }
}

// Only run the audit when executed directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runAudit();
}
