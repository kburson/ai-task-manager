// @story #2165 — explicit test subprocess bootstrap only.
import { registerHooks } from 'node:module';
import { observeComparator } from '../helpers/close-cumulative-observer.mjs';
const target = new URL('../../task-tracker/lib/action-decision/close.mjs', import.meta.url).href;

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== target) return loaded;
    return { ...loaded, source: observeComparator(String(loaded.source)) };
  },
});
