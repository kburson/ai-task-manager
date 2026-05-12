import { setConfigValue, formatConfig, DEFAULTS } from '../config.mjs';

export function verbConfig(ctx) {
  const { rest, cfg } = ctx;
  if (rest.length === 0) {
    console.log(formatConfig(cfg));
    return;
  }
  if (rest[0] === 'init') {
    console.log('Run /task config init from a Claude session to start the configuration interview.');
    return;
  }
  if (rest.length === 1) {
    const [k] = rest;
    if (!(k in DEFAULTS)) { console.error(`unknown config key: ${k}`); process.exit(1); }
    console.log(`${k} = ${JSON.stringify(cfg[k])} (source: ${cfg._sources[k]})`);
    return;
  }
  const [k, ...v] = rest;
  try {
    const set = setConfigValue(k, v.join(' '));
    console.log(`${k} = ${JSON.stringify(set)} (project-local)`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
