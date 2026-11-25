import { schema } from "@wishalia/db";
import { MAX_IMPORT_ITEMS } from "@wishalia/domain";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RemoteError } from "../../remote.js";
import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";

const OTHER_EMAIL = "other-importer@example.test";
const fetched: string[] = [];
let remote: (url: string) => Promise<string> = async () => "";
let t: TestApp;
let owner: string;
let other: string;

const PAGE = `<h2 id="wishlist-title">Mes idées</h2><ul id="wishlist">
<li><h3>Puzzle</h3><p>1000 pièces</p><div class="item-link"><a href="/dp/1/" title="https://shop.example/puzzle">Buy</a></div></li>
<li><h3>Livre</h3></li></ul>`;

beforeAll(async () => {
  t = await createTestApp({ OWNER_EMAILS: `${OWNER_EMAIL},${OTHER_EMAIL}` }, undefined, null, async (url) => {
    fetched.push(url);
    return remote(url);
  });
  owner = await signIn(t, OWNER_EMAIL);
  other = await signIn(t, OTHER_EMAIL);
}, 30_000);

afterAll(async () => {
  await t.close();
});

async function as(
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) {
  const options: InjectOptions = { method, url: `/manage${url}`, headers: { cookie } };
  if (payload) options.payload = payload as Record<string, unknown>;
  const response = await t.app.inject(options);
  return { status: response.statusCode, body: response.body ? response.json() : null };
}

describe("import preview", () => {
  it("needs a session", async () => {
    const response = await t.app.inject({ method: "POST", url: "/manage/imports/preview", payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it("reads a CSV file without adding anything", async () => {
    const { status, body } = await as(owner, "POST", "/imports/preview", {
      source: "csv",
      content: "Titre;Prix\nVélo;199,90\n;\n",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ source: "csv", items: [{ title: "Vélo", priceCents: 19990 }], skipped: [] });
  });

  it("reads JSON and text", async () => {
    expect(
      (await as(owner, "POST", "/imports/preview", { source: "json", content: '[{"name":"Lampe"}]' })).body,
    ).toMatchObject({ items: [{ title: "Lampe" }] });
    expect(
      (await as(owner, "POST", "/imports/preview", { source: "text", content: "Pull\nBonnet" })).body.items,
    ).toHaveLength(2);
  });

  it("says why a source cannot be read", async () => {
    expect(await as(owner, "POST", "/imports/preview", { source: "json", content: "{" })).toEqual({
      status: 422,
      body: { error: "invalid_json" },
    });
    expect(
      (await as(owner, "POST", "/imports/preview", { source: "csv", content: "a,b\n1,2" })).body,
    ).toEqual({
      error: "no_columns",
    });
    expect((await as(owner, "POST", "/imports/preview", { source: "pdf", content: "x" })).status).toBe(400);
  });

  it("reads a Wishlistr list from the address built by the domain, never another one", async () => {
    remote = async () => PAGE;
    const { status, body } = await as(owner, "POST", "/imports/preview", {
      source: "wishlistr",
      address: "wishlistr.com/alex",
    });
    expect(status).toBe(200);
    expect(fetched.at(-1)).toBe("https://www.wishlistr.com/alex/");
    expect(body).toMatchObject({
      source: "wishlistr",
      address: "https://www.wishlistr.com/alex/",
      listName: "Mes idées",
      items: [
        { title: "Puzzle", url: "https://shop.example/puzzle", notes: "1000 pièces" },
        { title: "Livre", url: null },
      ],
    });

    const count = fetched.length;
    const refused = await as(owner, "POST", "/imports/preview", {
      source: "wishlistr",
      address: "http://169.254.169.254/latest/",
    });
    expect(refused).toEqual({ status: 422, body: { error: "invalid_address" } });
    expect(fetched).toHaveLength(count);
  });

  it("answers when the list cannot be found or read", async () => {
    remote = async () => {
      throw new RemoteError("remote_not_found");
    };
    expect(
      await as(other, "POST", "/imports/preview", { source: "wishlistr", address: "wishlistr.com/nobody" }),
    ).toEqual({ status: 404, body: { error: "remote_not_found" } });
    remote = async () => {
      throw new RemoteError("remote_unreachable");
    };
    expect(
      (await as(other, "POST", "/imports/preview", { source: "wishlistr", address: "wishlistr.com/a" }))
        .status,
    ).toBe(502);
    remote = async () => "<html>Sign in</html>";
    expect(
      (await as(other, "POST", "/imports/preview", { source: "wishlistr", address: "wishlistr.com/a" })).body,
    ).toEqual({ error: "not_a_wishlistr_list" });
    remote = async () => {
      throw new Error("boom");
    };
    expect(
      (await as(other, "POST", "/imports/preview", { source: "wishlistr", address: "wishlistr.com/a" }))
        .status,
    ).toBe(500);
  });

  it("limits the remote reads per person", async () => {
    remote = async () => PAGE;
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      statuses.push(
        (await as(owner, "POST", "/imports/preview", { source: "wishlistr", address: "wishlistr.com/x" }))
          .status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("import", () => {
  const wish = (title: string, url: string | null = null) => ({
    title,
    url,
    notes: null,
    priceCents: null,
    quantity: null,
  });

  it("adds the kept wishes to a new list, in order, with their history", async () => {
    const { status, body } = await as(owner, "POST", "/imports", {
      source: "wishlistr",
      listName: "Importée",
      items: [
        {
          ...wish("Puzzle", "https://shop.example/puzzle?utm_source=x"),
          notes: "1000 pièces",
          priceCents: 1500,
        },
        { ...wish("Chaussettes"), quantity: 3 },
        wish("   "),
      ],
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({ added: 2, duplicates: 0, skipped: 1 });

    const rows = await t.db.select().from(schema.wishes).where(eq(schema.wishes.listId, body.listId));
    const sorted = rows.sort((a, b) => a.position - b.position);
    expect(
      sorted.map((row) => [row.title, row.url, row.kind, row.quantity, row.enrichment, row.priceCents]),
    ).toEqual([
      ["Puzzle", "https://shop.example/puzzle", "unique", null, "pending", 1500],
      ["Chaussettes", null, "quantity", 3, null, null],
    ]);
    const [first] = sorted;
    const history = await as(owner, "GET", `/items/${first?.id}/history`);
    expect(history.body).toMatchObject([{ type: "created", payload: { importedFrom: "wishlistr" } }]);

    const lists = (await as(owner, "GET", "/lists")).body as { id: string; name: string }[];
    expect(lists.find((list) => list.id === body.listId)?.name).toBe("Importée");
  });

  it("adds to an existing list, after its wishes, and skips the links it already has", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Existante" })).body as { id: string };
    await as(owner, "POST", "/items", { input: "https://shop.example/a", listId: list.id });
    const { body } = await as(owner, "POST", "/imports", {
      source: "csv",
      listId: list.id,
      items: [
        wish("A", "https://shop.example/a"),
        wish("B", "https://shop.example/b"),
        wish("B bis", "https://shop.example/b"),
      ],
    });
    expect(body).toMatchObject({ listId: list.id, added: 1, duplicates: 2 });
    const rows = await t.db.select().from(schema.wishes).where(eq(schema.wishes.listId, list.id));
    expect(rows.sort((a, b) => a.position - b.position).map((row) => row.title)).toEqual([
      "shop.example",
      "B",
    ]);
  });

  it("adds nothing when everything is already there", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Pleine" })).body as { id: string };
    expect(
      (await as(owner, "POST", "/imports", { source: "text", listId: list.id, items: [wish("")] })).body,
    ).toMatchObject({ added: 0, skipped: 1 });
  });

  it("never adds to someone else's list", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "À moi" })).body as { id: string };
    expect(
      (await as(other, "POST", "/imports", { source: "csv", listId: list.id, items: [wish("X")] })).status,
    ).toBe(404);
  });

  it("validates what it is sent", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Validée" })).body as { id: string };
    for (const payload of [
      { source: "csv", items: [wish("X")] },
      { source: "csv", listId: list.id, listName: "Deux", items: [wish("X")] },
      { source: "csv", listId: list.id, items: [] },
      { source: "csv", listId: list.id, items: [{ ...wish("X"), priceCents: -1 }] },
      { source: "csv", listId: list.id, items: [{ ...wish("X"), extra: true }] },
      {
        source: "csv",
        listId: list.id,
        items: Array.from({ length: MAX_IMPORT_ITEMS + 1 }, () => wish("X")),
      },
    ]) {
      expect((await as(owner, "POST", "/imports", payload)).status).toBe(400);
    }
    const unsafe = await as(owner, "POST", "/imports", {
      source: "json",
      listId: list.id,
      items: [wish("Piège", "javascript:alert(1)")],
    });
    expect(unsafe.body).toMatchObject({ added: 1 });
    const [row] = await t.db.select().from(schema.wishes).where(eq(schema.wishes.listId, list.id));
    expect(row?.url).toBeNull();
  });
});
