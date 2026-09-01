// @story #1218
// Explicit declarative project provider. Returns validated plans only.

export function createProjectVerificationProvider({ config, appendTargeted }) {
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
      const targeted = appendTargeted({
        declaredCommands,
        existingSteps: config.testSteps,
      });
      return {
        providerId: 'project',
        stage: 'test',
        setup: config.setup,
        steps: [...config.testSteps, ...targeted],
        derivedSteps: [],
        requiredClassifications: config.testSteps.map(({ classification }) => classification),
      };
    },
  };
}
