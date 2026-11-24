import { AwsClient } from "aws4fetch";

/**
 * The S3 bucket of the images (MinIO on the homelab, docs/images.md). Only the API and the worker
 * write in it; imgproxy reads it; no browser ever reaches it.
 */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Creates the bucket when it is missing (MinIO starts empty). */
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
  const base = `${settings.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(settings.bucket)}`;
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
