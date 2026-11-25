import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
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
  /**
   * The files under a prefix ("wishes/"), a page at a time, for the cleanup of the files no image
   * row names any more (docs/images.md). The order is not specified.
   */
  list(prefix: string): AsyncIterable<StoredObject[]>;
}

/** A file of the storage, as the cleanup sees it. */
export interface StoredObject {
  key: string;
  modifiedAt: Date;
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

  /** ListObjectsV2, one page (1000 keys at most) per call. */
  async function listPage(prefix: string, token: string | undefined) {
    const query = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
    if (token) query.set("continuation-token", token);
    const request = await client.sign(`${base}?${query}`, { method: "GET" });
    const response = await call(request);
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new StorageError(`S3 GET (list) answered ${response.status}`, response.status);
    }
    return parseListing(await response.text());
  }

  return {
    async *list(prefix) {
      let token: string | undefined;
      do {
        const page = await listPage(prefix, token);
        if (page.objects.length > 0) yield page.objects;
        token = page.next;
      } while (token);
    },
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name] ?? "");
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

/** A ListObjectsV2 answer: its files, and the token of the next page when it is cut. */
export function parseListing(xml: string): { objects: StoredObject[]; next?: string } {
  const objects: StoredObject[] = [];
  for (const [, entry = ""] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = tag(entry, "Key");
    const modified = new Date(tag(entry, "LastModified") ?? "");
    // A file without a readable date is kept: the cleanup never removes what it cannot date
    if (key !== undefined && !Number.isNaN(modified.getTime()))
      objects.push({ key: unescapeXml(key), modifiedAt: modified });
  }
  const truncated = tag(xml, "IsTruncated") === "true";
  const token = tag(xml, "NextContinuationToken");
  return truncated && token ? { objects, next: unescapeXml(token) } : { objects };
}

/** The keys Wishalia writes (wishes/<id>/<uuid>): never a way out of the folder. */
const SAFE_KEY = /^[\w-]+(\/[\w-]+)*$/;
/** A file being written (<key>.<uuid>.part), left behind when the process stopped mid-write. */
const PARTIAL_KEY = /^[\w-]+(\/[\w-]+)*\.[\da-f-]{36}\.part$/;
/** The files listed in a page: a folder of a million images is still read a bit at a time. */
const PAGE_SIZE = 1000;

/**
 * A folder on a volume (a PersistentVolumeClaim, or a folder with docker compose), that imgproxy
 * mounts read-only. A file is written beside its place then renamed: imgproxy never reads half.
 */
export function volumeStorage(dir: string): Storage {
  const path = (key: string, partial = false) => {
    if (!SAFE_KEY.test(key) && !(partial && PARTIAL_KEY.test(key)))
      throw new StorageError(`Invalid image key: ${key}`, 400);
    return join(dir, ...key.split("/"));
  };

  /** The files under a folder, depth first; a folder that is not there has none. */
  async function* walk(relative: string): AsyncGenerator<StoredObject> {
    let entries;
    try {
      entries = await readdir(join(dir, ...relative.split("/").filter(Boolean)), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const key = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) yield* walk(key);
      else if (entry.isFile() && (SAFE_KEY.test(key) || PARTIAL_KEY.test(key))) {
        try {
          yield { key, modifiedAt: (await stat(path(key, true))).mtime };
        } catch {
          // Removed meanwhile: nothing to list
        }
      }
    }
  }

  return {
    async *list(prefix) {
      // The prefix is a folder ("wishes/"), as Wishalia writes them
      const folder = prefix.replace(/\/+$/, "");
      if (folder && !SAFE_KEY.test(folder)) throw new StorageError(`Invalid prefix: ${prefix}`, 400);
      let page: StoredObject[] = [];
      for await (const object of walk(folder)) {
        page.push(object);
        if (page.length >= PAGE_SIZE) {
          yield page;
          page = [];
        }
      }
      if (page.length > 0) yield page;
    },
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
      await rm(path(key, true), { force: true });
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
  objects: Map<string, { body: Uint8Array; contentType: string; modifiedAt?: Date }>;
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string; modifiedAt?: Date }>();
  return {
    objects,
    async *list(prefix) {
      const page = [...objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({ key, modifiedAt: object.modifiedAt ?? new Date() }));
      if (page.length > 0) yield page;
    },
    async put(key, body, contentType) {
      objects.set(key, { body, contentType, modifiedAt: new Date() });
    },
    async delete(key) {
      objects.delete(key);
    },
    async ensureBucket() {},
  };
}
