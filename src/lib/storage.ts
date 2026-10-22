// Where files live. On a computer: a private folder (STORAGE_DIR). In
// production: any S3-compatible bucket in India (S3_* settings). Files are
// never public; they open only through a signed link that expires
// (08-platform-security.md §8).
import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export type Store = {
  /** meta: small labels kept with the file where the store allows (the backup's checksum). */
  put(key: string, body: Buffer, contentType: string, meta?: Record<string, string>): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /** Removes a file for good: only for files past their keeping period (data-security/retention.ts). */
  remove(key: string): Promise<void>;
};

export function localStore(dir: string): Store {
  const root = path.resolve(/*turbopackIgnore: true*/ dir);
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
    async remove(key) {
      await rm(full(key), { force: true });
    },
  };
}

type S3Settings = { bucket: string; endpoint?: string; region?: string; accessKeyId?: string; secretAccessKey?: string };

export function s3Store(cfg: S3Settings): Store {
  const endpoint = cfg.endpoint || undefined;
  // Cloudflare R2 encrypts every file itself and does not take the AWS
  // encryption header; its region is always "auto".
  const r2 = Boolean(endpoint && /\.r2\.cloudflarestorage\.com/i.test(endpoint));
  const client = new S3Client({
    region: cfg.region ?? (r2 ? "auto" : "ap-south-1"),
    endpoint,
    forcePathStyle: Boolean(endpoint),
    // S3-compatible stores do not all accept the newer automatic checksums.
    ...(endpoint ? { requestChecksumCalculation: "WHEN_REQUIRED" as const, responseChecksumValidation: "WHEN_REQUIRED" as const } : {}),
    // Keys from the settings, or the standard AWS_* settings.
    ...(cfg.accessKeyId && cfg.secretAccessKey ? { credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } } : {}),
  });
  const Bucket = cfg.bucket;
  return {
    async put(key, body, contentType, meta) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, Metadata: meta, ...(r2 ? {} : { ServerSideEncryption: "AES256" as const }) }));
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

let store: Store | null = null;
export function fileStore(): Store {
  store ??= process.env.S3_BUCKET
    ? s3Store({ bucket: process.env.S3_BUCKET, endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY })
    : localStore(process.env.STORAGE_DIR ?? "storage");
  return store;
}

/**
 * The second, separate place file backups go to (08-platform-security.md §4),
 * or null when this server has none set up. On a computer: BACKUP_FILES_DIR,
 * a folder. In production: BACKUP_S3_BUCKET, an S3-compatible bucket in
 * another region or account (BACKUP_S3_ENDPOINT, BACKUP_S3_REGION and
 * BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY, or the S3_* keys).
 * It must not be the place the files already live, or it would be no backup.
 */
export function backupStore(): Store | null {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (bucket) {
    if (bucket === process.env.S3_BUCKET && (process.env.BACKUP_S3_ENDPOINT ?? "") === (process.env.S3_ENDPOINT ?? "")) throw new Error("BACKUP_S3_BUCKET must be a different bucket from S3_BUCKET");
    return s3Store({
      bucket,
      endpoint: process.env.BACKUP_S3_ENDPOINT ?? process.env.S3_ENDPOINT,
      region: process.env.BACKUP_S3_REGION ?? process.env.S3_REGION,
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY,
    });
  }
  const dir = process.env.BACKUP_FILES_DIR;
  if (!dir) return null;
  if (path.resolve(dir) === path.resolve(process.env.STORAGE_DIR ?? "storage")) throw new Error("BACKUP_FILES_DIR must be a different folder from STORAGE_DIR");
  return localStore(dir);
}
