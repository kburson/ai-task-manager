#!/usr/bin/env node
// @story #496
// Unit tests for the pure upstream-report core (#496): target resolution,
// kind records, env block, privacy scanner, title/marker/body assembly,
// hint parsing, and the gh argv builder.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_UPSTREAM,
  VALID_KINDS,
  resolveUpstream,
  resolveKind,
  buildEnvBlock,
  scanForPrivacy,
  buildTitle,
  buildBody,
  buildTemplate,
  parseHint,
  buildGhArgs,
} from '../../lib/upstream-report.mjs';

describe('resolveUpstream', () => {
  it('defaults to the canonical constant', () => {
    const r = resolveUpstream({});
    assert.equal(r.repo, CANONICAL_UPSTREAM);
    assert.equal(r.source, 'default');
  });
  it('honors a well-formed AITM_UPSTREAM_REPO override', () => {
    const r = resolveUpstream({ AITM_UPSTREAM_REPO: 'me/fork' });
    assert.equal(r.repo, 'me/fork');
    assert.equal(r.source, 'env');
  });
  it('rejects a malformed override', () => {
    assert.throws(() => resolveUpstream({ AITM_UPSTREAM_REPO: 'no-slash' }), /owner\/name/);
  });
});

describe('resolveKind', () => {
  it('defaults to defect', () => {
    assert.equal(resolveKind(undefined).kind, 'defect');
    assert.equal(resolveKind('').kind, 'defect');
  });
  it('selects feature and sets prefix + marker', () => {
    const f = resolveKind('FEATURE');
    assert.equal(f.kind, 'feature');
    assert.equal(f.titlePrefix, '[BETA-FEATURE]');
    assert.equal(f.marker, 'aitm-beta-feature');
  });
  it('defect prefix + marker', () => {
    const d = resolveKind('defect');
    assert.equal(d.titlePrefix, '[BETA-DEFECT]');
    assert.equal(d.marker, 'aitm-beta-defect');
  });
  it('throws on an unknown kind', () => {
    assert.throws(() => resolveKind('chore'), /unknown kind/);
  });
  it('exposes exactly the two valid kinds', () => {
    assert.deepEqual([...VALID_KINDS].sort(), ['defect', 'feature']);
  });
});

describe('buildEnvBlock', () => {
  it('whitelists exactly pkg/node/OS', () => {
    const b = buildEnvBlock({ pkgVersion: '1.2.3', nodeVersion: 'v20.0.0', platform: 'darwin' });
    assert.match(b, /ai-task-manager: 1\.2\.3/);
    assert.match(b, /Node: v20\.0\.0/);
    assert.match(b, /OS: darwin/);
    // No other fields leak.
    assert.equal(b.split('\n').filter((l) => l.startsWith('- ')).length, 3);
  });
  it('falls back to unknown for missing facts', () => {
    assert.match(buildEnvBlock({}), /ai-task-manager: unknown/);
  });
});

describe('scanForPrivacy', () => {
  it('flags home-path references with line numbers', () => {
    const home = '/Users/alice';
    const text = 'line one\nsee /Users/alice/secret/path\nlast';
    const { hits } = scanForPrivacy(text, home);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 2);
    assert.match(hits[0].text, /secret\/path/);
  });
  it('ignores non-home absolute paths', () => {
    const { hits } = scanForPrivacy('see /usr/local/bin', '/Users/alice');
    assert.equal(hits.length, 0);
  });
  it('returns empty on empty input or missing home', () => {
    assert.equal(scanForPrivacy('', '/Users/alice').hits.length, 0);
    assert.equal(scanForPrivacy('/Users/alice/x', '').hits.length, 0);
  });
});

describe('buildTitle', () => {
  it('prefixes the summary', () => {
    assert.equal(buildTitle(resolveKind('defect'), 'thing broke'), '[BETA-DEFECT] thing broke');
  });
  it('is idempotent on an already-prefixed summary', () => {
    const r = resolveKind('defect');
    assert.equal(buildTitle(r, '[BETA-DEFECT] x'), '[BETA-DEFECT] x');
  });
  it('falls back to a placeholder for an empty summary', () => {
    assert.match(buildTitle(resolveKind('feature'), ''), /untitled report/);
  });
});

describe('buildBody', () => {
  it('embeds the hidden marker and env block', () => {
    const r = resolveKind('defect');
    const body = buildBody({ kindRecord: r, prose: 'hello', envBlock: '## Environment' });
    assert.match(body, /<!-- aitm-beta-defect -->/);
    assert.match(body, /hello/);
    assert.match(body, /## Environment/);
  });
});

describe('buildTemplate', () => {
  it('pre-fills defect template from a hint', () => {
    const t = buildTemplate(resolveKind('defect'), { verb: 'promote', reason: 'gate blew up' });
    assert.match(t, /gate blew up/);
    assert.match(t, /`promote`/);
  });
  it('produces an empty manual-fill skeleton with no hint', () => {
    const t = buildTemplate(resolveKind('defect'), null);
    assert.match(t, /Describe the defect/);
  });
  it('feature template is distinct from defect', () => {
    const t = buildTemplate(resolveKind('feature'), null);
    assert.match(t, /What I want/);
  });
});

describe('parseHint', () => {
  it('splits verb from reason', () => {
    assert.deepEqual(parseHint('promote gate refused'), {
      verb: 'promote',
      reason: 'gate refused',
    });
  });
  it('handles a bare verb', () => {
    assert.deepEqual(parseHint('promote'), { verb: 'promote', reason: '' });
  });
  it('returns null for empty', () => {
    assert.equal(parseHint(''), null);
  });
});

describe('buildGhArgs', () => {
  it('assembles the exact gh issue create argv', () => {
    assert.deepEqual(
      buildGhArgs({
        repo: 'kburson/ai-task-manager',
        title: '[BETA-DEFECT] x',
        bodyFile: '/d/r.md',
      }),
      [
        'issue',
        'create',
        '--repo',
        'kburson/ai-task-manager',
        '--title',
        '[BETA-DEFECT] x',
        '--body-file',
        '/d/r.md',
      ]
    );
  });
});
