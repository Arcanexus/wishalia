import { describe, expect, it } from "vitest";

import { imageSettingsFromEnv } from "./config.js";

const hex = "a".repeat(64);
const full = {
  S3_ENDPOINT: "http://minio:9000",
  S3_BUCKET: "wishalia",
  S3_ACCESS_KEY: "access",
  S3_SECRET_KEY: "secret",
  IMGPROXY_KEY: hex,
  IMGPROXY_SALT: hex,
};

describe("imageSettingsFromEnv", () => {
  it("is off when nothing is set", () => {
    expect(imageSettingsFromEnv({})).toBeNull();
    expect(imageSettingsFromEnv({ S3_ENDPOINT: " " })).toBeNull();
  });

  it("reads S3, with a default region, chosen or not", () => {
    expect(imageSettingsFromEnv(full)).toEqual({
      storage: {
        kind: "s3",
        endpoint: "http://minio:9000",
        region: "us-east-1",
        bucket: "wishalia",
        accessKey: "access",
        secretKey: "secret",
      },
      imgproxy: { key: hex, salt: hex, source: "s3://wishalia/" },
    });
    const chosen = imageSettingsFromEnv({ ...full, IMAGE_STORAGE: "s3", S3_REGION: "eu-west-3" });
    expect(chosen?.storage).toMatchObject({ kind: "s3", region: "eu-west-3" });
  });

  it("reads a volume, without any S3 setting", () => {
    const env = { IMAGE_STORAGE: "volume", IMAGE_DIR: "/data/images", IMGPROXY_KEY: hex, IMGPROXY_SALT: hex };
    expect(imageSettingsFromEnv(env)).toEqual({
      storage: { kind: "volume", dir: "/data/images" },
      imgproxy: { key: hex, salt: hex, source: "local:///" },
    });
  });

  it("says everything that is wrong when half set", () => {
    expect(() => imageSettingsFromEnv({ S3_ENDPOINT: "minio:9000", IMGPROXY_KEY: "xyz" })).toThrow(
      /S3_BUCKET: required[\s\S]*IMGPROXY_KEY: hex[\s\S]*S3_ENDPOINT: an http\(s\) URL/,
    );
    expect(() => imageSettingsFromEnv({ IMAGE_STORAGE: "volume", IMAGE_DIR: "images" })).toThrow(
      /IMGPROXY_KEY: required[\s\S]*IMAGE_DIR: an absolute path/,
    );
    expect(() => imageSettingsFromEnv({ IMAGE_STORAGE: "disk" })).toThrow(/IMAGE_STORAGE/);
  });
});
