#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';
import {
  SUPERPOWER_SKILLS,
  findSuperpowersSkillRoot,
  availableSuperpowerSkills,
  mirrorSuperpowerSkills,
  codexBootstrapBlock,
  upsertManagedBlock,
} from '../../../codex-superpowers.mjs';

const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-codex-superpowers-'));

function writeSkill(root, version, name, body = `# ${name}\n`) {
  const dir = path.join(
    root,
    '.claude',
    'plugins',
    'cache',
    'claude-plugins-official',
    'superpowers',
    version,
    'skills',
    name
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8');
}

try {
  writeSkill(sandbox, '5.0.7', 'using-superpowers', '# old\n');
  writeSkill(sandbox, '5.1.0', 'using-superpowers', '# new\n');
  writeSkill(sandbox, '5.1.0', 'brainstorming');
  writeSkill(sandbox, '5.1.0', 'verification-before-completion');

  const root = findSuperpowersSkillRoot({ home: sandbox });
  assert.equal(
    root,
    path.join(
      sandbox,
      '.claude',
      'plugins',
      'cache',
      'claude-plugins-official',
      'superpowers',
      '5.1.0',
      'skills'
    ),
    'detects the newest usable Superpowers skills root'
  );

  const available = availableSuperpowerSkills(root);
  assert.deepEqual(
    available.present,
    ['using-superpowers', 'brainstorming', 'verification-before-completion'],
    'reports requested skills that are present in source order'
  );
  assert.ok(
    available.missing.includes('systematic-debugging'),
    'reports requested skills that are absent'
  );
  assert.ok(
    SUPERPOWER_SKILLS.includes('receiving-code-review'),
    'keeps review skills in the default list'
  );

  const codexRoot = path.join(sandbox, '.codex', 'skills');
  const firstMirror = mirrorSuperpowerSkills({ sourceRoot: root, destRoot: codexRoot });
  assert.deepEqual(firstMirror.copied, [
    'using-superpowers',
    'brainstorming',
    'verification-before-completion',
  ]);
  assert.ok(
    existsSync(path.join(codexRoot, 'brainstorming', 'SKILL.md')),
    'copies skill directories'
  );

  const secondMirror = mirrorSuperpowerSkills({ sourceRoot: root, destRoot: codexRoot });
  assert.deepEqual(secondMirror.copied, [], 'does not recopy unchanged skills');
  assert.deepEqual(secondMirror.unchanged, [
    'using-superpowers',
    'brainstorming',
    'verification-before-completion',
  ]);

  const userContent = '# Existing Project Instructions\n\nKeep this line.\n';
  const block = codexBootstrapBlock({ scope: 'repo' });
  const once = upsertManagedBlock(userContent, block);
  const twice = upsertManagedBlock(once, block);
  assert.equal(twice, once, 'managed AGENTS block is idempotent');
  assert.ok(twice.startsWith(userContent), 'preserves existing AGENTS.md content');
  assert.equal(
    (twice.match(/ai-task-manager:codex-superpowers:start/g) ?? []).length,
    1,
    'writes one start marker'
  );
  assert.match(twice, /using-superpowers/, 'bootstrap block names using-superpowers');
  assert.match(twice, /\.agents\/skills\/task\/SKILL\.md/, 'keeps the AITM task skill separate');
  assert.match(
    twice,
    /State Transition Verb Map \(8-state model\)/,
    'bootstrap names the 8-state model'
  );
  assert.match(
    twice,
    /Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done/,
    'bootstrap state map includes On Deck'
  );
  assert.match(twice, /\/task plan #N/, 'bootstrap map names the dedicated Refine → Plan verb');
  assert.match(twice, /\/task test #N/, 'bootstrap map names the Develop → Test verb');
  assert.match(
    twice,
    /\/task approve #N --human/,
    'bootstrap records human approval with explicit provenance'
  );
  assert.match(
    twice,
    /current Review authority/,
    'bootstrap does not reduce Review-to-Done authority to marker presence'
  );
  assert.match(twice, /\/task promote #N/, 'bootstrap map keeps one-step generic promotion');

  const staleManaged = [
    '# Existing Project Instructions',
    '',
    '<!-- ai-task-manager:codex-superpowers:start -->',
    'old managed content',
    'State Transition Verb Map (7-state model)',
    'Backlog → Refine → Plan → Develop → Test → Review → Done',
    '<!-- ai-task-manager:codex-superpowers:end -->',
    '',
  ].join('\n');
  const refreshed = upsertManagedBlock(staleManaged, block);
  assert.doesNotMatch(
    refreshed,
    /old managed content/,
    'managed block refresh replaces stale content'
  );
  assert.doesNotMatch(
    refreshed,
    /7-state model/,
    'managed block refresh removes stale state count'
  );
  assert.match(refreshed, /On Deck/, 'managed block refresh installs current generated content');

  const missingHome = mkdtempSync(
    path.join(projectScratchDir('test'), 'aitm-codex-superpowers-missing-')
  );
  try {
    assert.equal(
      findSuperpowersSkillRoot({ home: missingHome }),
      null,
      'missing Superpowers cache is a normal fallback'
    );
  } finally {
    rmSync(missingHome, { recursive: true, force: true });
  }

  console.log('codex-superpowers.test.mjs: all assertions passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
