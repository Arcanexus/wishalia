import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  memoryStorage,
  openStorage,
  parseListing,
  s3Storage,
  StorageError,
  volumeStorage,
  type Storage,
  type StoredObject,
} from "./storage.js";

/** Every file a listing gives, pages put together. */
async function all(storage: Storage, prefix: string) {
  const objects: StoredObject[] = [];
  for await (const page of storage.list(prefix)) objects.push(...page);
  return objects.sort((a, b) => a.key.localeCompare(b.key));
}

function fakeS3(statuses: Record<string, number>) {
  const calls: { method: string; url: string; authorization: string | null; type: string | null }[] = [];
  const fetch = (async (request: Request) => {
    calls.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.get("authorization"),
      type: request.headers.get("content-type"),
    });
    return new Response(null, {
      status: statuses[`${request.method} ${new URL(request.url).pathname}`] ?? 200,
    });
  }) as typeof globalThis.fetch;
  const storage = s3Storage({
    endpoint: "http://minio:9000/",
    region: "us-east-1",
    bucket: "wishalia",
    accessKey: "access",
    secretKey: "secret",
    fetch,
  });
  return { storage, calls };
}

describe("the S3 bucket", () => {
  it("puts and deletes objects in path style, signed (SigV4)", async () => {
    const { storage, calls } = fakeS3({});
    await storage.put("wishes/1/a b", new Uint8Array([1, 2, 3]), "image/png");
    await storage.delete("wishes/1/a b");
    expect(calls).toMatchObject([
      { method: "PUT", url: "http://minio:9000/wishalia/wishes/1/a%20b", type: "image/png" },
      { method: "DELETE", url: "http://minio:9000/wishalia/wishes/1/a%20b" },
    ]);
    expect(calls[0]?.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=access\/\d{8}\/us-east-1\/s3\/aws4_request/,
    );
  });

  it("throws when S3 refuses, but a missing object is already deleted", async () => {
    const { storage } = fakeS3({
      "PUT /wishalia/k": 403,
      "DELETE /wishalia/gone": 404,
      "DELETE /wishalia/x": 500,
    });
    await expect(storage.put("k", new Uint8Array([1]), "image/png")).rejects.toThrow(StorageError);
    await expect(storage.delete("gone")).resolves.toBeUndefined();
    await expect(storage.delete("x")).rejects.toMatchObject({ status: 500 });
  });

  it("creates the bucket only when it is missing", async () => {
    const present = fakeS3({});
    await present.storage.ensureBucket();
    expect(present.calls.map((call) => call.method)).toEqual(["HEAD"]);
    const missing = fakeS3({ "HEAD /wishalia": 404 });
    await missing.storage.ensureBucket();
    expect(missing.calls.map((call) => call.method)).toEqual(["HEAD", "PUT"]);
    const refused = fakeS3({ "HEAD /wishalia": 403 });
    await expect(refused.storage.ensureBucket()).rejects.toMatchObject({ status: 403 });
  });

  it("lists the files under a prefix, page after page (ListObjectsV2)", async () => {
    const pages = [
      `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>t&amp;2</NextContinuationToken>
        <Contents><Key>wishes/1/a</Key><LastModified>2026-11-20T10:00:00.000Z</LastModified><Size>3</Size></Contents>
        <Contents><Key>wishes/1/b&amp;c</Key><LastModified>2026-11-21T10:00:00.000Z</LastModified></Contents>
      </ListBucketResult>`,
      `<ListBucketResult><IsTruncated>false</IsTruncated>
        <Contents><Key>wishes/2/d</Key><LastModified>2026-11-22T10:00:00Z</LastModified></Contents>
      </ListBucketResult>`,
    ];
    const urls: string[] = [];
    const storage = s3Storage({
      endpoint: "http://garage:3900",
      region: "garage",
      bucket: "wishalia",
      accessKey: "a",
      secretKey: "s",
      fetch: (async (request: Request) => {
        urls.push(request.url);
        return new Response(pages[urls.length - 1], { status: 200 });
      }) as typeof fetch,
    });
    expect(await all(storage, "wishes/")).toEqual([
      { key: "wishes/1/a", modifiedAt: new Date("2026-11-20T10:00:00Z") },
      { key: "wishes/1/b&c", modifiedAt: new Date("2026-11-21T10:00:00Z") },
      { key: "wishes/2/d", modifiedAt: new Date("2026-11-22T10:00:00Z") },
    ]);
    const [first, second] = urls.map((url) => new URL(url));
    expect(first?.pathname).toBe("/wishalia");
    expect(first?.searchParams.get("list-type")).toBe("2");
    expect(first?.searchParams.get("prefix")).toBe("wishes/");
    expect(first?.searchParams.has("continuation-token")).toBe(false);
    expect(second?.searchParams.get("continuation-token")).toBe("t&2");
  });

  it("throws when the listing is refused, and keeps a file it cannot date", async () => {
    const { storage } = fakeS3({ "GET /wishalia": 403 });
    await expect(all(storage, "wishes/")).rejects.toMatchObject({ status: 403 });
    expect(
      parseListing(
        "<ListBucketResult><Contents><Key>k</Key><LastModified>soon</LastModified></Contents></ListBucketResult>",
      ),
    ).toEqual({ objects: [] });
    // A broken answer gives what it can, quickly: no backtracking on a hostile body
    const hostile = `<Contents>${"<Contents>a".repeat(50_000)}`;
    const started = performance.now();
    expect(parseListing(hostile)).toEqual({ objects: [] });
    expect(parseListing("<Contents><Key>k</Key></Contents><Contents><Key>j")).toEqual({ objects: [] });
    expect(performance.now() - started).toBeLessThan(500);
    // Cut without a token: nothing more to ask for
    expect(parseListing("<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>")).toEqual({
      objects: [],
    });
  });

  it("has an in-memory twin for the tests", async () => {
    const storage = memoryStorage();
    await storage.ensureBucket();
    await storage.put("k", new Uint8Array([1]), "image/png");
    expect(storage.objects.get("k")?.contentType).toBe("image/png");
    await storage.put("wishes/1/a", new Uint8Array([1]), "image/png");
    expect((await all(storage, "wishes/")).map((object) => object.key)).toEqual(["wishes/1/a"]);
    expect(await all(storage, "other/")).toEqual([]);
    await storage.delete("k");
    await storage.delete("wishes/1/a");
    expect(storage.objects.size).toBe(0);
  });
});

describe("volumeStorage", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wishalia-images-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("writes, replaces and deletes files under its folder, creating it first", async () => {
    const storage = volumeStorage(join(dir, "images"));
    await storage.ensureBucket();
    await storage.put("wishes/a/b", new Uint8Array([1, 2]), "image/png");
    await storage.put("wishes/a/b", new Uint8Array([3]), "image/png");
    expect([...(await readFile(join(dir, "images", "wishes", "a", "b")))]).toEqual([3]);
    expect(await readdir(join(dir, "images", "wishes", "a"))).toEqual(["b"]);
    await storage.delete("wishes/a/b");
    await storage.delete("wishes/a/b");
    expect(await readdir(join(dir, "images", "wishes", "a"))).toEqual([]);
  });

  it("lists its files with their dates, the half-written ones too, and can remove those", async () => {
    const storage = volumeStorage(dir);
    expect(await all(storage, "wishes/")).toEqual([]);
    await storage.put("wishes/a/b", new Uint8Array([1]), "image/png");
    await storage.put("wishes/c/d", new Uint8Array([2]), "image/png");
    await storage.put("other/e", new Uint8Array([3]), "image/png");
    const partial = "wishes/a/f.0b6f1d4e-6c43-4a0e-9a3c-3f2f6a3a4e11.part";
    await writeFile(join(dir, ...partial.split("/")), new Uint8Array([4]));
    await writeFile(join(dir, "wishes", "a", "not a key"), new Uint8Array([5]));
    await mkdir(join(dir, "wishes", "empty"));
    const old = new Date("2026-01-01T00:00:00Z");
    await utimes(join(dir, "wishes", "c", "d"), old, old);
    const listed = await all(storage, "wishes/");
    expect(listed.map((object) => object.key)).toEqual(["wishes/a/b", partial, "wishes/c/d"]);
    expect(listed[2]?.modifiedAt).toEqual(old);
    await storage.delete(partial);
    expect((await all(storage, "wishes")).map((object) => object.key)).toEqual(["wishes/a/b", "wishes/c/d"]);
    // A half-written name is never one to write to, and the prefix stays in the folder
    await expect(storage.put(partial, new Uint8Array([1]), "image/png")).rejects.toThrow(StorageError);
    await expect(all(storage, "../")).rejects.toMatchObject({ status: 400 });
  });

  it("gives its files a thousand at a time", async () => {
    const storage = volumeStorage(dir);
    await Promise.all(
      Array.from({ length: 1001 }, (_, index) =>
        storage.put(`wishes/x/${index}`, new Uint8Array([1]), "image/png"),
      ),
    );
    const sizes: number[] = [];
    for await (const page of storage.list("wishes/")) sizes.push(page.length);
    expect(sizes).toEqual([1000, 1]);
  });

  it("refuses a key that could leave the folder", async () => {
    const storage = volumeStorage(dir);
    for (const key of ["../etc/passwd", "/abs", "a//b", "a/./b", "a\\b", ""]) {
      await expect(storage.put(key, new Uint8Array([1]), "image/png"), key).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(storage.delete("../x")).rejects.toThrow(StorageError);
  });

  it("is what openStorage gives for a volume, S3 otherwise", async () => {
    const volume = openStorage({ kind: "volume", dir });
    await volume.put("k", new Uint8Array([7]), "image/png");
    expect([...(await readFile(join(dir, "k")))]).toEqual([7]);
    const s3 = openStorage({
      kind: "s3",
      endpoint: "http://minio:9000",
      region: "us-east-1",
      bucket: "b",
      accessKey: "a",
      secretKey: "s",
      fetch: async () => new Response(null, { status: 200 }),
    });
    await expect(s3.ensureBucket()).resolves.toBeUndefined();
  });
});
