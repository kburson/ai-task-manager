// Pure provider transcript normalization for the word counter. This module
// deliberately owns no filesystem, provider-registry, or timing state.

function stringLeaves(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) stringLeaves(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) stringLeaves(item, out);
  }
  return out;
}

function textContent(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        ['text', 'input_text', 'output_text'].includes(item.type) &&
        typeof item.text === 'string'
    )
    .map((item) => item.text)
    .join(' ');
}

function parseToolInput(value) {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toolChip(name, input) {
  const parsed = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (name === 'Bash') return parsed.description || 'Ran command';
  const target =
    parsed.file_path ?? parsed.path ?? parsed.pattern ?? parsed.query ?? parsed.url ?? '';
  return `${name || ''} ${target}`.trim();
}

function toolCall(name, rawInput) {
  const input = parseToolInput(rawInput);
  return { kind: 'tool-call', name: name || '', chip: toolChip(name, input), input };
}

function normalizeClaudeMessage(record) {
  if (record.isMeta || record.isSidechain) {
    return { events: [], recognized: true, schema: 'claude-message-v1' };
  }
  const content = record.message?.content;
  const events = [];
  if (typeof content === 'string') events.push({ kind: 'text', text: content });
  else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        events.push({ kind: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        events.push(toolCall(block.name, block.input));
      } else if (block.type === 'tool_result') {
        events.push({ kind: 'tool-result', text: textContent(block.content) });
      }
    }
  }
  return { events, recognized: true, schema: 'claude-message-v1' };
}

function normalizeCodexPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { events: [], recognized: false, schema: null };
  }
  if (payload.type === 'message') {
    const recognized = ['user', 'assistant', 'developer', 'system'].includes(payload.role);
    if (!recognized) return { events: [], recognized: false, schema: null };
    if (payload.role !== 'user' && payload.role !== 'assistant') {
      return { events: [], recognized: true, schema: 'codex-rollout-v1' };
    }
    const expectedType = payload.role === 'user' ? 'input_text' : 'output_text';
    const events = Array.isArray(payload.content)
      ? payload.content
          .filter((block) => block?.type === expectedType && typeof block.text === 'string')
          .map((block) => ({ kind: 'text', text: block.text }))
      : [];
    return { events, recognized: true, schema: 'codex-rollout-v1' };
  }
  if (payload.type === 'custom_tool_call') {
    return {
      events: [toolCall(payload.name, payload.input)],
      recognized: true,
      schema: 'codex-rollout-v1',
    };
  }
  if (payload.type === 'function_call') {
    return {
      events: [toolCall(payload.name, payload.arguments)],
      recognized: true,
      schema: 'codex-rollout-v1',
    };
  }
  if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
    return {
      events: [{ kind: 'tool-result', text: textContent(payload.output) }],
      recognized: true,
      schema: 'codex-rollout-v1',
    };
  }
  return { events: [], recognized: false, schema: null };
}

function normalizeGrokRecord(record) {
  const schema = 'grok-chat-v1';
  if (record.type === 'reasoning' || record.type === 'system') {
    return { events: [], recognized: true, schema };
  }
  if (record.type === 'tool_result') {
    return {
      events: [{ kind: 'tool-result', text: textContent(record.content) }],
      recognized: true,
      schema,
    };
  }
  if (record.type === 'user' || record.type === 'assistant') {
    const events = [];
    const text = textContent(record.content);
    if (text) events.push({ kind: 'text', text });
    if (record.type === 'assistant' && Array.isArray(record.tool_calls)) {
      for (const call of record.tool_calls) {
        if (!call || typeof call !== 'object') continue;
        const name = call.name ?? call.function?.name;
        const input = call.arguments ?? call.input ?? call.function?.arguments;
        events.push(toolCall(name, input));
      }
    }
    return { events, recognized: true, schema };
  }
  return { events: [], recognized: false, schema: null };
}

export function normalizeTranscriptRecord(record) {
  if (!record || typeof record !== 'object') {
    return { events: [], recognized: false, schema: null };
  }
  if (record.type === 'response_item') return normalizeCodexPayload(record.payload);
  if (record.message) return normalizeClaudeMessage(record);
  return normalizeGrokRecord(record);
}

export function collectTranscriptStringLeaves(value) {
  return stringLeaves(value);
}
