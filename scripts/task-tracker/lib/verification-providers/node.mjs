// @story #1218
// Default Node verification provider. Returns plans only; core executes them.

import { existsSync } from 'node:fs';
import path from 'node:path';

import { normalizeDevelopIterationSteps } from '../develop-verification-steps.mjs';
import { selectAffectedTests as defaultSelectAffectedTests } from '../test-impact-selector.mjs';
import { partitionVerificationCommands } from '../verification-commands.mjs';

const JAVASCRIPT_RE = /\.(?:c?js|mjs)$/i;
const FORMATTABLE_RE = /\.(?:c?js|mjs|json|md|ya?ml)$/i;

function coreStep({ classification, kind, command, args, label }) {
  return { classification, kind, command, args, label, allowlistSource: 'core' };
}

function buildIterationSteps(changedPaths = []) {
  const javascript = changedPaths.filter((file) => JAVASCRIPT_RE.test(file));
  const formattable = changedPaths.filter((file) => FORMATTABLE_RE.test(file));
  const steps = [];
  if (javascript.length > 0) {
    steps.push(
      coreStep({
        classification: 'lint-changed',
        kind: 'lint',
        command: 'npx',
        args: ['eslint', '--fix', ...javascript],
        label: `eslint --fix (${javascript.length} changed file(s))`,
      })
    );
  }
  if (formattable.length > 0) {
    steps.push(
      coreStep({
        classification: 'format-changed',
        kind: 'format',
        command: 'npx',
        args: ['prettier', '--write', ...formattable],
        label: `prettier --write (${formattable.length} changed file(s))`,
      })
    );
  }
  return steps;
}

function legacyKind(classification) {
  if (classification.includes('format')) return 'format';
  if (classification.includes('lint')) return 'lint';
  if (classification.includes('build')) return 'build';
  if (classification.includes('environment')) return 'environment';
  return 'test';
}

export function createNodeVerificationProvider({
  projectDir,
  legacyDevelopVerification,
  appendTargeted,
  deps = {},
}) {
  const selectAffectedTests = deps.selectAffectedTests || defaultSelectAffectedTests;
  const pathExists = deps.pathExists || ((file) => existsSync(path.join(projectDir, file)));

  return {
    id: 'node',
    planDevelopIteration({ changedPaths = [] } = {}) {
      const legacy = normalizeDevelopIterationSteps(legacyDevelopVerification, {
        projectDir,
        ...(deps.validateCommand ? { validateCommand: deps.validateCommand } : {}),
      });
      if (legacy.configured) {
        const steps = legacy.steps.map((step) => ({
          ...step,
          kind: legacyKind(step.classification),
        }));
        return {
          providerId: 'node',
          stage: 'develop-iteration',
          setup: null,
          steps,
          derivedSteps: [],
          requiredClassifications: steps.map(({ classification }) => classification),
        };
      }
      const selection = selectAffectedTests({ projectDir, changedPaths });
      const steps = [
        ...buildIterationSteps(changedPaths.filter(pathExists)),
        ...selection.tests.map((file) =>
          coreStep({
            classification: 'test-affected',
            kind: 'test',
            command: 'node',
            args: ['--test', file],
            label: `node --test ${file}`,
          })
        ),
      ];
      return {
        providerId: 'node',
        stage: 'develop-iteration',
        setup: null,
        steps,
        derivedSteps: [],
        requiredClassifications: [...new Set(steps.map(({ classification }) => classification))],
        selection,
      };
    },
    planDevelopFinal() {
      const steps = [
        coreStep({
          classification: 'lint-full',
          kind: 'lint',
          command: 'npm',
          args: ['run', 'lint'],
          label: 'npm run lint',
        }),
        coreStep({
          classification: 'format-full',
          kind: 'format',
          command: 'npm',
          args: ['run', 'format:check'],
          label: 'npm run format:check',
        }),
      ];
      return {
        providerId: 'node',
        stage: 'develop-final',
        setup: null,
        steps,
        derivedSteps: [],
        requiredClassifications: ['lint-full', 'format-full'],
      };
    },
    planTest({ declaredCommands = [], includeCompleteLanes = true } = {}) {
      const partition = partitionVerificationCommands({
        commands: declaredCommands,
        includeCompleteLanes,
      });
      const complete = partition.completeLanes.map(({ classification, command }) => {
        const argv = command.split(' ');
        return coreStep({
          classification,
          kind: 'test',
          command: argv[0],
          args: argv.slice(1),
          label: command,
        });
      });
      const targeted = appendTargeted({
        declaredCommands: partition.targeted,
        existingSteps: complete,
      });
      const derivedSteps = partition.compatibility.map(({ classification, command }) => ({
        classification,
        command,
        requires:
          classification === 'test-all-legacy'
            ? ['test-unit', 'test-integration', 'test-slow']
            : ['test-unit', 'test-integration'],
      }));
      return {
        providerId: 'node',
        stage: 'test',
        setup: 'npm-ci',
        steps: [...complete, ...targeted],
        derivedSteps,
        requiredClassifications: complete.map(({ classification }) => classification),
      };
    },
  };
}
