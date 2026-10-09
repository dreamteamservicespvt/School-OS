// Where files live. On a computer: a private folder (STORAGE_DIR). In
// production: any S3-compatible bucket in India (S3_* settings). Files are
// never public; they open only through a signed link that expires
// (08-platform-security.md §8).
import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

type Store = {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
};

function localStore(): Store {
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "storage");
  const full = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("Bad file key");
    return p;
  };
  return {
    async put(key, body) {
      const p = full(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return await readFile(full(key));
      } catch {
        return null;
      }
    },
  };
}

function s3Store(): Store {
  const client = new S3Client({
    region: process.env.S3_REGION ?? "ap-south-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });
  const Bucket = process.env.S3_BUCKET!;
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
      } catch {
        return null;
      }
    },
  };
}

let store: Store | null = null;
export function fileStore(): Store {
  store ??= process.env.S3_BUCKET ? s3Store() : localStore();
  return store;
}
