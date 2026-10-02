// Where save files live: S3-compatible object storage on a real server
// (Cloudflare R2, MinIO, AWS), a directory for self-hosting, or memory for
// tests. Keys are paths such as "saves/<account>/<save>.sac".

import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface BlobStore {
  put(key: string, data: Uint8Array): Promise<void>;
  /** The bytes, or null if there is no such key. */
  get(key: string): Promise<Uint8Array | null>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}

function checkKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.includes('..')) throw new Error(`bad blob key ${key}`);
}

export class MemoryBlobStore implements BlobStore {
  readonly blobs = new Map<string, Uint8Array>();

  async put(key: string, data: Uint8Array): Promise<void> {
    checkKey(key);
    this.blobs.set(key, data.slice());
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key)?.slice() ?? null;
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}

export class DiskBlobStore implements BlobStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    checkKey(key);
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + sep)) throw new Error(`bad blob key ${key}`);
    return p;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    // Write then rename, so a crash never leaves half a save under the real name.
    const tmp = `${p}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, p);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

export interface S3Options {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** "auto" for Cloudflare R2. */
  region: string;
}

export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: S3Options) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      // Path-style addressing works with R2, MinIO and AWS alike.
      forcePathStyle: true,
      // R2 and MinIO do not all accept the newer default checksum headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    checkKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: 'application/octet-stream', ContentLength: data.length }),
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    checkKey(key);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!out.Body) return null;
      return await out.Body.transformToByteArray();
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    checkKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
