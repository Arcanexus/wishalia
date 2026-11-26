import { describe, expect, it } from "vitest";

import { decodeEntities } from "./entities.js";
import {
  cleanText,
  columnKey,
  csvDelimiter,
  fieldOfColumn,
  FILE_IMPORTERS,
  htmlText,
  importCsv,
  ImportError,
  importJson,
  importPrice,
  importQuantity,
  importText,
  importWishlistrPage,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ITEMS,
  normalizeWish,
  parseCsvRows,
  sourceOfFile,
  wishlistrAddress,
} from "./imports.js";
import { MAX_TITLE_LENGTH } from "./items.js";

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof ImportError ? error.code : "other";
  }
  return undefined;
}

describe("cleanText", () => {
  it("collapses spaces and drops control and direction characters", () => {
    expect(cleanText("  Livre\u0000 de\u202e  cuisine\n ", 100)).toBe("Livre de cuisine");
  });
  it("keeps the lines of notes, at most one blank line between them", () => {
    expect(cleanText("Taille M\r\n\r\n\r\n  Couleur   bleue ", 100, true)).toBe("Taille M\n\nCouleur bleue");
  });
  it("bounds the length, takes numbers, and gives null for nothing", () => {
    expect(cleanText("x".repeat(20), 5)).toBe("xxxxx");
    expect(cleanText(12, 5)).toBe("12");
    expect(cleanText("   ", 5)).toBeNull();
    expect(cleanText({}, 5)).toBeNull();
  });
});

describe("importPrice", () => {
  it("reads the ways prices are written, in cents", () => {
    expect(importPrice(12)).toBe(1200);
    expect(importPrice(12.5)).toBe(1250);
    expect(importPrice("12,50 €")).toBe(1250);
    expect(importPrice("1 299,00")).toBe(129900);
    expect(importPrice("1,299.00")).toBe(129900);
    expect(importPrice("1.299")).toBe(129900);
    expect(importPrice("EUR 30")).toBe(3000);
    expect(importPrice({ amount: 9.99, currency: "EUR" })).toBe(999);
    expect(importPrice({ value: "5" })).toBe(500);
  });
  it("leaves out what is not a price in euros", () => {
    expect(importPrice("$12")).toBeNull();
    expect(importPrice("12 USD")).toBeNull();
    expect(importPrice(12, "GBP")).toBeNull();
    expect(importPrice({ amount: 3, currency: "CHF" })).toBeNull();
    expect(importPrice("-3")).toBeNull();
    expect(importPrice("gratuit")).toBeNull();
    expect(importPrice(Number.NaN)).toBeNull();
    expect(importPrice(5_000_000)).toBeNull();
    expect(importPrice(null)).toBeNull();
    expect(importPrice(true)).toBeNull();
  });
  it("takes EUR written as the currency", () => {
    expect(importPrice("7", "eur")).toBe(700);
    expect(importPrice("7", " ")).toBe(700);
  });
});

describe("importQuantity", () => {
  it("keeps whole quantities of two or more, bounded", () => {
    expect(importQuantity(3)).toBe(3);
    expect(importQuantity(" 2 ")).toBe(2);
    expect(importQuantity(5000)).toBe(1000);
    for (const value of [1, 0, -2, 2.5, "deux", null, undefined]) expect(importQuantity(value)).toBeNull();
  });
});

describe("normalizeWish", () => {
  it("cleans the link and gives the site's name to a wish with only a link", () => {
    expect(normalizeWish({ url: "https://www.example.com/p?utm_source=x" })).toEqual({
      title: "example.com",
      url: "https://www.example.com/p",
      notes: null,
      priceCents: null,
      quantity: null,
    });
    expect(normalizeWish({ title: "Vélo", url: "www.example.com/velo" })?.url).toBe(
      "https://www.example.com/velo",
    );
  });
  it("never keeps a link that could run code", () => {
    expect(normalizeWish({ title: "Piège", url: "javascript:alert(1)" })?.url).toBeNull();
    expect(normalizeWish({ url: "javascript:alert(1)" })).toBeNull();
  });
  it("needs a title or a link", () => {
    expect(normalizeWish({ notes: "rien d'autre" })).toBeNull();
    expect(normalizeWish({ title: 42, price: "3" })).toMatchObject({ title: "42", priceCents: 300 });
  });
  it("takes back an amount already in cents, when it is a valid one", () => {
    expect(normalizeWish({ title: "x", priceCents: 1250 })?.priceCents).toBe(1250);
    expect(normalizeWish({ title: "x", priceCents: -5, price: "3" })?.priceCents).toBe(300);
    expect(normalizeWish({ title: "x", priceCents: 1.5 })?.priceCents).toBeNull();
    expect(normalizeWish({ title: "x", priceCents: 1e12 })?.priceCents).toBeNull();
  });
  it("bounds the title", () => {
    expect(normalizeWish({ title: "a".repeat(1000) })?.title).toHaveLength(MAX_TITLE_LENGTH);
  });
});

describe("CSV", () => {
  it("guesses the separator", () => {
    expect(csvDelimiter("a,b\n1;2;3")).toBe(",");
    expect(csvDelimiter("titre;prix;lien")).toBe(";");
    expect(csvDelimiter("title\tprice")).toBe("\t");
    expect(csvDelimiter('"a;b;c",d')).toBe(",");
  });
  it("reads quotes, doubled quotes, newlines in a cell and CRLF", () => {
    expect(parseCsvRows('a,b\r\n"x, ""y""","1\n2"\r\n\r\nlast,', ",")).toEqual([
      ["a", "b"],
      ['x, "y"', "1\n2"],
      [""],
      ["last", ""],
    ]);
  });
  it("refuses a quote left open", () => {
    expect(code(() => parseCsvRows('a\n"open', ","))).toBe("invalid_csv");
  });
  it("finds the columns by their names, in several languages", () => {
    expect(columnKey("Quantité désirée")).toBe("quantitedesiree");
    expect(fieldOfColumn("Product URL")).toBe("url");
    expect(fieldOfColumn("Titre")).toBe("title");
    expect(fieldOfColumn("Price when added")).toBe("price");
    expect(fieldOfColumn("Qté")).toBe("quantity");
    expect(fieldOfColumn("SKU")).toBeUndefined();
  });
  it("imports a French spreadsheet", () => {
    const preview = importCsv(
      "\uFEFFTitre;Lien;Prix;Quantité;Commentaire\n" +
        "Livre de cuisine;https://www.example.com/livre?utm_campaign=x;24,90;;Le tome 2\n" +
        ";;;;\n" +
        ";;12;;sans titre ni lien\n" +
        "Chaussettes;;8;3;\n",
    );
    expect(preview).toEqual({
      source: "csv",
      listName: null,
      items: [
        {
          title: "Livre de cuisine",
          url: "https://www.example.com/livre",
          notes: "Le tome 2",
          priceCents: 2490,
          quantity: null,
        },
        { title: "Chaussettes", url: null, notes: null, priceCents: 800, quantity: 3 },
      ],
      skipped: [{ row: 4, reason: "no_title" }],
    });
  });
  it("imports an export in another currency without its prices", () => {
    const preview = importCsv("Name,Link,Price,Currency\nLego,https://example.com/lego,49.99,USD\n");
    expect(preview.items[0]).toMatchObject({ title: "Lego", priceCents: null });
  });
  it("refuses a file without a title or link column", () => {
    expect(code(() => importCsv("SKU,Variant\n1,2\n"))).toBe("no_columns");
  });
  it("refuses empty and oversized files", () => {
    expect(code(() => importCsv(" \n "))).toBe("empty");
    expect(code(() => importCsv("x".repeat(MAX_IMPORT_BYTES + 1)))).toBe("too_large");
  });
  it("stops at the item limit and says what it left", () => {
    const rows = Array.from({ length: MAX_IMPORT_ITEMS + 2 }, (_, index) => `Envie ${index}`);
    const preview = importCsv(`title\n${rows.join("\n")}`);
    expect(preview.items).toHaveLength(MAX_IMPORT_ITEMS);
    expect(preview.skipped).toEqual([
      { row: MAX_IMPORT_ITEMS + 2, reason: "too_many" },
      { row: MAX_IMPORT_ITEMS + 3, reason: "too_many" },
    ]);
  });
});

describe("JSON", () => {
  it("imports an object with a name and items", () => {
    const preview = importJson(
      JSON.stringify({
        name: "Noël de Léa",
        items: [
          { title: "Puzzle", url: "https://example.com/puzzle", price: { amount: 15, currency: "EUR" } },
          { Name: "Peluche", Notes: "Un renard", Quantity: 2 },
          "Un livre https://example.com/livre",
          42,
          {},
        ],
      }),
    );
    expect(preview.listName).toBe("Noël de Léa");
    expect(preview.items).toEqual([
      { title: "Puzzle", url: "https://example.com/puzzle", notes: null, priceCents: 1500, quantity: null },
      { title: "Peluche", url: null, notes: "Un renard", priceCents: null, quantity: 2 },
      { title: "Un livre", url: "https://example.com/livre", notes: null, priceCents: null, quantity: null },
    ]);
    expect(preview.skipped).toEqual([
      { row: 4, reason: "no_title" },
      { row: 5, reason: "no_title" },
    ]);
  });
  it("imports a bare array, and other names for the items", () => {
    expect(importJson('[{"titre":"Vélo"}]').items[0]?.title).toBe("Vélo");
    expect(importJson('{"Wishes":[{"product":"Lampe"}],"listName":"Maison"}')).toMatchObject({
      listName: "Maison",
      items: [{ title: "Lampe" }],
    });
  });
  it("refuses what is not a list of wishes", () => {
    expect(code(() => importJson("{nope"))).toBe("invalid_json");
    expect(code(() => importJson('{"items":"nope"}'))).toBe("no_columns");
    expect(code(() => importJson("12"))).toBe("no_columns");
  });
});

describe("text", () => {
  it("reads one wish per line, bullets and numbers aside", () => {
    const preview = importText(
      "- Livre de cuisine\n\n2) https://www.example.com/velo?fbclid=1\n• Un pull rouge\n",
    );
    expect(preview.items.map((item) => [item.title, item.url])).toEqual([
      ["Livre de cuisine", null],
      ["example.com", "https://www.example.com/velo"],
      ["Un pull rouge", null],
    ]);
    expect(preview.source).toBe("text");
  });
});

describe("Wishlistr", () => {
  it("builds the address of the public page, and only that", () => {
    expect(wishlistrAddress("wishlistr.com/alex")).toBe("https://www.wishlistr.com/alex/");
    expect(wishlistrAddress(" https://www.wishlistr.com/Alex.B/ ")).toBe("https://www.wishlistr.com/Alex.B/");
    expect(wishlistrAddress("http://www.wishlistr.com/alex?x=1#top")).toBe("https://www.wishlistr.com/alex/");
    for (const input of [
      "https://evil.example/alex",
      "https://wishlistr.com.evil.example/alex",
      "https://user:pw@www.wishlistr.com/alex",
      "https://www.wishlistr.com:8080/alex",
      "ftp://www.wishlistr.com/alex",
      "https://www.wishlistr.com/",
      "https://www.wishlistr.com/help/",
      "https://www.wishlistr.com/dp/12/",
      "https://www.wishlistr.com/%2e%2e/",
      "http://[::1",
    ]) {
      expect(
        code(() => wishlistrAddress(input)),
        input,
      ).toBe("invalid_address");
    }
  });

  it("decodes entities and keeps only the text", () => {
    expect(decodeEntities("&lt;b&gt; &#x3a; &#58; &eacute; &#0;")).toBe("<b> : : é &#0;");
    expect(htmlText("<p>11/01/2026 : liste &agrave; jour</p>")).toBe("11/01/2026 : liste à jour");
    expect(htmlText("<strong>Vélo</strong><br />rouge &amp; noir<span")).toBe("Vélo\nrouge & noir");
  });

  // The markup of a public list, as wishlistr.com serves it (2026)
  const page = `<!DOCTYPE html><html><head><title>Wishlistr – alex&rsquo;s Wishlist</title></head><body>
<div class="wishlist-header"><h2 id="wishlist-title">
  Noël &amp; anniversaire  </h2></div>
<ul class="wishlist list-view" id="wishlist"><li><div class="image"><a href="/dp/1/"><img src="/i/1.jpg" alt=""></a></div><div class="info"><h3>HP LP3065</h3><p>Green color, 4+ stars<br />Priority: lowest</p><div class="item-link"><a href="/dp/12104727/" title="https&#x3a;&#x2f;&#x2f;shop&#x2e;example&#x2e;com&#x2f;index&#x2e;php&#x3f;route&#x3d;product&#x26;product&#x5f;id&#x3d;47&#x26;utm_source&#x3d;wl" rel="nofollow">Buy or view this item</a></div></div></li>
<li><div class="info"><h3>Un <em>bon</em> livre</h3></div></li>
<li><div class="info"><h3>  </h3><p>rien</p></div></li>
<li><div class="info"><h3>Lien piégé</h3><div class="item-link"><a href="/dp/3/" title="javascript:alert(1)">Buy</a></div></div></li>
</ul></body></html>`;

  it("reads the items of a list page", () => {
    expect(importWishlistrPage(page)).toEqual({
      source: "wishlistr",
      listName: "Noël & anniversaire",
      items: [
        {
          title: "HP LP3065",
          url: "https://shop.example.com/index.php?route=product&product_id=47",
          notes: "Green color, 4+ stars\nPriority: lowest",
          priceCents: null,
          quantity: null,
        },
        { title: "Un bon livre", url: null, notes: null, priceCents: null, quantity: null },
        { title: "Lien piégé", url: null, notes: null, priceCents: null, quantity: null },
      ],
      skipped: [{ row: 3, reason: "no_title" }],
    });
  });

  it("refuses a page that is not a list", () => {
    expect(code(() => importWishlistrPage("<html><body>Sign in</body></html>"))).toBe("not_a_wishlistr_list");
    expect(code(() => importWishlistrPage('<ul id="wishlist"><li>never closed'))).toBe(
      "not_a_wishlistr_list",
    );
    expect(code(() => importWishlistrPage("x".repeat(3 * MAX_IMPORT_BYTES + 1)))).toBe("too_large");
  });

  it("reads an empty list, without a title", () => {
    expect(importWishlistrPage("<ul id='wishlist'></ul>")).toMatchObject({ listName: null, items: [] });
  });
});

describe("sourceOfFile", () => {
  it("picks the importer from the name, then the content", () => {
    expect(sourceOfFile("liste.JSON", "")).toBe("json");
    expect(sourceOfFile("liste.csv", "")).toBe("csv");
    expect(sourceOfFile("liste.tsv", "")).toBe("csv");
    expect(sourceOfFile("export", "\uFEFF [ ]")).toBe("json");
    expect(sourceOfFile("export.txt", '"Title";"Price"\nx;1')).toBe("csv");
    expect(sourceOfFile("notes.txt", "Livre, tome 2\nVélo")).toBe("text");
    expect(sourceOfFile("notes", "")).toBe("text");
  });
  it("has an importer for each file source", () => {
    expect(Object.keys(FILE_IMPORTERS).sort()).toEqual(["csv", "json", "text"]);
  });
});
