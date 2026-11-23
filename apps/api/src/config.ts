import { z } from "zod";

/**
 * The whole configuration comes from environment variables (12-factor): the Helm chart sets them,
 * secrets included, through a ConfigMap and a Secret. Nothing is hard-coded.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Display name of the product, so that the code never depends on the final brand. */
  APP_NAME: z.string().min(1).default("wishlist"),
  /** Port of the Prometheus /metrics endpoint, never published by the ingress. 0 turns it off. */
  METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  /** Version shown in /healthz, given by the CI from the image tag. */
  APP_VERSION: z.string().default("dev"),
});

export type Config = z.infer<typeof schema>;

/** Reads and checks the configuration. Throws with every invalid variable at once. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  }
  return result.data;
}
