#!/usr/bin/env node
// @story #900
// The epic-kind `commits` DoD ships its verifier BARE — `node …/verify-epic-trail.mjs`
// with no epic number — because a `<this-issue-#>` placeholder is impossible:
// `<`/`>` are FORBIDDEN checklist-lint redirect tokens (verification-allowlist).
// So the fix lives in the script: a bare invocation resolves the epic from the
// active bound session, while an explicit `<epic#>` positional still wins.
//
// This file is the verifier bound to #900 AC3. It covers, with fully injected
// IO (no git, no network, no real state file):
//   - resolveEpicNumber: bare→active, explicit-wins, invalid/absent→null
//   - main: bare invocation self-targets the active epic and exits 0
//   - main: an unreachable child exits 1
//   - the epic-kind preflight render carries the DoD epic-trail line + a VC
//     entry whose backtick command contains no forbidden `<`/`>` token.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectScratchDir } from '../lib/scratch-dir.mjs';
import { main, resolveEpicNumber } from '../verify-epic-trail.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.resolve(HERE, '..', 'preflight-issue.mjs');

// Field separator for the epic-trail log format (mirrors epic-derived-commit-trail).
const FIELD_SEP = '\x1f';

// A one-line git log whose single commit is attributed to `childNumber`, so the
// derived trail is reachable for that child.
function stubLog(childNumber) {
  return [
    '0'.repeat(40),
    `[#${childNumber}] feat: child work`,
    'tester',
    '2026-01-01T00:00:00Z',
  ].join(FIELD_SEP);
}

// Injected deps for `main`: no real config, children fetch, git, or state file.
function stubDeps({ active, children, log }) {
  const seen = {};
  const deps = {
    loadState: () => ({ active }),
    statePath: () => '/does/not/exist/active-task.json',
    loadConfig: () => ({}),
    fetchEpicChildren: async ({ parentEpicNumber }) => {
      seen.parentEpicNumber = parentEpicNumber;
      return children;
    },
    pexec: async () => ({ stdout: log ?? '' }),
  };
  return { seen, deps };
}

describe('#900 AC3: verify-epic-trail resolves the epic from the active session', () => {
  describe('resolveEpicNumber', () => {
    it('a bare invocation resolves the active bound issue', () => {
      assert.equal(resolveEpicNumber([], { loadState: () => ({ active: '883' }) }), 883);
      assert.equal(resolveEpicNumber([], { loadState: () => ({ active: '#883' }) }), 883);
    });

    it('an explicit positional wins even when the state read throws', () => {
      const loadState = () => {
        throw new Error('no state file');
      };
      assert.equal(resolveEpicNumber(['#883'], { loadState }), 883);
      assert.equal(resolveEpicNumber(['883'], { loadState }), 883);
    });

    it('returns null when neither an explicit arg nor an active issue is a positive integer', () => {
      assert.equal(resolveEpicNumber([], { loadState: () => ({ active: null }) }), null);
      assert.equal(resolveEpicNumber([], { loadState: () => ({ active: 'discover' }) }), null);
      assert.equal(resolveEpicNumber(['0'], { loadState: () => ({}) }), null);
      assert.equal(resolveEpicNumber(['-3'], { loadState: () => ({}) }), null);
    });
  });

  describe('main', () => {
    it('a bare invocation self-targets the active epic and exits 0', async () => {
      const { seen, deps } = stubDeps({
        active: '#883',
        children: [{ number: 890, title: 'child' }],
        log: stubLog(890),
      });
      const code = await main([], deps);
      assert.equal(code, 0);
      assert.equal(seen.parentEpicNumber, 883, 'resolved the active epic with # stripped');
    });

    it('an explicit positional overrides the active session', async () => {
      const { seen, deps } = stubDeps({
        active: '883',
        children: [{ number: 891, title: 'child' }],
        log: stubLog(891),
      });
      const code = await main(['#999'], deps);
      assert.equal(code, 0);
      assert.equal(seen.parentEpicNumber, 999);
    });

    it('exits 1 when a child has no reachable [#N] commit', async () => {
      const { deps } = stubDeps({
        active: '883',
        children: [{ number: 890, title: 'unreachable' }],
        log: '', // empty log → the child is unreachable
      });
      const code = await main([], deps);
      assert.equal(code, 1);
    });

    it('exits 2 when the epic cannot be resolved from args or session', async () => {
      const { deps } = stubDeps({ active: null, children: [], log: '' });
      const code = await main([], deps);
      assert.equal(code, 2);
    });
  });

  describe('epic-kind preflight render', () => {
    it('renders the epic-trail DoD line + a VC entry whose command has no forbidden < / > token', async () => {
      const dir = mkdtempSync(path.join(projectScratchDir('test'), 'epic-trail-render-'));
      const scope = path.join(dir, 'scope.md');
      const ac = path.join(dir, 'ac.md');
      const meta = path.join(dir, 'meta.md');
      writeFileSync(scope, 'Scope.\n', 'utf8');
      writeFileSync(ac, '- [ ] X. <!-- aitm-verified cmd="`node --test x.mjs`" -->\n', 'utf8');
      writeFileSync(meta, '- **Size**: M\n', 'utf8');
      try {
        const { stdout } = await pexec('node', [
          PREFLIGHT,
          '--shape',
          'epic',
          // resolveRenderKind reads args.kind, not shape — epic kind is explicit.
          '--kind',
          'epic',
          '--scope-file',
          scope,
          '--ac-file',
          ac,
          '--plan-metadata-file',
          meta,
        ]);

        // the epic-only derived-trail DoD line renders for the epic kind
        assert.match(stdout, /dod:functional:commits[^\n]*include="epic"/);

        // the VC list carries the bare verifier as a checklist command
        const vcLine = stdout
          .split('\n')
          .find((l) => l.includes('verify-epic-trail.mjs') && l.trim().startsWith('- [ ]'));
        assert.ok(vcLine, 'epic-trail VC entry present');

        // the backtick command must be free of the FORBIDDEN redirect tokens —
        // this is exactly why the epic number cannot be interpolated inline.
        const command = vcLine.match(/`([^`]+)`/)?.[1];
        assert.ok(command, 'VC line has a backtick command');
        assert.doesNotMatch(command, /[<>]/, 'command carries no forbidden redirect token');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
