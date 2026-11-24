import { isAbsolute } from "node:path";

import type { ImgproxySettings } from "./imgproxy.js";
import type { S3Settings } from "./storage.js";

/** Where the image files live: an S3 bucket, or a folder on a volume (docs/images.md). */
export type StorageSettings = ({ kind: "s3" } & S3Settings) | { kind: "volume"; dir: string };

/**
 * The image settings, from the environment (docs/configuration.md). All unset: no image, the rest
 * of Wishalia works the same. Half set: an error, so that a typo is seen at start-up.
 */
export interface ImageSettings {
  storage: StorageSettings;
  imgproxy: ImgproxySettings;
}

const S3_KEYS = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const;
const IMGPROXY_KEYS = ["IMGPROXY_KEY", "IMGPROXY_SALT"] as const;

export function imageSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): ImageSettings | null {
  const value = (key: string) => env[key]?.trim() || undefined;
  const chosen = value("IMAGE_STORAGE");
  // Without IMAGE_STORAGE, S3 as before when any of its settings is there
  const kind = chosen ?? ([...S3_KEYS, ...IMGPROXY_KEYS].some(value) ? "s3" : undefined);
  if (!kind) return null;
  if (kind !== "s3" && kind !== "volume") {
    throw new Error(`Invalid configuration:\n- IMAGE_STORAGE: "s3" or "volume"`);
  }
  const keys = kind === "s3" ? [...S3_KEYS, ...IMGPROXY_KEYS] : [...IMGPROXY_KEYS, "IMAGE_DIR"];
  const problems = keys
    .filter((key) => !value(key))
    .map((key) => `${key}: required with the other image settings`);
  for (const key of IMGPROXY_KEYS) {
    const hex = value(key);
    if (hex && !/^([\da-f]{2}){16,}$/i.test(hex)) problems.push(`${key}: hex, 32 characters or more`);
  }
  const endpoint = value("S3_ENDPOINT");
  if (kind === "s3" && endpoint && !/^https?:\/\/[^/]+/.test(endpoint)) {
    problems.push("S3_ENDPOINT: an http(s) URL");
  }
  const dir = value("IMAGE_DIR");
  if (kind === "volume" && dir && !isAbsolute(dir)) problems.push("IMAGE_DIR: an absolute path");
  if (problems.length > 0) throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  const secrets = { key: value("IMGPROXY_KEY") ?? "", salt: value("IMGPROXY_SALT") ?? "" };
  if (kind === "volume") {
    // imgproxy reads the same volume, with IMGPROXY_LOCAL_FILESYSTEM_ROOT at the same folder
    return { storage: { kind, dir: dir ?? "" }, imgproxy: { ...secrets, source: "local:///" } };
  }
  const bucket = value("S3_BUCKET") ?? "";
  return {
    storage: {
      kind,
      endpoint: endpoint ?? "",
      region: value("S3_REGION") ?? "us-east-1",
      bucket,
      accessKey: value("S3_ACCESS_KEY") ?? "",
      secretKey: value("S3_SECRET_KEY") ?? "",
    },
    imgproxy: { ...secrets, source: `s3://${bucket}/` },
  };
}
