// @story #2165 — pure source transformation; importing this file installs no hook.
const header = 'async function compareReadOnlyDeliveryContent(input, output, observation) {';
const tail = '\n}\n\n/** Read-only readers share no state across command boundaries. */';

export function observeComparator(source) {
  if (source.split(header).length !== 2 || source.split(tail).length !== 2)
    throw new Error('close-cumulative-trace:ambiguous-comparator');
  return source
    .replace(
      header,
      header +
        '\n  process.stderr.write(JSON.stringify({closeCumulativeTrace:"entry",input})+"\\n");\n  try {'
    )
    .replace(
      tail,
      '\n  } catch (error) {\n' +
        '    process.stderr.write(JSON.stringify({closeCumulativeTrace:"throw",input,error:{name:error.name,message:error.message,stack:error.stack}})+"\\n");\n' +
        '    throw error;\n  }' +
        tail
    );
}
