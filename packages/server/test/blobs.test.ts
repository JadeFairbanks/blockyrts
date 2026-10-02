// The save-file stores. S3 runs against TEST_S3_ENDPOINT when set (CI starts
// S3Mock); a tiny fake S3 checks the client wiring everywhere else.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DiskBlobStore, MemoryBlobStore, S3BlobStore, type BlobStore } from '../src/blobs.ts';

/** Path-style PUT, GET and DELETE on one bucket, without checking signatures. */
function fakeS3(): Promise<{ server: Server; url: string; objects: Map<string, Buffer> }> {
  const objects = new Map<string, Buffer>();
  const server = createServer((req, res) => {
    const key = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200, { ETag: '"x"' }).end();
      });
    } else if (req.method === 'GET') {
      const o = objects.get(key);
      if (!o) {
        res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code><Message>none</Message></Error>');
      } else res.writeHead(200, { 'Content-Length': o.length }).end(o);
    } else if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204).end();
    } else res.writeHead(405).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, objects })));
}

let dir = '';
let fake: Awaited<ReturnType<typeof fakeS3>>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'blobs-'));
  fake = await fakeS3();
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  fake.server.close();
});

const s3 = (endpoint: string, bucket: string, id = 'test', secret = 'testtesttest', region = 'auto'): S3BlobStore =>
  new S3BlobStore({ endpoint, bucket, accessKeyId: id, secretAccessKey: secret, region });

const stores: Array<[string, () => BlobStore]> = [
  ['memory', () => new MemoryBlobStore()],
  ['disk', () => new DiskBlobStore(dir)],
  ['fake s3', () => s3(fake.url, 'saves')],
];
const real = process.env.TEST_S3_ENDPOINT;
if (real) {
  const env = process.env;
  stores.push(['s3', () => s3(real, env.TEST_S3_BUCKET ?? 'saves', env.TEST_S3_ACCESS_KEY_ID, env.TEST_S3_SECRET_ACCESS_KEY, env.TEST_S3_REGION ?? 'us-east-1')]);
}

describe.each(stores)('blob store (%s)', (_name, make) => {
  it('stores, reads back and deletes bytes', async () => {
    const store = make();
    const key = `saves/acc/${Date.now()}-${Math.random().toString(36).slice(2)}.sac`;
    const data = new Uint8Array(70_000).map((_, i) => (i * 31) & 255);
    await store.put(key, data);
    expect(await store.get(key)).toEqual(data);
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
    await store.delete(key);
  });

  it('refuses keys that climb out of the store', async () => {
    await expect(make().put('../escape', new Uint8Array(1))).rejects.toThrow();
  });
});

it('the S3 store uses path-style addressing', async () => {
  await s3(fake.url, 'saves').put('saves/a/b.sac', new Uint8Array([1]));
  expect([...fake.objects.keys()]).toContain('/saves/saves/a/b.sac');
});
