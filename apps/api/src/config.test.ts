import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("has safe defaults", () => {
    expect(loadConfig({})).toMatchObject({ PORT: 3000, APP_NAME: "wishlist", NODE_ENV: "development" });
  });

  it("reads the environment", () => {
    expect(loadConfig({ PORT: "8080", APP_NAME: "Chut" })).toMatchObject({ PORT: 8080, APP_NAME: "Chut" });
  });

  it("turns the metrics off unless a port is given", () => {
    expect(loadConfig({}).METRICS_PORT).toBe(0);
    expect(loadConfig({ METRICS_PORT: "9464" }).METRICS_PORT).toBe(9464);
    expect(() => loadConfig({ METRICS_PORT: "70000" })).toThrow(/METRICS_PORT/);
  });

  it("lists every invalid variable", () => {
    expect(() => loadConfig({ PORT: "0", LOG_LEVEL: "loud" })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});

describe("loadConfig: auth", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://u:p@db:5432/w",
    AUTH_SECRET: "x".repeat(32),
    APP_ORIGIN: "https://app.wishlist.example",
    PUBLIC_ORIGIN: "https://wishlist.example",
  };

  it("accepts a complete production configuration", () => {
    expect(loadConfig(production).AUTH_SECRET).toHaveLength(32);
  });

  it("needs a database, a long secret and https in production", () => {
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_SECRET: "short", APP_ORIGIN: "http://app.example" }),
    ).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*APP_ORIGIN[\s\S]*PUBLIC_ORIGIN/);
  });

  it("needs two different hosts", () => {
    expect(() => loadConfig({ ...production, PUBLIC_ORIGIN: production.APP_ORIGIN })).toThrow(
      /two different hosts/,
    );
  });

  it("needs a cookie domain that contains both hosts", () => {
    expect(loadConfig({ ...production, COOKIE_DOMAIN: ".wishlist.example" }).COOKIE_DOMAIN).toBe(
      ".wishlist.example",
    );
    expect(() => loadConfig({ ...production, COOKIE_DOMAIN: "other.example" })).toThrow(/COOKIE_DOMAIN/);
  });

  it("needs the three OIDC settings together", () => {
    expect(() => loadConfig({ OIDC_ISSUER: "https://sso.example" })).toThrow(/OIDC_ISSUER/);
    expect(
      loadConfig({ OIDC_ISSUER: "https://sso.example", OIDC_CLIENT_ID: "id", OIDC_CLIENT_SECRET: "s" })
        .OIDC_CLIENT_ID,
    ).toBe("id");
  });

  it("needs a sender with SMTP", () => {
    expect(() => loadConfig({ SMTP_URL: "smtp://mail:587" })).toThrow(/MAIL_FROM/);
  });

  it("reads the owners as a lowercase list, blanks as unset", () => {
    const config = loadConfig({ OWNER_EMAILS: "A@x.test, ,b@x.test", OIDC_ISSUER: " " });
    expect(config.OWNER_EMAILS).toEqual(["a@x.test", "b@x.test"]);
    expect(config.OIDC_ISSUER).toBeUndefined();
  });
});
