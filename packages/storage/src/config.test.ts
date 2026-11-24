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

  it("reads everything, with a default region", () => {
    expect(imageSettingsFromEnv(full)).toEqual({
      s3: {
        endpoint: "http://minio:9000",
        region: "us-east-1",
        bucket: "wishalia",
        accessKey: "access",
        secretKey: "secret",
      },
      imgproxy: { key: hex, salt: hex, bucket: "wishalia" },
    });
    expect(imageSettingsFromEnv({ ...full, S3_REGION: "eu-west-3" })?.s3.region).toBe("eu-west-3");
  });

  it("says everything that is wrong when half set", () => {
    expect(() => imageSettingsFromEnv({ S3_ENDPOINT: "minio:9000", IMGPROXY_KEY: "xyz" })).toThrow(
      /S3_BUCKET: required[\s\S]*IMGPROXY_KEY: hex[\s\S]*S3_ENDPOINT: an http\(s\) URL/,
    );
  });
});
