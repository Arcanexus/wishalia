import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryStorage, openStorage, s3Storage, StorageError, volumeStorage } from "./storage.js";

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

  it("has an in-memory twin for the tests", async () => {
    const storage = memoryStorage();
    await storage.ensureBucket();
    await storage.put("k", new Uint8Array([1]), "image/png");
    expect(storage.objects.get("k")?.contentType).toBe("image/png");
    await storage.delete("k");
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
