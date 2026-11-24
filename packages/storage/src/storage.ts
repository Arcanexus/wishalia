import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { AwsClient } from "aws4fetch";

import type { StorageSettings } from "./config.js";
import { withoutTrailingSlashes } from "./url.js";

/**
 * Where the image files live (docs/images.md): an S3 bucket (MinIO on the homelab) or a folder on
 * a volume. Only the API and the worker write there; imgproxy reads it; no browser ever reaches it.
 */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Creates the bucket or the folder when it is missing (MinIO and a new volume start empty). */
  ensureBucket(): Promise<void>;
}

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** For the tests: the fetch to use. */
  fetch?: typeof fetch;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** The bucket, addressed in path style (http://minio:9000/<bucket>/<key>), as MinIO wants it. */
export function s3Storage(settings: S3Settings): Storage {
  const client = new AwsClient({
    accessKeyId: settings.accessKey,
    secretAccessKey: settings.secretKey,
    region: settings.region,
    service: "s3",
  });
  const call = settings.fetch ?? fetch;
  const base = `${withoutTrailingSlashes(settings.endpoint)}/${encodeURIComponent(settings.bucket)}`;
  const objectUrl = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  async function send(url: string, init: RequestInit, ok: (status: number) => boolean) {
    const request = await client.sign(url, init);
    const response = await call(request);
    await response.body?.cancel();
    if (!ok(response.status))
      throw new StorageError(`S3 ${init.method} answered ${response.status}`, response.status);
    return response.status;
  }

  return {
    async put(key, body, contentType) {
      await send(
        objectUrl(key),
        {
          method: "PUT",
          body,
          headers: { "content-type": contentType, "content-length": String(body.length) },
        },
        (status) => status >= 200 && status < 300,
      );
    },
    async delete(key) {
      await send(
        objectUrl(key),
        { method: "DELETE" },
        (status) => (status >= 200 && status < 300) || status === 404,
      );
    },
    async ensureBucket() {
      const status = await send(base, { method: "HEAD" }, (code) => code === 200 || code === 404);
      if (status === 404) {
        await send(base, { method: "PUT" }, (code) => (code >= 200 && code < 300) || code === 409);
      }
    },
  };
}

/** The keys Wishalia writes (wishes/<id>/<uuid>): never a way out of the folder. */
const SAFE_KEY = /^[\w-]+(\/[\w-]+)*$/;

/**
 * A folder on a volume (a PersistentVolumeClaim, or a folder with docker compose), that imgproxy
 * mounts read-only. A file is written beside its place then renamed: imgproxy never reads half.
 */
export function volumeStorage(dir: string): Storage {
  const path = (key: string) => {
    if (!SAFE_KEY.test(key)) throw new StorageError(`Invalid image key: ${key}`, 400);
    return join(dir, ...key.split("/"));
  };
  return {
    async put(key, body) {
      const file = path(key);
      await mkdir(dirname(file), { recursive: true });
      const partial = `${file}.${randomUUID()}.part`;
      try {
        await writeFile(partial, body, { mode: 0o640 });
        await rename(partial, file);
      } catch (error) {
        await rm(partial, { force: true });
        throw error;
      }
    },
    async delete(key) {
      await rm(path(key), { force: true });
    },
    async ensureBucket() {
      await mkdir(dir, { recursive: true });
    },
  };
}

/** The storage the settings choose. */
export function openStorage(settings: StorageSettings): Storage {
  return settings.kind === "volume" ? volumeStorage(settings.dir) : s3Storage(settings);
}

/** A bucket in memory, for the tests and for running without S3. */
export function memoryStorage(): Storage & {
  objects: Map<string, { body: Uint8Array; contentType: string }>;
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async delete(key) {
      objects.delete(key);
    },
    async ensureBucket() {},
  };
}
