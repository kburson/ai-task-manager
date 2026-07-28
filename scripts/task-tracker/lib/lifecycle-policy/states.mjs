const STATE_DESCRIPTORS = Object.freeze([
  Object.freeze({
    id: 'backlog',
    configKey: 'kanbanOptionBacklog',
  }),
  Object.freeze({
    id: 'on-deck',
    configKey: 'kanbanOptionOnDeck',
  }),
  Object.freeze({
    id: 'refine',
    configKey: 'kanbanOptionRefine',
  }),
  Object.freeze({
    id: 'plan',
    configKey: 'kanbanOptionPlan',
  }),
  Object.freeze({
    id: 'develop',
    configKey: 'kanbanOptionDevelop',
  }),
  Object.freeze({
    id: 'test',
    configKey: 'kanbanOptionTest',
  }),
  Object.freeze({
    id: 'review',
    configKey: 'kanbanOptionReview',
  }),
  Object.freeze({
    id: 'done',
    configKey: 'kanbanOptionDone',
  }),
]);

const STATE_IDS = Object.freeze(STATE_DESCRIPTORS.map(({ id }) => id));
const STATE_INDEXES = new Map(STATE_IDS.map((state, index) => [state, index]));
const CONFIG_KEYS = new Map(STATE_DESCRIPTORS.map(({ id, configKey }) => [id, configKey]));

export function stateIds() {
  return STATE_IDS;
}

export function stateIndex(state) {
  return STATE_INDEXES.get(state) ?? -1;
}

export function stateConfigKey(state) {
  return CONFIG_KEYS.get(state);
}
