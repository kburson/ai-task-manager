// @story #1769
// Fixed #1558 release ceilings. Historical measure-context budgets remain
// separate because their idle and parallel scenarios have different meanings.
export const GUIDANCE_CONTEXT_BUDGETS = Object.freeze({
  routerPlusPickup: Object.freeze({ absolute: 5000, working: 4000 }),
  clean: Object.freeze({ absolute: 300, working: 240 }),
  blocked: Object.freeze({ absolute: 500, working: 400 }),
  fullLifecycle: Object.freeze({ absolute: 7000, working: 5600 }),
});

export const HISTORICAL_CONTEXT_BUDGETS = Object.freeze({
  idle: 1500,
  invoked: 8000,
  active: 12000,
});

export const HISTORICAL_SCENARIO_BUDGETS = Object.freeze({
  claude: Object.freeze({
    bind: 12000,
    'bind+review+close': 13500,
    'parallel-orchestration': 14000,
  }),
  codex: Object.freeze({
    bind: 12000,
    'bind+review+close': 17000,
    'parallel-orchestration': 17500,
  }),
});
