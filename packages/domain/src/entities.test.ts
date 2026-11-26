import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { decodeEntities } from "./entities.js";

describe("decodeEntities", () => {
  it("decodes the accents of Latin-1, as an imported French list writes them", () => {
    expect(
      decodeEntities("liste &agrave; jour, &eacute;t&eacute;, gar&ccedil;on, &Eacute;cole, c&oelig;ur"),
    ).toBe("liste à jour, été, garçon, École, cœur");
  });

  it("decodes the typographic ones a shop writes", () => {
    expect(decodeEntities("l&rsquo;&eacute;t&eacute; &ndash; 12&nbsp;&euro;&hellip; &laquo;oui&raquo;")).toBe(
      "l’été – 12 €… «oui»",
    );
  });

  it("decodes numeric ones, and the XML ones in any case", () => {
    expect(decodeEntities("&#233;&#xE9;&#XE9; &AMP; &Lt;")).toBe("ééé & <");
  });

  it("keeps what it does not know, and what is no character", () => {
    expect(decodeEntities("&bogus; &AGRAVE; &#0; &#x110000; & ; &amp")).toBe(
      "&bogus; &AGRAVE; &#0; &#x110000; & ; &amp",
    );
  });

  it("decodes once: an escaped entity stays an entity", () => {
    expect(decodeEntities("&amp;agrave;")).toBe("&agrave;");
  });
});

describe("migration 0015", () => {
  it("decodes the saved texts with the same table", () => {
    const sql = readFileSync(
      new URL("../../db/migrations/0015_decode_entities.sql", import.meta.url),
      "utf8",
    );
    const table = JSON.parse(/named constant jsonb := '([^']+)'/.exec(sql)?.[1] ?? "{}") as Record<
      string,
      number
    >;
    expect(Object.keys(table).length).toBeGreaterThan(100);
    for (const [name, code] of Object.entries(table)) {
      expect(decodeEntities(`&${name};`)).toBe(String.fromCodePoint(code));
    }
    expect(decodeEntities("&agrave;")).toBe("à");
  });
});
