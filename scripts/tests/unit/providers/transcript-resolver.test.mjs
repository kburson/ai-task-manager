// @story #477
// Parity + behavior contract for the cross-provider transcript resolver.
//
// Asserts that both providers resolve a session id to a transcript path from
// their own on-disk layout through the SAME dispatch path (no provider-name
// branching), and that the resolved paths feed the #476 session-ref serializer
// to byte-identical marker grammar.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { resolveTranscriptPath } from '../../../providers/transcript-resolver.mjs';
import { claudeAdapter } from '../../../providers/claude.mjs';
import { codexAdapter } from '../../../providers/codex.mjs';
import { serializeSessionRefMarker } from '../../../task-tracker/lib/session-ref.mjs';
import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const SID = '019ee6a8-3075-7823-8ecf-e2b40dfbd75f';

test('flat layout (Claude): deterministic path, no disk required', () => {
  const home = '/home/u';
  const resolved = resolveTranscriptPath({
    adapter: claudeAdapter,
    sid: SID,
    homedir: home,
    projectKey: '-Users-x-proj',
  });
  assert.equal(resolved, path.join(home, '.claude/projects', '-Users-x-proj', `${SID}.jsonl`));
});

test('date-bucketed layout (Codex): finds the rollout file by sid suffix', () => {
  const home = mkdtempProjectIsolated('codex-resolve-');
  const bucket = path.join(home, '.codex/sessions/2026/06/20');
  mkdirSync(bucket, { recursive: true });
  const file = path.join(bucket, `rollout-2026-06-20T15-10-42-${SID}.jsonl`);
  writeFileSync(file, '{"type":"session_meta"}\n', 'utf8');
  // Decoy in a different bucket must not match.
  const other = path.join(home, '.codex/sessions/2026/06/19');
  mkdirSync(other, { recursive: true });
  writeFileSync(path.join(other, 'rollout-2026-06-19T01-00-00-deadbeef.jsonl'), '{}\n', 'utf8');

  const resolved = resolveTranscriptPath({ adapter: codexAdapter, sid: SID, homedir: home });
  assert.equal(resolved, file);
});

test('#1092: a Codex Desktop thread id resolves its native rollout suffix', () => {
  const home = mkdtempProjectIsolated('codex-desktop-resolve-');
  const bucket = path.join(home, '.codex/sessions/2026/08/01');
  mkdirSync(bucket, { recursive: true });
  const file = path.join(bucket, `rollout-2026-08-01T10-50-21-${SID}.jsonl`);
  writeFileSync(file, '{"type":"response_item"}\n', 'utf8');
  assert.equal(resolveTranscriptPath({ adapter: codexAdapter, sid: SID, homedir: home }), file);
});

test('date-bucketed layout: returns null when no matching file exists', () => {
  const home = mkdtempProjectIsolated('codex-miss-');
  const resolved = resolveTranscriptPath({ adapter: codexAdapter, sid: SID, homedir: home });
  assert.equal(resolved, null);
});

test('missing adapter / sid / homedir → null', () => {
  assert.equal(resolveTranscriptPath({ sid: SID, homedir: '/h' }), null);
  assert.equal(resolveTranscriptPath({ adapter: codexAdapter, homedir: '/h' }), null);
  assert.equal(resolveTranscriptPath({ adapter: codexAdapter, sid: SID }), null);
});

test('null transcriptLayout → null (provider declares no resolvable transcript)', () => {
  const inert = { ...codexAdapter, transcriptLayout: null };
  assert.equal(resolveTranscriptPath({ adapter: inert, sid: SID, homedir: '/h' }), null);
});

test('format parity: both providers feed identical session-ref marker grammar', () => {
  const ts = '2026-06-21T00:00:00.000Z';
  const claudePath = resolveTranscriptPath({
    adapter: claudeAdapter,
    sid: SID,
    homedir: '/home/u',
    projectKey: '-p',
  });

  const home = mkdtempProjectIsolated('codex-fmt-');
  const bucket = path.join(home, '.codex/sessions/2026/06/20');
  mkdirSync(bucket, { recursive: true });
  const codexFile = path.join(bucket, `rollout-2026-06-20T15-10-42-${SID}.jsonl`);
  writeFileSync(codexFile, '{}\n', 'utf8');
  const codexPath = resolveTranscriptPath({ adapter: codexAdapter, sid: SID, homedir: home });

  const claudeMarker = serializeSessionRefMarker({ sid: SID, jsonlPath: claudePath, ts });
  const codexMarker = serializeSessionRefMarker({ sid: SID, jsonlPath: codexPath, ts });

  // Same grammar; only the jsonl value differs by provider source.
  const grammar = (m) => m.replace(/jsonl="[^"]*"/, 'jsonl="<PATH>"');
  assert.equal(grammar(claudeMarker), grammar(codexMarker));
  assert.match(claudeMarker, /<!--\s*aitm-session-ref sid="[^"]+" jsonl="[^"]+" ts="[^"]+"\s*-->/);
  assert.match(codexMarker, /<!--\s*aitm-session-ref sid="[^"]+" jsonl="[^"]+" ts="[^"]+"\s*-->/);
});

test('degradation parity: unresolvable Codex path → sid-only marker (jsonl="")', () => {
  const ts = '2026-06-21T00:00:00.000Z';
  const home = mkdtempProjectIsolated('codex-degrade-');
  const codexPath = resolveTranscriptPath({ adapter: codexAdapter, sid: SID, homedir: home });
  assert.equal(codexPath, null);
  // Mirrors word-counter.jsonlPath's `resolved || ''` degradation.
  const marker = serializeSessionRefMarker({ sid: SID, jsonlPath: codexPath || '', ts });
  assert.match(marker, /jsonl=""/);
  assert.match(marker, /sid="019ee6a8-3075-7823-8ecf-e2b40dfbd75f"/);
});
