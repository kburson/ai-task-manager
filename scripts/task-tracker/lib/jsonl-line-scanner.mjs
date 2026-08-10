// Bounded synchronous JSONL reader shared by lifecycle startup consumers.
// Memory is proportional to one record plus a fixed byte buffer, rather than
// the aggregate transcript size.
import { closeSync, openSync, readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const DEFAULT_CHUNK_SIZE = 64 * 1024;

export function scanJsonlRecords(
  filePath,
  { chunkSize = DEFAULT_CHUNK_SIZE, onRecord = () => {}, onMalformed = () => {} } = {}
) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError('scanJsonlRecords: chunkSize must be a positive integer');
  }
  if (typeof onRecord !== 'function' || typeof onMalformed !== 'function') {
    throw new TypeError('scanJsonlRecords: callbacks must be functions');
  }

  const fd = openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(chunkSize);
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let totalLines = 0;

  const visit = (line) => {
    if (line === '') return;
    const lineNumber = totalLines++;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      onMalformed(line, lineNumber);
      return;
    }
    onRecord(record, lineNumber);
  };

  try {
    let bytesRead;
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      pending += decoder.write(buffer.subarray(0, bytesRead));
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        visit(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.end();
    visit(pending);
  } finally {
    closeSync(fd);
  }

  return totalLines;
}
