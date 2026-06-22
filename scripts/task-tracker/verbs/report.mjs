// #496 — `/task report [--kind defect|feature] [--summary <text>]
//          [--from-hint "<verb> <reason>"] [--confirm --draft <path>]`
//
// Files a structured defect or feature report UPSTREAM to the public
// ai-task-manager repo from any downstream project — no write access required,
// no hand-written GitHub issues. Two-phase, mandatory review:
//
//   Phase 1 (no --confirm): resolve target → draft template into a scratch file
//     → privacy scan → print target, warnings, and the draft path. NEVER submits.
//   Phase 2 (--confirm --draft <path>): re-read the (edited) draft → re-scan →
//     reject empty → `gh issue create` against the upstream repo → print URL.
//
// The pure decisions live in `lib/upstream-report.mjs`; this wrapper owns only
// arg parsing, scratch I/O, the gate, and the submit through `ctx.pexec`.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import {
  resolveUpstream,
  resolveKind,
  parseHint,
  buildTemplate,
  buildEnvBlock,
  buildTitle,
  buildBody,
  buildGhArgs,
  scanForPrivacy,
} from '../lib/upstream-report.mjs';

function parseFlags(rest) {
  const args = (rest || []).map((a) => String(a));
  const out = { confirm: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--confirm') out.confirm = true;
    else if (a === '--kind') out.kind = args[++i];
    else if (a === '--summary') out.summary = args[++i];
    else if (a === '--from-hint') out.hint = args[++i];
    else if (a === '--draft') out.draft = args[++i];
  }
  return out;
}

function readPkgVersion(projectDir) {
  // Prefer the installed package version; fall back to this repo's own.
  const candidates = [
    projectDir && path.join(projectDir, 'node_modules', 'ai-task-manager', 'package.json'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, 'utf8')).version || 'unknown';
    } catch {
      /* try next */
    }
  }
  return 'unknown';
}

export async function verbReport(ctx) {
  const { rest, pexec, projectDir } = ctx;
  const flags = parseFlags(rest);

  let target;
  let kindRecord;
  try {
    target = resolveUpstream(process.env);
    kindRecord = resolveKind(flags.kind);
  } catch (err) {
    console.error(`[task-tracker] report: ${err.message}`);
    process.exit(1);
  }

  const home = process.env.HOME || '';

  // ── Phase 2: confirm + submit ──────────────────────────────────────────────
  if (flags.confirm) {
    if (!flags.draft) {
      console.error(
        '[task-tracker] report: --confirm requires --draft <path> of a reviewed draft.'
      );
      process.exit(1);
    }
    let body;
    try {
      body = readFileSync(flags.draft, 'utf8');
    } catch {
      console.error(`[task-tracker] report: cannot read draft "${flags.draft}".`);
      process.exit(1);
    }
    // Strip marker/env scaffolding to test for an empty user body.
    const stripped = body
      .replace(/<!--[^>]*-->/g, '')
      .replace(/^##\s.*$/gm, '')
      .replace(/^\s*-\s.*$/gm, '')
      .trim();
    if (!stripped) {
      console.error('[task-tracker] report: draft body is empty — nothing to submit. Aborting.');
      process.exit(1);
    }
    const { hits } = scanForPrivacy(body, home);
    if (hits.length) {
      console.error(
        `[task-tracker] report: draft still contains ${hits.length} home-path reference(s):`
      );
      for (const h of hits) console.error(`  line ${h.line}: ${h.text}`);
      console.error('Edit the draft to remove them, then re-run with --confirm.');
      process.exit(1);
    }
    // Title: first non-marker heading or the --summary; assembled at draft time
    // and persisted as the draft's first `## ` line is not reliable, so prefer
    // an explicit --summary captured in the draft sidecar.
    const summary = flags.summary || draftSummary(flags.draft) || 'beta report';
    const title = buildTitle(kindRecord, summary);
    let stdout;
    try {
      ({ stdout } = await pexec(
        'gh',
        buildGhArgs({ repo: target.repo, title, bodyFile: flags.draft })
      ));
    } catch (err) {
      console.error(`[task-tracker] report: gh issue create failed:\n${err.stderr || err.message}`);
      process.exit(1);
    }
    const url = String(stdout || '').trim();
    console.log(`[task-tracker] ✓ ${kindRecord.label} filed upstream (${target.repo}): ${url}`);
    return;
  }

  // ── Phase 1: draft + scan + gate ────────────────────────────────────────────
  const hint = parseHint(flags.hint);
  const prose = buildTemplate(kindRecord, hint);
  const envBlock = buildEnvBlock({
    pkgVersion: readPkgVersion(projectDir),
    nodeVersion: process.version,
    platform: process.platform,
  });
  const body = buildBody({ kindRecord, prose, envBlock });

  const dir = projectScratchDir('report', projectDir);
  const stamp = `${kindRecord.kind}-${process.pid}`;
  const draftPath = path.join(dir, `report-${stamp}.md`);
  const summary = flags.summary || (hint && hint.reason) || '';
  writeFileSync(draftPath, body);
  writeFileSync(`${draftPath}.summary`, summary);

  const { hits } = scanForPrivacy(body, home);

  console.log(
    `Drafting a ${kindRecord.label} to upstream: ${target.repo} (source: ${target.source})`
  );
  console.log(`Draft written to: ${draftPath}`);
  if (hits.length) {
    console.log(
      `\n⚠ Privacy scan: ${hits.length} home-path reference(s) found — review before sending:`
    );
    for (const h of hits) console.log(`  line ${h.line}: ${h.text}`);
  } else {
    console.log('Privacy scan: clean (no home-path references).');
  }
  console.log('\nReview and edit the draft, then submit with:');
  console.log(
    `  /task report --kind ${kindRecord.kind}${summary ? ` --summary "${summary}"` : ''} --confirm --draft ${draftPath}`
  );
  console.log('\nNothing has been sent. Submission requires --confirm.');
}

// Read the sidecar summary written at draft time, if present.
function draftSummary(draftPath) {
  try {
    return readFileSync(`${draftPath}.summary`, 'utf8').trim();
  } catch {
    return '';
  }
}
