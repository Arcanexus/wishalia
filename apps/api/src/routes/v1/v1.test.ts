import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { schema } from "@wishalia/db";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";

const OTHER_EMAIL = "other-owner@example.test";
const API_HOST = "api.wishalia.test";
let clock = new Date("2026-12-01T10:00:00Z");
let t: TestApp;
let owner: string;
let other: string;

beforeAll(async () => {
  t = await createTestApp(
    {
      OWNER_EMAILS: `${OWNER_EMAIL},${OTHER_EMAIL}`,
      API_ORIGIN: `https://${API_HOST}`,
      API_RATE_LIMIT: "10",
    },
    () => clock,
  );
  owner = await signIn(t, OWNER_EMAIL);
  other = await signIn(t, OTHER_EMAIL);
}, 30_000);

afterAll(async () => {
  await t.close();
});

async function send(options: InjectOptions) {
  const response = await t.app.inject(options);
  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.body ? response.json() : null,
  };
}

const manage = (
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) => send({ method, url: `/manage${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

/** A v1 request with a token, through the API host. */
const v1 = (
  token: string | null,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) =>
  send({
    method,
    url: `/v1${url}`,
    headers: { host: API_HOST, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(payload ? { payload } : {}),
  });

async function token(cookie: string, payload: object = {}) {
  const created = await manage(cookie, "POST", "/api-tokens", { name: "Home Assistant", ...payload });
  expect(created.status).toBe(201);
  return created.body as { id: string; token: string; prefix: string };
}

describe("personal access tokens in /manage", () => {
  it("gives the token once, then lists it by its prefix only", async () => {
    const created = await token(owner, { expiresInDays: 30, readOnly: true });
    expect(created.token).toMatch(/^wsh_[A-Za-z0-9_-]{43}$/);
    expect(created).toMatchObject({
      prefix: created.token.slice(0, 8),
      readOnly: true,
      active: true,
      expiresAt: "2026-12-31T10:00:00.000Z",
      lastUsedAt: null,
    });
    const listed = await manage(owner, "GET", "/api-tokens");
    expect(listed.body[0]).toMatchObject({ id: created.id, name: "Home Assistant" });
    expect(JSON.stringify(listed.body)).not.toContain(created.token);
    expect((await manage(other, "GET", "/api-tokens")).body).toEqual([]);
  });

  it("refuses a token that never expires or lasts over a year", async () => {
    expect((await manage(owner, "POST", "/api-tokens", { name: "x", expiresInDays: 366 })).status).toBe(400);
    expect((await manage(owner, "POST", "/api-tokens", { name: "x", expiresInDays: null })).status).toBe(400);
    expect((await manage(owner, "POST", "/api-tokens", { name: "" })).status).toBe(400);
  });

  it("revokes for good, and only for its owner", async () => {
    const created = await token(owner);
    expect((await manage(other, "POST", `/api-tokens/${created.id}/revoke`)).status).toBe(404);
    const revoked = await manage(owner, "POST", `/api-tokens/${created.id}/revoke`);
    expect(revoked.body).toMatchObject({ active: false });
    const again = await manage(owner, "POST", `/api-tokens/${created.id}/revoke`);
    expect(again.body.revokedAt).toBe(revoked.body.revokedAt);
    expect((await v1(created.token, "GET", "/me")).status).toBe(401);
  });
});

describe("the REST API v1", () => {
  it("serves its OpenAPI description without a token", async () => {
    const document = await v1(null, "GET", "/openapi.json");
    expect(document.status).toBe(200);
    expect(document.body).toMatchObject({ openapi: "3.1.0", servers: [{ url: `https://${API_HOST}/v1` }] });
    const quickAdd = document.body.paths["/items"].post.requestBody.content["application/json"].schema;
    expect(quickAdd.properties).toHaveProperty("input");
    expect(Object.keys(document.body.paths)).not.toContain("/share-links");
    expect(Object.keys(document.body.paths)).toEqual(
      expect.arrayContaining(["/items/{itemId}/refresh", "/lists/{listId}/refresh"]),
    );
  });

  it("answers 401 without a valid token, and never takes a session cookie", async () => {
    const missing = await v1(null, "GET", "/me");
    expect(missing).toMatchObject({ status: 401, body: { error: "invalid_token" } });
    expect(missing.headers["www-authenticate"]).toContain("Bearer");
    expect((await v1("wsh_nope", "GET", "/me")).status).toBe(401);
    expect((await v1(`wsh_${"a".repeat(43)}`, "GET", "/me")).status).toBe(401);
    const cookieOnly = await send({
      method: "GET",
      url: "/v1/me",
      headers: { host: API_HOST, cookie: owner },
    });
    expect(cookieOnly.status).toBe(401);
  });

  it("has the rights of /manage, on the owner's data only", async () => {
    const { token: secret, id } = await token(owner);
    expect((await v1(secret, "GET", "/me")).body).toMatchObject({ email: OWNER_EMAIL });
    const added = await v1(secret, "POST", "/items", { input: "Une lampe" });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ title: "Une lampe", status: "open" });
    expect(Object.keys(added.body)).not.toEqual(expect.arrayContaining(["contributions"]));
    expect((await v1(secret, "GET", "/lists")).body).toHaveLength(1);
    expect((await v1(secret, "GET", `/items/${added.body.id}/history`)).body[0]).toMatchObject({
      type: "created",
    });

    const otherToken = await token(other);
    expect((await v1(otherToken.token, "GET", `/items/${added.body.id}`)).status).toBe(404);

    const listed = (await manage(owner, "GET", "/api-tokens")).body.find(
      (row: { id: string }) => row.id === id,
    );
    expect(listed.lastUsedAt).toBe(clock.toISOString());
  });

  it("never gives who gave what, even once the secret is lifted", async () => {
    const { token: secret } = await token(owner);
    const before = clock;
    clock = new Date("2026-12-20T10:00:00Z");
    const event = (await manage(owner, "POST", "/events", { name: "Noël", date: "2026-12-25" })).body;
    const item = (await manage(owner, "POST", "/items", { input: "Robot" })).body;
    await manage(owner, "PUT", `/events/${event.id}/items/${item.id}`);
    await t.db.insert(schema.itemEvents).values({
      wishId: item.id,
      type: "contribution_added",
      payload: { eventId: event.id, amountCents: 5000, name: "Mamie" },
      visibility: "sealed",
    });
    clock = new Date("2026-12-30T10:00:00Z");
    expect((await manage(owner, "POST", `/events/${event.id}/reveal`)).status).toBe(200);

    // The management app sees it once lifted; the token never does
    const inApp = (await manage(owner, "GET", `/items/${item.id}/history`)).body as { type: string }[];
    expect(inApp.map((entry) => entry.type)).toContain("contribution_added");
    const viaToken = await v1(secret, "GET", `/items/${item.id}/history`);
    expect(viaToken.status).toBe(200);
    expect(JSON.stringify(viaToken.body)).not.toMatch(/contribution|Mamie|5000|amount/i);
    clock = before;
  });

  it("only reads with a read-only token", async () => {
    const { token: secret } = await token(owner, { readOnly: true });
    expect((await v1(secret, "GET", "/lists")).status).toBe(200);
    expect((await v1(secret, "POST", "/items", { input: "x" })).body).toEqual({ error: "read_only_token" });
  });

  it("stops at the expiry date", async () => {
    const { token: secret } = await token(owner, { expiresInDays: 1 });
    expect((await v1(secret, "GET", "/me")).status).toBe(200);
    clock = new Date("2026-12-02T10:00:00Z");
    expect((await v1(secret, "GET", "/me")).status).toBe(401);
  });

  it("limits each token to API_RATE_LIMIT requests a minute", async () => {
    clock = new Date("2026-12-03T10:00:00Z");
    const { token: secret } = await token(owner);
    for (let index = 0; index < 10; index += 1) {
      expect((await v1(secret, "GET", "/me")).status).toBe(200);
    }
    const limited = await v1(secret, "GET", "/me");
    expect(limited).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(limited.headers["retry-after"]).toBe("60");
    expect(limited.headers["ratelimit-remaining"]).toBe("0");
    clock = new Date("2026-12-03T10:01:00Z");
    expect((await v1(secret, "GET", "/me")).status).toBe(200);
  });

  it("serves nothing but /v1 on the API host", async () => {
    const internal = await send({
      method: "GET",
      url: "/manage/ping",
      headers: { host: API_HOST, cookie: owner },
    });
    expect(internal.status).toBe(404);
    expect((await send({ method: "GET", url: "/public/ping", headers: { host: API_HOST } })).status).toBe(
      404,
    );
    expect((await send({ method: "GET", url: "/manage/ping", headers: { cookie: owner } })).status).toBe(200);
  });
});

describe("without API_ORIGIN", () => {
  it("keeps the API v1 off", async () => {
    const off = await createTestApp();
    try {
      expect((await off.app.inject({ method: "GET", url: "/v1/openapi.json" })).statusCode).toBe(404);
    } finally {
      await off.close();
    }
  });
});
