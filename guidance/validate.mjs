// @story #1671

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDocumentationReference } from './documentation.mjs';
import { fingerprintCatalog } from './fingerprints.mjs';
import { createPositionIndex, decodeGuidanceSource } from './positions.mjs';
import { parseGuidanceSource } from './parse.mjs';
import {
  AGENT_OPERATIONS,
  CATALOG_SCHEMA,
  GUIDANCE_LIMITS,
  PROHIBITION_IDS,
  VALIDATION_SCHEMA,
  coreGuidanceRequirements,
} from './requirements.mjs';

const TOP_KEYS = new Set(['schema', 'catalog_version', 'provenance', 'entries']);
const ENTRY_KEYS = new Set(['id', 'revision', 'binds', 'agent', 'human']);
const BIND_KEYS = new Set(['action_ids', 'guard_ids', 'remediation_ids']);
const AGENT_KEYS = new Set(['instruction']);
const HUMAN_KEYS = new Set([
  'summary',
  'explanation',
  'triggered_when',
  'execution',
  'examples',
  'documentation',
]);
const PROVENANCE_KEYS = new Set(['based_on_package', 'based_on_catalog_digest']);
const EXAMPLE_KEYS = new Set(['command', 'purpose']);
const DOCUMENTATION_KEYS = new Set(['path', 'anchor']);
const DEFAULT_PACKAGE_ROOT = path.dirname(
  fileURLToPath(new URL('../package.json', import.meta.url))
);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function excerpt(source, line, limit) {
  const text = source.split('\n')[Math.max(0, line - 1)] ?? '';
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function diagnosticFactory(source, ranges) {
  const positions = createPositionIndex(source);
  const errors = [];
  function add(code, path, message, expected = [], remediation = 'Repair this catalog field.') {
    let nearest = path;
    while (nearest && !ranges.has(nearest)) {
      nearest = /\[\d+\]$/.test(nearest)
        ? nearest.replace(/\[\d+\]$/, '')
        : nearest.slice(0, Math.max(0, nearest.lastIndexOf('.')));
    }
    const range = ranges.get(nearest);
    const position = positions.positionAt(range?.start ?? 0);
    errors.push({
      code,
      path,
      line: position.line,
      column: position.column,
      excerpt: excerpt(source, position.line, GUIDANCE_LIMITS.diagnosticExcerptCharacters),
      message,
      expected,
      remediation,
    });
  }
  return { errors, add };
}

function checkUnknown(value, allowed, path, add) {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      add('unknown-field', path ? `${path}.${key}` : key, `Unknown field: ${key}`, [...allowed]);
    }
  }
}

function requireText(value, path, add) {
  if (typeof value !== 'string' || value.trim() === '') {
    add('required-field', path, `${path} requires nonempty text`, ['nonempty string']);
    return false;
  }
  return true;
}

function checkBindingList(value, path, allowed, add) {
  if (!Array.isArray(value)) {
    add('field-type', path, 'Binding list must be an array', ['array']);
    return;
  }
  if (value.length > GUIDANCE_LIMITS.bindingsPerList) {
    add('field-limit', path, 'Binding list exceeds its limit', [GUIDANCE_LIMITS.bindingsPerList]);
  }
  const seen = new Set();
  value.forEach((id, index) => {
    if (seen.has(id)) add('duplicate-binding', `${path}[${index}]`, `Duplicate binding: ${id}`);
    seen.add(id);
    if (typeof id !== 'string' || !allowed.has(id)) {
      add('unknown-reference', `${path}[${index}]`, `Unknown binding: ${String(id)}`, [...allowed]);
    }
  });
}

function checkInstruction(instruction, path, actionIds, boundActionIds, add) {
  if (!isRecord(instruction) || Object.keys(instruction).length !== 1) {
    add('agent-instruction-shape', path, 'Agent instruction must have exactly one operation');
    return;
  }
  const [operation] = Object.keys(instruction);
  const value = instruction[operation];
  if (!AGENT_OPERATIONS.includes(operation)) {
    add(
      'unknown-agent-operation',
      path,
      `Unknown agent instruction operation: ${operation}`,
      AGENT_OPERATIONS,
      'Replace the raw command with a registered operation.'
    );
    return;
  }
  const valid =
    (['query', 'execute'].includes(operation) && actionIds.has(value)) ||
    (operation === 'require_status' && value === 'ready') ||
    (operation === 'if_blocked' && value === 'use_returned_remediation_ids') ||
    (operation === 'never' && PROHIBITION_IDS.includes(value)) ||
    (operation === 'execution_revalidates' && value === true);
  if (!valid) {
    add('invalid-agent-value', path, `Invalid ${operation} value: ${String(value)}`);
  } else if (['query', 'execute'].includes(operation) && !boundActionIds.includes(value)) {
    add(
      'instruction-action-unbound',
      path,
      `${operation} names registered action ${value} outside this entry's action_ids binding`,
      boundActionIds,
      'Bind the action to this entry or correct the instruction value.'
    );
  }
}

function checkStringList(value, path, add) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    add('field-type', path, `${path} must be an array of strings`);
    return;
  }
  value.forEach((item, index) => requireText(item, `${path}[${index}]`, add));
}

function checkHumanLists(human, path, packageRoot, add) {
  checkStringList(human.triggered_when, `${path}.triggered_when`, add);
  checkStringList(human.execution, `${path}.execution`, add);
  if (human.examples !== undefined) {
    if (!Array.isArray(human.examples)) {
      add('field-type', `${path}.examples`, 'Examples must be an array');
    } else {
      human.examples.forEach((example, index) => {
        const examplePath = `${path}.examples[${index}]`;
        if (!isRecord(example)) {
          add('field-type', examplePath, 'Example must be a mapping');
          return;
        }
        checkUnknown(example, EXAMPLE_KEYS, examplePath, add);
        requireText(example.command, `${examplePath}.command`, add);
        requireText(example.purpose, `${examplePath}.purpose`, add);
      });
    }
  }
  if (human.documentation !== undefined) {
    if (!Array.isArray(human.documentation)) {
      add('field-type', `${path}.documentation`, 'Documentation must be an array');
    } else {
      human.documentation.forEach((reference, index) => {
        const referencePath = `${path}.documentation[${index}]`;
        if (!isRecord(reference)) {
          add('field-type', referencePath, 'Documentation reference must be a mapping');
          return;
        }
        checkUnknown(reference, DOCUMENTATION_KEYS, referencePath, add);
        const result = resolveDocumentationReference(reference, { packageRoot });
        if (!result.ok) {
          const field = result.code.includes('anchor') ? 'anchor' : 'path';
          add(
            result.code,
            `${referencePath}.${field}`,
            `Invalid documentation reference: ${result.code}`
          );
        }
      });
    }
  }
}

function proxy(value) {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function measureBudgets(catalog, add) {
  const perEntry = [];
  let agentProxy = 0;
  let humanProxy = 0;
  for (const [index, entry] of catalog.entries.entries()) {
    if (!isRecord(entry)) continue;
    const agent = proxy(entry.agent ?? null);
    const human = proxy(entry.human ?? null);
    const complete = proxy(entry);
    perEntry.push({
      id: entry.id ?? null,
      agentProxy: agent,
      humanProxy: human,
      entryProxy: complete,
    });
    agentProxy += agent;
    humanProxy += human;
    if (agent > GUIDANCE_LIMITS.agentProxy)
      add('budget-limit', `entries[${index}].agent`, 'Agent block exceeds proxy budget');
    if (human > GUIDANCE_LIMITS.humanProxy)
      add('budget-limit', `entries[${index}].human`, 'Human block exceeds proxy budget');
    if (complete > GUIDANCE_LIMITS.entryProxy)
      add('budget-limit', `entries[${index}]`, 'Entry exceeds proxy budget');
  }
  const catalogProxy = proxy(catalog);
  if (agentProxy > GUIDANCE_LIMITS.aggregateAgentProxy)
    add('budget-limit', 'entries', 'Agent blocks exceed aggregate proxy budget');
  if (humanProxy > GUIDANCE_LIMITS.aggregateHumanProxy)
    add('budget-limit', 'entries', 'Human blocks exceed aggregate proxy budget');
  if (catalogProxy > GUIDANCE_LIMITS.catalogProxy)
    add('budget-limit', '', 'Catalog exceeds normalized proxy budget');
  return { perEntry, agentProxy, humanProxy, catalogProxy };
}

function checkEntry(entry, index, requirements, seenIds, packageRoot, add) {
  const path = `entries[${index}]`;
  if (!isRecord(entry)) {
    add('entry-type', path, 'Entry must be a mapping', ['mapping']);
    return;
  }
  checkUnknown(entry, ENTRY_KEYS, path, add);
  if (requireText(entry.id, `${path}.id`, add)) {
    if (entry.id.length > GUIDANCE_LIMITS.idCharacters)
      add('field-limit', `${path}.id`, 'Entry ID exceeds its limit', [
        GUIDANCE_LIMITS.idCharacters,
      ]);
    if (seenIds.has(entry.id)) add('duplicate-id', `${path}.id`, `Duplicate entry ID: ${entry.id}`);
    seenIds.add(entry.id);
  }
  if (!Number.isInteger(entry.revision) || entry.revision < 1)
    add('field-type', `${path}.revision`, 'Revision must be a positive integer');
  if (!isRecord(entry.binds)) {
    add('required-field', `${path}.binds`, 'Entry bindings are required');
  } else {
    checkUnknown(entry.binds, BIND_KEYS, `${path}.binds`, add);
    checkBindingList(
      entry.binds.action_ids,
      `${path}.binds.action_ids`,
      requirements.actionIds,
      add
    );
    checkBindingList(entry.binds.guard_ids, `${path}.binds.guard_ids`, requirements.guardIds, add);
    checkBindingList(
      entry.binds.remediation_ids,
      `${path}.binds.remediation_ids`,
      requirements.remediationIds,
      add
    );
  }
  if (!isRecord(entry.agent)) {
    add('required-field', `${path}.agent`, 'Agent block is required');
  } else {
    checkUnknown(entry.agent, AGENT_KEYS, `${path}.agent`, add);
    if (!Array.isArray(entry.agent.instruction)) {
      add('field-type', `${path}.agent.instruction`, 'Instruction must be an array');
    } else {
      if (entry.agent.instruction.length > GUIDANCE_LIMITS.instructionsPerEntry)
        add('field-limit', `${path}.agent.instruction`, 'Too many instructions');
      entry.agent.instruction.forEach((item, itemIndex) =>
        checkInstruction(
          item,
          `${path}.agent.instruction[${itemIndex}]`,
          requirements.actionIds,
          Array.isArray(entry.binds?.action_ids) ? entry.binds.action_ids : [],
          add
        )
      );
    }
  }
  if (!isRecord(entry.human)) {
    add('required-field', `${path}.human`, 'Human block is required');
  } else {
    checkUnknown(entry.human, HUMAN_KEYS, `${path}.human`, add);
    requireText(entry.human.summary, `${path}.human.summary`, add);
    if (requireText(entry.human.explanation, `${path}.human.explanation`, add)) {
      if (entry.human.explanation.length > GUIDANCE_LIMITS.explanationCharacters)
        add('field-limit', `${path}.human.explanation`, 'Human explanation exceeds its limit');
    }
    checkHumanLists(entry.human, `${path}.human`, packageRoot, add);
  }
}

function earlyFailure(sourcePath, sourceType, code, message, expected, remediation) {
  return {
    schema: VALIDATION_SCHEMA,
    valid: false,
    source: sourcePath,
    sourceType,
    catalogDigest: null,
    errors: [
      {
        code,
        path: '',
        line: 1,
        column: 1,
        excerpt: '',
        message,
        expected,
        remediation,
      },
    ],
    warnings: [],
  };
}

export function validateGuidance({
  source,
  sourcePath = null,
  packageRoot = DEFAULT_PACKAGE_ROOT,
  profile = 'candidate',
  tracked = null,
  fileType = null,
} = {}) {
  if (typeof source !== 'string' && !(source instanceof Uint8Array)) {
    throw new TypeError('validateGuidance requires a source string or byte array');
  }
  const sourceType =
    profile === 'active-project' ? 'project' : profile === 'published' ? 'package' : 'candidate';
  let normalizedSource;
  try {
    normalizedSource = decodeGuidanceSource(source);
  } catch (error) {
    if (error.code !== 'guidance-invalid-utf8') throw error;
    return earlyFailure(
      sourcePath,
      sourceType,
      'invalid-utf8',
      error.message,
      ['valid UTF-8'],
      'Save the catalog as valid UTF-8.'
    );
  }
  if (new TextEncoder().encode(normalizedSource).length > GUIDANCE_LIMITS.normalizedSourceBytes) {
    return earlyFailure(
      sourcePath,
      sourceType,
      'source-limit',
      'Normalized source exceeds 1 MiB',
      [GUIDANCE_LIMITS.normalizedSourceBytes],
      'Reduce the catalog size.'
    );
  }
  const parsed = parseGuidanceSource(normalizedSource);
  const { errors, add } = diagnosticFactory(parsed.source, parsed.ranges);
  if (!['candidate', 'active-project', 'published'].includes(profile)) {
    add('source-profile-invalid', '', `Unknown validation profile: ${profile}`);
  }
  if (profile === 'active-project') {
    if (sourcePath !== '.ai-task-manager/aitm-guidance.yml') {
      add('source-path-invalid', '', 'Active project guidance must use its single supported path');
    }
    if (tracked !== true) {
      add(
        tracked === false ? 'source-untracked' : 'source-tracking-indeterminate',
        '',
        'Active project guidance must be tracked'
      );
    }
  }
  if (profile === 'published' && sourcePath !== 'instructions/aitm-guidance.yml') {
    add('source-path-invalid', '', 'Published guidance must use its package-relative path');
  }
  if (fileType !== null && fileType !== 'regular') {
    add('source-file-type', '', 'Guidance source must be a regular file');
  }
  for (const item of parsed.diagnostics) {
    errors.push({
      ...item,
      excerpt: excerpt(parsed.source, item.line, GUIDANCE_LIMITS.diagnosticExcerptCharacters),
      expected: [],
      remediation: 'Repair the YAML syntax.',
    });
  }
  const value = parsed.value;
  let budgets = null;
  if (errors.length === 0 && !isRecord(value)) add('catalog-type', '', 'Catalog must be a mapping');
  if (isRecord(value)) {
    checkUnknown(value, TOP_KEYS, '', add);
    if (value.schema !== CATALOG_SCHEMA)
      add('catalog-schema', 'schema', 'Unsupported catalog schema', [CATALOG_SCHEMA]);
    if (value.catalog_version !== 1)
      add('catalog-version', 'catalog_version', 'Unsupported catalog version', [1]);
    if (!isRecord(value.provenance)) {
      add('required-field', 'provenance', 'Catalog provenance is required');
    } else {
      checkUnknown(value.provenance, PROVENANCE_KEYS, 'provenance', add);
      requireText(value.provenance.based_on_package, 'provenance.based_on_package', add);
      if (!/^sha256:[a-f0-9]{64}$/.test(value.provenance.based_on_catalog_digest)) {
        add(
          'fingerprint-format',
          'provenance.based_on_catalog_digest',
          'Baseline digest must be sha256 hex'
        );
      }
    }
    const requirements = coreGuidanceRequirements();
    if (!Array.isArray(value.entries)) {
      add('required-field', 'entries', 'Entries must be an array');
    } else {
      if (value.entries.length > GUIDANCE_LIMITS.entries)
        add('field-limit', 'entries', 'Catalog has too many entries', [GUIDANCE_LIMITS.entries]);
      const seenIds = new Set();
      value.entries.forEach((entry, index) =>
        checkEntry(entry, index, requirements, seenIds, packageRoot, add)
      );
      for (const required of requirements.requiredEntries) {
        const matched = value.entries.find((entry) => isRecord(entry) && entry.id === required.id);
        if (!matched) {
          add('guidance-incomplete', 'entries', `Missing required entry: ${required.id}`);
        } else if (required.actionId && !matched.binds?.action_ids?.includes(required.actionId)) {
          add('guidance-incomplete', 'entries', `Missing action binding: ${required.actionId}`);
        } else if (
          required.remediationId &&
          !matched.binds?.remediation_ids?.includes(required.remediationId)
        ) {
          add(
            'guidance-incomplete',
            'entries',
            `Missing remediation binding: ${required.remediationId}`
          );
        }
      }
      budgets = measureBudgets(value, add);
    }
  }
  const fingerprints =
    errors.length === 0
      ? fingerprintCatalog({
          entries: value.entries,
          metadata: {
            schema: value.schema,
            catalog_version: value.catalog_version,
            provenance: value.provenance,
          },
          source: parsed.source,
        })
      : null;
  return {
    schema: VALIDATION_SCHEMA,
    valid: errors.length === 0,
    source: sourcePath,
    sourceType,
    catalogDigest: fingerprints?.catalogFileDigest ?? null,
    errors,
    warnings: [],
    entries: errors.length === 0 ? value.entries : null,
    fingerprints,
    budgets,
  };
}
