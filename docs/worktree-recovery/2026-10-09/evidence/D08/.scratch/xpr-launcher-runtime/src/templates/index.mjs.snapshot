import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AprError } from '../errors.mjs';

const fields = (values) => Object.freeze(values);
const catalog = Object.assign(Object.create(null), {
  'author-startup': fields([
    'review_id',
    'mode_banner',
    'artifact_absolute',
    'workspace_absolute',
    'response_absolute',
    'invitation_absolute',
    'artifact_display',
    'workspace_display',
    'response_display',
    'invitation_display',
    'invitation_payload',
    'installed_join_display',
    'zero_install_join_display',
    'recovery_display',
  ]),
  'reviewer-invitation': fields([
    'review_id',
    'mode_banner',
    'artifact_absolute',
    'workspace_absolute',
    'response_absolute',
    'invitation_absolute',
    'artifact_display',
    'workspace_display',
    'response_display',
    'invitation_display',
    'invitation_payload',
    'installed_join_display',
    'zero_install_join_display',
    'recovery_display',
  ]),
  'reviewer-response': fields([
    'frontmatter',
    'mode_banner',
    'summary',
    'findings',
    'required_changes',
    'optional_suggestions',
    'decision',
  ]),
  'author-response': fields([
    'frontmatter',
    'mode_banner',
    'summary',
    'finding_dispositions',
    'changes_made',
    'declined_changes',
    'verification',
  ]),
  'human-decision': fields(['frontmatter', 'mode_banner', 'human_rationale']),
  'review-manifest': fields(['mode_banner', 'manifest_body']),
});

export const TEMPLATE_VARIABLES = Object.freeze(catalog);
export const TEMPLATE_NAMES = Object.freeze(Object.keys(catalog));

function fail(message, details = {}) {
  throw new AprError('APR_TEMPLATE_INVALID', message, {
    recovery: 'Use a documented template name and its exact normalized variable set.',
    details,
  });
}

function source(name) {
  try {
    return readFileSync(new URL(`../../templates/${name}.md`, import.meta.url));
  } catch (cause) {
    fail('Package template data is unavailable.', { name, cause: cause.code ?? cause.message });
  }
}

function templateDigest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function hydrateTemplate(name, variables) {
  if (!Object.hasOwn(catalog, name)) fail('Template name is unknown.', { name });
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    fail('Template variables must be an object.', { name });
  }
  const actual = Object.keys(variables).sort();
  const expected = [...catalog[name]].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index]) ||
    Object.getOwnPropertySymbols(variables).length
  ) {
    fail('Template variables do not match the closed catalog.', { name, fields: actual });
  }
  const raw = source(name);
  const replacements = {
    ...variables,
    template_version: '1',
    template_digest: templateDigest(raw),
  };
  for (const key of expected.filter((value) => value.endsWith('_absolute'))) {
    const value = variables[key];
    if (
      typeof value !== 'string' ||
      !(path.posix.isAbsolute(value) || path.win32.isAbsolute(value))
    ) {
      fail('Operational template paths must be absolute.', { name, key });
    }
  }
  let output = raw.toString('utf8');
  for (const [key, value] of Object.entries(replacements)) {
    if (
      typeof value !== 'string' ||
      !value.isWellFormed() ||
      value !== value.normalize('NFC') ||
      value.includes('{{') ||
      value.includes('}}')
    ) {
      fail('Template variable is not safe normalized text.', { name, key });
    }
    output = output.replaceAll(`{{${key}}}`, value);
  }
  const unresolved = [...output.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]);
  if (unresolved.length) fail('Template has unresolved placeholders.', { name, unresolved });
  return Buffer.from(output, 'utf8');
}
