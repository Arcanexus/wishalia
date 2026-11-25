import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";
import { OPEN_LINK_GIFTS_PER_MINUTE } from "./index.js";

const FAMILY_EMAIL = "cousine@example.test";
const clock = new Date("2026-12-01T10:00:00Z");
let t: TestApp;
let owner: string;
let cousin: string;

beforeAll(async () => {
  t = await createTestApp({ OWNER_EMAILS: `${OWNER_EMAIL},${FAMILY_EMAIL}` }, () => clock);
  owner = await signIn(t, OWNER_EMAIL);
  cousin = await signIn(t, FAMILY_EMAIL);
}, 30_000);

afterAll(async () => {
  await t.close();
});

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON answers, read field by field
  body: any;
  headers: Record<string, unknown>;
}

async function send(options: InjectOptions): Promise<Answer> {
  const response = await t.app.inject(options);
  return {
    status: response.statusCode,
    body: response.body ? response.json() : null,
    headers: response.headers,
  };
}

const manage = (
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) => send({ method, url: `/manage${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
const home = (query = "", cookie?: string) =>
  send({ method: "GET", url: `/public/home${query}`, headers: cookie ? { cookie } : {} });
const guest = (
  token: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  options: { payload?: object; cookie?: string; ip?: string } = {},
) =>
  send({
    method,
    url: `/public${url}`,
    headers: {
      "x-share-token": token,
      "x-forwarded-for": options.ip ?? "203.0.113.1",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.payload ? { payload: options.payload } : {}),
  });
const tokenOf = (url: string) => url.split("/s/")[1] ?? "";

let publicList: string;
let privateList: string;
let bike: string;

beforeAll(async () => {
  publicList = (await manage(owner, "POST", "/lists", { name: "Anniversaire de Léa" })).body.id;
  privateList = (await manage(owner, "POST", "/lists", { name: "Secret de famille" })).body.id;
  const created = await manage(owner, "POST", "/items", { input: "Vélo", listId: publicList });
  bike = created.body.id;
  await manage(owner, "PATCH", `/items/${bike}`, { kind: "pool", targetCents: 30000 });
  await manage(owner, "POST", "/items", { input: "Secret", listId: privateList });
});

describe("list visibility", () => {
  it("is private by default, without an open link", async () => {
    const lists = (await manage(owner, "GET", "/lists")).body;
    const list = lists.find((row: { id: string }) => row.id === publicList);
    expect(list).toMatchObject({ visibility: "private", openUrl: null });
    expect((await home()).body.lists).toEqual([]);
  });

  it("refuses an unknown visibility", async () => {
    expect((await manage(owner, "PATCH", `/lists/${publicList}`, { visibility: "everyone" })).status).toBe(
      400,
    );
  });

  it("turns public with an open link on the public host, kept when set again", async () => {
    const turned = await manage(owner, "PATCH", `/lists/${publicList}`, { visibility: "public" });
    expect(turned.status).toBe(200);
    expect(turned.body.visibility).toBe("public");
    expect(turned.body.openUrl).toMatch(/^https:\/\/wishalia\.test\/s\/[A-Za-z0-9_-]{43}$/);
    const again = await manage(owner, "PATCH", `/lists/${publicList}`, { visibility: "public" });
    expect(again.body.openUrl).toBe(turned.body.openUrl);
    const listed = (await manage(owner, "GET", "/lists")).body.find(
      (row: { id: string }) => row.id === publicList,
    );
    expect(listed.openUrl).toBe(turned.body.openUrl);
  });

  it("keeps the open link out of the share links, which cannot revoke it", async () => {
    const links = (await manage(owner, "GET", "/share-links")).body;
    expect(links).toEqual([]);
  });

  it("is never another owner's to change", async () => {
    expect((await manage(cousin, "PATCH", `/lists/${publicList}`, { visibility: "private" })).status).toBe(
      404,
    );
  });
});

describe("the home page", () => {
  it("lists the public lists only, with the address of their open link", async () => {
    const answer = await home();
    expect(answer.status).toBe(200);
    expect(answer.headers["cache-control"]).toBe("private, no-store");
    expect(answer.body.me).toBeNull();
    expect(answer.body.more).toBe(false);
    expect(answer.body.lists).toEqual([
      {
        name: "Anniversaire de Léa",
        ownerName: expect.any(String),
        itemCount: 1,
        path: expect.stringMatching(/^\/s\/[A-Za-z0-9_-]{43}$/),
      },
    ]);
    expect(JSON.stringify(answer.body)).not.toContain("Secret");
  });

  it("searches the list's and the owner's names, without accents", async () => {
    expect((await home("?q=lea")).body.lists).toHaveLength(1);
    expect((await home("?q=ANNIV")).body.lists).toHaveLength(1);
    expect((await home("?q=velo")).body.lists).toHaveLength(0);
    // A private list is never found, even by its exact name
    expect((await home("?q=secret")).body.lists).toHaveLength(0);
  });

  it("lists everything for a search too short", async () => {
    const answer = await home("?q=a");
    expect(answer.body.query).toBe("");
    expect(answer.body.lists).toHaveLength(1);
  });

  it("refuses a search far too long", async () => {
    expect((await home(`?q=${"a".repeat(201)}`)).status).toBe(400);
  });

  it("says who is signed in", async () => {
    expect((await home("", cousin)).body.me).toEqual({ displayName: expect.any(String) });
  });
});

describe("the open link", () => {
  let token: string;

  beforeAll(async () => {
    token = tokenOf((await home()).body.lists[0].path);
  });

  it("opens the list for anyone, greeting everyone", async () => {
    const view = await guest(token, "GET", "/view");
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ open: true, audience: "tout le monde", viewer: "guest" });
  });

  it("names nobody else's gift, only one's own", async () => {
    const given = await guest(token, "POST", `/items/${bike}/contributions`, {
      payload: { amountCents: 2000, guestName: "Paul" },
    });
    expect(given.status).toBe(201);
    const byCousin = await guest(token, "POST", `/items/${bike}/contributions`, {
      payload: { amountCents: 1000 },
      cookie: cousin,
    });
    expect(byCousin.status).toBe(201);
    const view = await guest(token, "GET", "/view", { cookie: cousin });
    const contributors = view.body.items[0].funding.contributors;
    expect(contributors).toEqual([
      { name: null, mine: false },
      { name: expect.any(String), mine: true },
    ]);
    expect(JSON.stringify(view.body)).not.toContain("Paul");
  });

  it("takes a few gifts a minute per address", async () => {
    const give = (ip: string) =>
      guest(token, "POST", `/items/${bike}/contributions`, {
        payload: { amountCents: 100, guestName: "Robot" },
        ip,
      });
    for (let i = 0; i < OPEN_LINK_GIFTS_PER_MINUTE; i += 1) {
      expect((await give("198.51.100.7")).status).toBe(201);
    }
    const refused = await give("198.51.100.7");
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("rate_limited");
    expect(refused.headers["retry-after"]).toBeDefined();
    expect((await give("203.0.113.2")).status).toBe(201);
  });

  it("still spoils nothing for the owner", async () => {
    const view = await guest(token, "GET", "/view", { cookie: owner });
    expect(view.body.viewer).toBe("owner");
    expect(view.body.items[0].funding).toBeNull();
  });

  it("stops working once the list is private again, and leaves the search", async () => {
    const turned = await manage(owner, "PATCH", `/lists/${publicList}`, { visibility: "private" });
    expect(turned.body).toMatchObject({ visibility: "private", openUrl: null });
    expect((await guest(token, "GET", "/view")).status).toBe(404);
    expect((await home()).body.lists).toEqual([]);
  });

  it("gets a new address when the list turns public again", async () => {
    const turned = await manage(owner, "PATCH", `/lists/${publicList}`, { visibility: "public" });
    expect(tokenOf(turned.body.openUrl)).not.toBe(token);
    expect((await guest(token, "GET", "/view")).status).toBe(404);
  });

  it("leaves the search when the list is archived", async () => {
    await manage(owner, "PATCH", `/lists/${publicList}`, { archived: true });
    expect((await home()).body.lists).toEqual([]);
    const fresh = await manage(owner, "PATCH", `/lists/${publicList}`, { archived: false });
    expect(fresh.body.visibility).toBe("public");
  });
});
