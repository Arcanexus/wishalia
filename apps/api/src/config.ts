import { z } from "zod";

/**
 * The whole configuration comes from environment variables (12-factor): the Helm chart sets them,
 * secrets included, through a ConfigMap and a Secret. Nothing is hard-coded.
 */
const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const commaList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );

const base = z.object({
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

  /** postgres://user:password@host:5432/database (Secret). */
  DATABASE_URL: optional,
  /** Public URLs of the two frontends, set by the chart from hosts.*. */
  APP_ORIGIN: z.url().default("http://localhost:3003"),
  PUBLIC_ORIGIN: z.url().default("http://localhost:3002"),
  /**
   * Parent domain of the two hosts (wishlist.example.com), so that one session works on both.
   * Unset: the session cookie stays on the management host.
   */
  COOKIE_DOMAIN: optional,

  /** Signs the session cookies and encrypts the OAuth tokens: 32 characters or more (Secret). */
  AUTH_SECRET: optional,
  /**
   * Invitation only: the emails allowed to create an account by themselves, the owners. Everyone
   * else joins through an invitation.
   */
  OWNER_EMAILS: commaList,
  /** OIDC provider of the owners (Authelia, Authentik, Keycloak...): all three, or none. */
  OIDC_ISSUER: optional,
  OIDC_CLIENT_ID: optional,
  OIDC_CLIENT_SECRET: optional,
  /** smtp(s)://user:password@host:port for the magic links (Secret). Unset: no magic link. */
  SMTP_URL: optional,
  MAIL_FROM: optional,
});

const schema = base.superRefine((config, context) => {
  const oidc = [config.OIDC_ISSUER, config.OIDC_CLIENT_ID, config.OIDC_CLIENT_SECRET].filter(Boolean);
  if (oidc.length !== 0 && oidc.length !== 3) {
    context.addIssue({
      code: "custom",
      path: ["OIDC_ISSUER"],
      message: "set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET together",
    });
  }
  if (config.SMTP_URL && !config.MAIL_FROM) {
    context.addIssue({ code: "custom", path: ["MAIL_FROM"], message: "required with SMTP_URL" });
  }
  if (config.NODE_ENV === "production") {
    if (!config.DATABASE_URL) {
      context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required in production" });
    }
    if (!config.AUTH_SECRET || config.AUTH_SECRET.length < 32) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "required in production, 32 characters or more",
      });
    }
    for (const key of ["APP_ORIGIN", "PUBLIC_ORIGIN"] as const) {
      if (!config[key].startsWith("https://")) {
        context.addIssue({ code: "custom", path: [key], message: "must be https:// in production" });
      }
    }
  }
  if (config.COOKIE_DOMAIN) {
    const domain = config.COOKIE_DOMAIN.replace(/^\./, "");
    for (const key of ["APP_ORIGIN", "PUBLIC_ORIGIN"] as const) {
      const host = new URL(config[key]).hostname;
      if (host !== domain && !host.endsWith(`.${domain}`)) {
        context.addIssue({
          code: "custom",
          path: ["COOKIE_DOMAIN"],
          message: `must contain the host of ${key}`,
        });
      }
    }
  }
  if (config.APP_ORIGIN === config.PUBLIC_ORIGIN) {
    context.addIssue({
      code: "custom",
      path: ["APP_ORIGIN"],
      message: "the management app and the public view need two different hosts",
    });
  }
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
