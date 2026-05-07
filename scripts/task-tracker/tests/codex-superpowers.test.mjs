#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SUPERPOWER_SKILLS,
  findSuperpowersSkillRoot,
  availableSuperpowerSkills,
  mirrorSuperpowerSkills,
  codexBootstrapBlock,
  upsertManagedBlock,
} from '../codex-superpowers.mjs';

const sandbox = mkdtempSync(path.join(tmpdir(), 'aitm-codex-superpowers-'));

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
  assert.ok(available.missing.includes('systematic-debugging'), 'reports requested skills that are absent');
  assert.ok(SUPERPOWER_SKILLS.includes('receiving-code-review'), 'keeps review skills in the default list');

  const codexRoot = path.join(sandbox, '.codex', 'skills');
  const firstMirror = mirrorSuperpowerSkills({ sourceRoot: root, destRoot: codexRoot });
  assert.deepEqual(firstMirror.copied, ['using-superpowers', 'brainstorming', 'verification-before-completion']);
  assert.ok(existsSync(path.join(codexRoot, 'brainstorming', 'SKILL.md')), 'copies skill directories');

  const secondMirror = mirrorSuperpowerSkills({ sourceRoot: root, destRoot: codexRoot });
  assert.deepEqual(secondMirror.copied, [], 'does not recopy unchanged skills');
  assert.deepEqual(secondMirror.unchanged, ['using-superpowers', 'brainstorming', 'verification-before-completion']);

  const userContent = '# Existing Project Instructions\n\nKeep this line.\n';
  const block = codexBootstrapBlock({ scope: 'repo' });
  const once = upsertManagedBlock(userContent, block);
  const twice = upsertManagedBlock(once, block);
  assert.equal(twice, once, 'managed AGENTS block is idempotent');
  assert.ok(twice.startsWith(userContent), 'preserves existing AGENTS.md content');
  assert.equal((twice.match(/ai-task-manager:codex-superpowers:start/g) ?? []).length, 1, 'writes one start marker');
  assert.match(twice, /using-superpowers/, 'bootstrap block names using-superpowers');
  assert.match(twice, /\.agents\/skills\/task\/SKILL\.md/, 'keeps the AITM task skill separate');

  const missingHome = mkdtempSync(path.join(tmpdir(), 'aitm-codex-superpowers-missing-'));
  try {
    assert.equal(findSuperpowersSkillRoot({ home: missingHome }), null, 'missing Superpowers cache is a normal fallback');
  } finally {
    rmSync(missingHome, { recursive: true, force: true });
  }

  console.log('codex-superpowers.test.mjs: all assertions passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
