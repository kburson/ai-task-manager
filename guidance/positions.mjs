// @story #1671

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

export function decodeGuidanceSource(input) {
  let source;
  if (typeof input === 'string') {
    source = input;
  } else if (input instanceof Uint8Array) {
    try {
      source = decoder.decode(input);
    } catch {
      const error = new TypeError('guidance source is not valid UTF-8');
      error.code = 'guidance-invalid-utf8';
      throw error;
    }
  } else {
    throw new TypeError('guidance source must be a string or Uint8Array');
  }
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export function createPositionIndex(source) {
  if (typeof source !== 'string') throw new TypeError('position source must be a string');
  const starts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === '\n') starts.push(offset + 1);
  }
  return {
    positionAt(offset) {
      if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
        throw new RangeError('position offset is outside normalized source');
      }
      let low = 0;
      let high = starts.length;
      while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (starts[middle] <= offset) low = middle;
        else high = middle;
      }
      return { line: low + 1, column: offset - starts[low] + 1 };
    },
  };
}
