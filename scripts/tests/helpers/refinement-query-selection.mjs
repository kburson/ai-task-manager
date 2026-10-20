// @story #2073 — test-only selection interpreter; no GraphQL runtime dependency.
export function parseSelection(query, variables = {}) {
  const tokens =
    query.match(/"(?:\\.|[^"\\])*"|\.\.\.|[_A-Za-z][_0-9A-Za-z]*|-?\d+(?:\.\d+)?|[^\s,]/g) ?? [];
  let index = tokens.indexOf('{');
  if (index < 0) throw new Error('invalid selection');
  const take = () => tokens[index++];
  const value = () => {
    const token = take();
    if (token === '$') return variables[take()];
    if (token === '{') {
      const out = {};
      while (tokens[index] !== '}') {
        const key = take();
        take();
        out[key] = value();
      }
      take();
      return out;
    }
    if (token === 'null') return null;
    if (token === 'true' || token === 'false') return token === 'true';
    if (/^["\d-]/.test(token)) return JSON.parse(token);
    return token;
  };
  const selection = () => {
    if (take() !== '{') throw new Error('missing selection');
    const fields = [];
    while (tokens[index] !== '}') {
      if (index >= tokens.length) throw new Error('incomplete selection');
      if (take() === '...') {
        if (take() !== 'on') throw new Error('named fragments unsupported');
        const type = take();
        fields.push({ type, fields: selection() });
        continue;
      }
      const alias = tokens[index - 1];
      const name = tokens[index] === ':' ? (take(), take()) : alias;
      const args = {};
      if (tokens[index] === '(') {
        take();
        while (tokens[index] !== ')') {
          const key = take();
          if (take() !== ':') throw new Error('argument');
          args[key] = value();
        }
        take();
      }
      fields.push({ name, alias, args, fields: tokens[index] === '{' ? selection() : null });
    }
    take();
    return fields;
  };
  return selection();
}

export function selectResponse(source, fields, resolve) {
  if (source === null) return null;
  const output = {};
  for (const field of fields) {
    if (field.type) {
      if (!source.__typename || source.__typename === field.type || field.type.endsWith('Common'))
        Object.assign(output, selectResponse(source, field.fields, resolve));
      continue;
    }
    let value = resolve(source, field);
    if (value === undefined) throw new Error('unavailable selected field: ' + field.name);
    if (field.fields && value !== null)
      value = Array.isArray(value)
        ? value.map((entry) => selectResponse(entry, field.fields, resolve))
        : selectResponse(value, field.fields, resolve);
    output[field.alias] = value;
  }
  return output;
}
