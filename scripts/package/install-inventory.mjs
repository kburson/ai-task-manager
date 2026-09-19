// @story #1692 #1694
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { TEMPLATE_FILES, referenceTemplateFiles } from '../../bin/lib/template-manifest.mjs';
import { renderStampedSkillVersion } from '../../bin/lib/stamp-skill-version.mjs';

function digestContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

function digestFile(path) {
  return digestContent(readFileSync(path));
}

function exactFile(id, path, source) {
  return Object.freeze({
    id,
    path,
    kind: 'file',
    ownership: 'generated',
    required: true,
    contract: 'exact',
    digest: digestFile(source),
  });
}

const CONFIGS = Object.freeze([
  ['project-fields', 'project-fields.json', 'project-fields.default.json'],
  ['project-field-events', 'project-field-events.json', 'project-field-events.default.json'],
  ['activity-policy', 'activity-policy.json', 'activity-policy.default.json'],
]);

export function collectPackageInventory(packageRoot, { templateFiles = TEMPLATE_FILES } = {}) {
  let packageVersion;
  try {
    packageVersion = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
  } catch {
    packageVersion = null;
  }
  const templates = templateFiles
    .filter((name) => existsSync(join(packageRoot, 'templates', name)))
    .map((name) => {
      const source = join(packageRoot, 'templates', name);
      const item = exactFile(
        `template.${name}`,
        posix.join('.ai-task-manager/templates', name),
        source
      );
      if (name === 'pickup-directive.md' && packageVersion) {
        return Object.freeze({
          ...item,
          digest: digestContent(
            renderStampedSkillVersion(readFileSync(source, 'utf8'), packageVersion)
          ),
        });
      }
      return item;
    });
  const references = referenceTemplateFiles(join(packageRoot, 'templates', 'references')).map(
    (name) =>
      exactFile(
        `reference.${name}`,
        posix.join('.ai-task-manager/templates/references', name),
        join(packageRoot, 'templates', 'references', name)
      )
  );
  const configs = CONFIGS.filter(([, , source]) =>
    existsSync(join(packageRoot, 'config', source))
  ).map(([id, target, source]) =>
    Object.freeze({
      id: `config.${id}`,
      path: posix.join('.ai-task-manager', target),
      kind: 'json-fragment',
      ownership: 'reference',
      required: true,
      contract: id,
      digest: digestFile(join(packageRoot, 'config', source)),
    })
  );
  const byPath = (a, b) => a.path.localeCompare(b.path);
  return Object.freeze({
    templates: Object.freeze(templates.sort(byPath)),
    references: Object.freeze(references.sort(byPath)),
    configs: Object.freeze(configs.sort(byPath)),
  });
}
