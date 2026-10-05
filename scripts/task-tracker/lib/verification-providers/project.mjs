// @story #1218
// Explicit declarative project provider. Returns validated plans only.

export function createProjectVerificationProvider({ config, appendTargeted, commandIdentity }) {
  return {
    id: 'project',
    planDevelopIteration() {
      return {
        providerId: 'project',
        stage: 'develop-iteration',
        setup: null,
        steps: config.iterationSteps,
        derivedSteps: [],
        requiredClassifications: config.iterationSteps.map(({ classification }) => classification),
      };
    },
    planDevelopFinal() {
      return {
        providerId: 'project',
        stage: 'develop-final',
        setup: null,
        steps: config.finalSteps,
        derivedSteps: [],
        requiredClassifications: config.finalSteps.map(({ classification }) => classification),
      };
    },
    planTest({ declaredCommands = [] } = {}) {
      const coverage = new Map(
        config.declaredCommandCoverage.map((entry) => [entry.commandKey, entry])
      );
      const uncovered = [];
      const derivedSteps = [];
      const declaredCovered = new Set();
      const classifications = new Set(config.testSteps.map((step) => step.classification));
      let ordinal = 0;
      for (const item of declaredCommands) {
        const command = String(typeof item === 'string' ? item : item?.command || '').trim();
        const mapping = coverage.size > 0 ? coverage.get(commandIdentity(command)) : undefined;
        if (!mapping) {
          uncovered.push(item);
          continue;
        }
        if (declaredCovered.has(command)) continue;
        declaredCovered.add(command);
        let classification;
        do {
          classification = `test-covered-${++ordinal}`;
        } while (classifications.has(classification));
        classifications.add(classification);
        derivedSteps.push({ classification, command, requires: mapping.requires });
      }
      const targeted = appendTargeted({
        declaredCommands: uncovered,
        existingSteps: config.testSteps,
      });
      return {
        providerId: 'project',
        stage: 'test',
        setup: config.setup,
        setupArgs: config.npmCiArgs,
        steps: [...config.testSteps, ...targeted],
        derivedSteps,
        requiredClassifications: config.testSteps.map(({ classification }) => classification),
      };
    },
  };
}
