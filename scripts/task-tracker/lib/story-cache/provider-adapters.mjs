// @story #2039 #2066 #2089 #2103
// Provider observations are evidence, never admission or server-side compare-and-swap.
import { createHash } from 'node:crypto';
import { ghClient } from '../../../gh/lib/gh-client.mjs';
import { prepareGraphqlQuery } from '../graphql-usage/identity.mjs';
import { usageEnabled } from '../graphql-usage/collection.mjs';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { observeContent } from './native-observation.mjs';
import { parseAitmRecord } from '../github-records/record-envelope.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const same = (a, b) => json(a) === json(b);
const token = (value) =>
  typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value);
function unconfirmed(reason) {
  throw Object.assign(new Error(`Story effect unconfirmed: ${reason}`), {
    code: 'STORY_EFFECT_UNCONFIRMED',
    reason,
  });
}
function purpose(body, identity, nodeId) {
  if (body.split('\n').some((line) => line.trim() === '⏱ Timing Log')) return 'timing';
  try {
    const { envelope } = parseAitmRecord({
      commentNodeId: nodeId,
      body,
      expectedRepository: identity.repository,
      expectedIssue: identity.issueNumber,
    });
    return `record:${envelope.recordId}`;
  } catch (error) {
    if (error.message !== 'record-envelope:missing') unconfirmed('record-owner');
  }
  const markers = [...body.matchAll(/<!-- aitm-owned-comment key="([^"]+)" -->/g)];
  if (markers.length !== 1) unconfirmed('comment-owner');
  return `marker:${markers[0][1]}`;
}
/** Strict typed outcome shared with read-only recovery; no remote I/O or retries. */
export function confirmResourceEffect(effect, value, { baseline } = {}) {
  if (value?.complete !== true || !same(value.identity, effect.target.identity))
    unconfirmed('incomplete-identity');
  if (effect.kind === 'project-field-update') {
    if (!same(value.field, effect.candidate) || hash(json(value.field)) !== effect.intendedDigest)
      unconfirmed('field-readback');
    return {
      outcome: {
        state: 'confirmed',
        providerId: effect.target.fieldId,
        digest: effect.intendedDigest,
        revision: structuredClone(value.field),
      },
      field: structuredClone(value.field),
    };
  }
  const observed = observeContent(value);
  const issue = effect.kind === 'issue-update';
  const body = typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body;
  // Exact returned bytes are retained. Only the existing issue trailing-ws transport rule applies.
  const equalBody = issue
    ? observed.body.replace(/\s+$/, '') === body.replace(/\s+$/, '')
    : observed.body === body;
  if (
    !same(observed.identity, effect.target.identity) ||
    observed.kind !== (issue ? 'issue' : 'comment') ||
    !equalBody
  )
    unconfirmed('content-readback');
  const id = observed.key.slice(observed.key.indexOf(':') + 1);
  if (
    issue
      ? id !== effect.target.issueNodeId || value.title !== effect.candidate.title
      : effect.kind === 'comment-update' && id !== effect.target.commentNodeId
  )
    unconfirmed('target-readback');
  if (effect.kind === 'comment-create') {
    if (
      !baseline ||
      baseline.inventory.includes(id) ||
      !Array.isArray(value.inventory) ||
      value.inventory.some((row) => !token(row.id) || typeof row.body !== 'string') ||
      new Set(value.inventory.map((row) => row.id)).size !== value.inventory.length
    )
      unconfirmed('creation-inventory');
    const expectedIds = [...baseline.inventory, id].sort();
    if (!same(value.inventory.map((row) => row.id).sort(), expectedIds))
      unconfirmed('creation-inventory-drift');
    for (const row of value.inventory) {
      if (row.id !== id && hash(row.body) !== baseline.resources?.[`comment:${row.id}`]?.digest)
        unconfirmed('creation-content-drift');
    }
    const wanted = purpose(body, effect.target.identity, id);
    const matches = value.inventory.filter((row) => {
      try {
        return purpose(row.body, effect.target.identity, row.id) === wanted;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1 || matches[0].id !== id || matches[0].body !== body)
      unconfirmed('creation-ambiguous');
  }
  return {
    outcome: {
      state: 'confirmed',
      providerId: id,
      digest: observed.digest,
      revision: observed.revision,
    },
    observed,
  };
}
const content =
  'id body lastEditedAt userContentEdits(first:1){totalCount nodes{id editedAt deletedAt}}';
async function defaultGraphql({ query, variables, host }) {
  const prepared = usageEnabled(process.env) ? prepareGraphqlQuery(query) : { query, alias: null };
  const env = prepared.alias
    ? { ...process.env, AITM_GRAPHQL_USAGE_PRIVATE: JSON.stringify({ alias: prepared.alias }) }
    : process.env;
  // Match the repository JSON-input transport: gh --field only coerces integers.
  // execFile retains the native timeout/maxBuffer bounds while stdin carries exact JSON types.
  const raw = await new Promise((resolve, reject) => {
    const child = ghClient.execFile(
      'gh',
      ['api', 'graphql', '--hostname', host, '--input', '-'],
      { env, timeout: 30000, maxBuffer: 4194304 },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    );
    child.stdin.on('error', (error) => {
      if (error?.code !== 'EPIPE') reject(error);
    });
    child.stdin.end(JSON.stringify({ query: prepared.query, variables }));
  });
  const parsed = JSON.parse(raw);
  if (prepared.alias && parsed.data) delete parsed.data[prepared.alias];
  return parsed;
}
/** Unexposed transport seam. observe is a bounded native target reader, not an authority collector.
 * #2073 createFieldEffectReaders may supply Estimate/Size observations at this seam only when
 * the caller retains exact typed IDs/options. Its scalar/body projection cannot prove native
 * content revisions or the complete cache vector, so it is never used as snapshot authority.
 */
export function createStoryProviderAdapters({
  graphql = defaultGraphql,
  observe,
  capabilities,
  validateIssue,
} = {}) {
  if (
    typeof graphql !== 'function' ||
    typeof observe !== 'function' ||
    !Array.isArray(capabilities) ||
    typeof validateIssue !== 'function'
  )
    unconfirmed('ports');
  return Object.freeze({
    capabilities,
    validateIssue,
    observe,
    async apply(effect) {
      const target = effect.target,
        identity = target.identity;
      let query, variables, select;
      if (effect.kind === 'issue-update') {
        query = `mutation StoryIssue($id:ID!,$body:String!,$title:String!){updateIssue(input:{id:$id,body:$body,title:$title}){issue{${content} title}}}`;
        variables = {
          id: target.issueNodeId,
          body: effect.candidate.body,
          title: effect.candidate.title,
        };
        select = 'updateIssue';
      } else if (effect.kind === 'comment-update') {
        query = `mutation StoryComment($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){issueComment{${content}}}}`;
        variables = {
          id: target.commentNodeId,
          body: typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body,
        };
        select = 'updateIssueComment';
      } else if (effect.kind === 'comment-create') {
        query = `mutation StoryCreate($id:ID!,$body:String!){addComment(input:{subjectId:$id,body:$body}){commentEdge{node{${content}}}}}`;
        variables = {
          id: identity.issueNodeId,
          body: typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body,
        };
        select = 'addComment';
      } else if (effect.kind === 'project-field-update') {
        const row = effect.candidate;
        const absent = row.value === null || same(row.value, { state: 'absent' });
        const property = {
          NUMBER: 'number',
          TEXT: 'text',
          DATE: 'date',
          SINGLE_SELECT: 'singleSelectOptionId',
          ITERATION: 'iterationId',
        }[row.type];
        if (!property) unconfirmed('field-type');
        variables = { project: target.projectId, item: target.itemId, field: target.fieldId };
        if (absent)
          query =
            'mutation StoryClear($project:ID!,$item:ID!,$field:ID!){clearProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field}){projectV2Item{id}}}';
        else {
          const type = row.type === 'NUMBER' ? 'Float!' : row.type === 'DATE' ? 'Date!' : 'String!';
          variables.value = row.type === 'SINGLE_SELECT' ? row.value.optionId : row.value;
          query = `mutation StoryField($project:ID!,$item:ID!,$field:ID!,$value:${type}){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{${property}:$value}}){projectV2Item{id}}}`;
        }
        // An item ID alone never proves the exact field value; publisher performs one read-back.
        return graphql({ query, variables, host: identity.host });
      } else unconfirmed('effect-kind');
      const result = await graphql({ query, variables, host: identity.host });
      if (result?.errors?.length) unconfirmed('provider-errors');
      const data = result?.data?.[select];
      const node = data?.issue ?? data?.issueComment ?? data?.commentEdge?.node;
      if (!node) return null;
      // The current-content parser requires explicit includesCreatedEdit; do not infer it
      // for a nonempty history whose creation semantics were not supplied by the reader.
      if (node.userContentEdits?.totalCount === 0 && node.lastEditedAt === null)
        node.includesCreatedEdit = false;
      return {
        complete: true,
        identity,
        node,
        body: node.body,
        ...(select === 'updateIssue' ? { title: node.title } : {}),
      };
    },
  });
}
