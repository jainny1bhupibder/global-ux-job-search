// Diagnoses the "Repeated storage conflicts" error by testing the Blob store directly.
// Usage:  vercel env pull .env.blobcheck --environment=production --yes
//         node --env-file=.env.blobcheck scripts/blob-check.mjs
//         rm .env.blobcheck
// It only writes one scratch blob (global-ux-job-search/_debug.json) and deletes it again.
import { get, put, list, del } from '@vercel/blob';

const prefix = 'global-ux-job-search/';
const debug = `${prefix}_debug.json`;
const step = async (label, fn) => {
  try {
    const out = await fn();
    console.log(`OK    ${label}`, out ?? '');
    return out;
  } catch (e) {
    console.log(`FAIL  ${label}: ${e?.constructor?.name}: ${String(e?.message).slice(0, 300)}`);
  }
};

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.log('BLOB_READ_WRITE_TOKEN is missing; run the vercel env pull step first.');
  process.exit(1);
}

const l = await step('list existing blobs', async () => (await list({ prefix })).blobs.map(b => `${b.pathname} (${b.size} B)`));

for (const name of ['jobs.json', 'runs.json']) {
  await step(`get ${name}`, async () => {
    const r = await get(`${prefix}${name}`, { access: 'private', useCache: false });
    return r ? `status ${r.statusCode}, etag ${JSON.stringify(r.blob.etag)}` : 'NOT FOUND';
  });
}

await step('create scratch blob (no overwrite)', () =>
  put(debug, '{"n":1}', { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' }).then(() => 'created'));

const read = await step('read scratch blob', async () => {
  const r = await get(debug, { access: 'private', useCache: false });
  return { etag: r.blob.etag };
});

if (read) {
  await step('overwrite with ifMatch = etag from get()', () =>
    put(debug, '{"n":2}', { access: 'private', addRandomSuffix: false, allowOverwrite: true, ifMatch: read.etag, contentType: 'application/json' }).then(() => 'overwritten'));
}

// A larger JSON file is served compressed, which is when Blob returns a weak etag.
const big = JSON.stringify({ rows: Array.from({ length: 400 }, (_, i) => ({ i, text: 'design job '.repeat(8) })) });
await step('create large scratch blob', () =>
  put(debug, big, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }).then(() => 'created'));
const bigRead = await step('read large scratch blob', async () => {
  const r = await get(debug, { access: 'private', useCache: false });
  return { etag: r.blob.etag };
});
if (bigRead) {
  await step('large: overwrite with raw etag', () =>
    put(debug, big, { access: 'private', addRandomSuffix: false, allowOverwrite: true, ifMatch: bigRead.etag, contentType: 'application/json' }).then(() => 'overwritten'));
  await step('large: overwrite with weak prefix stripped', () =>
    put(debug, big, { access: 'private', addRandomSuffix: false, allowOverwrite: true, ifMatch: bigRead.etag.replace(/^W\//, ''), contentType: 'application/json' }).then(() => 'overwritten'));
}

await step('delete scratch blob', () => del(debug).then(() => 'deleted'));
