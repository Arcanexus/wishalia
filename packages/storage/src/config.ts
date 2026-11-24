import type { ImgproxySettings } from "./imgproxy.js";
import type { S3Settings } from "./storage.js";

/**
 * The image settings, from the environment (docs/configuration.md). All unset: no image, the rest
 * of Wishalia works the same. Half set: an error, so that a typo is seen at start-up.
 */
export interface ImageSettings {
  s3: S3Settings;
  imgproxy: ImgproxySettings;
}

const KEYS = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "IMGPROXY_KEY",
  "IMGPROXY_SALT",
] as const;

export function imageSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): ImageSettings | null {
  const value = (key: string) => env[key]?.trim() || undefined;
  const missing = KEYS.filter((key) => !value(key));
  if (missing.length === KEYS.length) return null;
  const problems = missing.map((key) => `${key}: required with the other image settings`);
  for (const key of ["IMGPROXY_KEY", "IMGPROXY_SALT"]) {
    const hex = value(key);
    if (hex && !/^([\da-f]{2}){16,}$/i.test(hex)) problems.push(`${key}: hex, 32 characters or more`);
  }
  const endpoint = value("S3_ENDPOINT");
  if (endpoint && !/^https?:\/\/[^/]+/.test(endpoint)) problems.push("S3_ENDPOINT: an http(s) URL");
  if (problems.length > 0) throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  const bucket = value("S3_BUCKET") ?? "";
  return {
    s3: {
      endpoint: endpoint ?? "",
      region: value("S3_REGION") ?? "us-east-1",
      bucket,
      accessKey: value("S3_ACCESS_KEY") ?? "",
      secretKey: value("S3_SECRET_KEY") ?? "",
    },
    imgproxy: { key: value("IMGPROXY_KEY") ?? "", salt: value("IMGPROXY_SALT") ?? "", bucket },
  };
}
