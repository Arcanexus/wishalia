import { describe, expect, it } from "vitest";

import { decodeEntities, extract, priceToCents, extractImages } from "./extract.js";

describe("extract", () => {
  it("reads the JSON-LD Product first, in a @graph, with its offer", () => {
    const html = `<html><head>
      <meta property="og:title" content="Moins bien">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
        {"@type":["Product","Thing"],"name":"Lampe &amp; abat-jour","offers":[{"@type":"Offer","price":49.9,"priceCurrency":"EUR"}]}]}</script>
      </head></html>`;
    expect(extract(html)).toEqual({ title: "Lampe & abat-jour", priceCents: 4990, currency: "EUR" });
  });

  it("takes an aggregate offer's lowest price, and skips a broken JSON-LD", () => {
    const html = `<script type="application/ld+json">{ broken</script>
      <script type='application/ld+json'>{"@type":"Product","name":"Vélo","offers":{"@type":"AggregateOffer","lowPrice":"299,00","priceCurrency":"EUR"}}</script>`;
    expect(extract(html)).toMatchObject({ title: "Vélo", priceCents: 29900 });
  });

  it("falls back on Open Graph, then Twitter, then the page's title", () => {
    const og = `<meta content="Théière &quot;fonte&quot;" property="og:title" />
      <meta property="product:price:amount" content="35.00"><meta property="product:price:currency" content="EUR">`;
    expect(extract(og)).toEqual({ title: 'Théière "fonte"', priceCents: 3500, currency: "EUR" });
    expect(extract(`<meta name="twitter:title" content="Gants">`).title).toBe("Gants");
    expect(extract(`<title>\n  Puzzle 1000 pièces | Boutique\n</title>`)).toEqual({
      title: "Puzzle 1000 pièces | Boutique",
      priceCents: null,
      currency: null,
    });
    expect(extract("<p>rien</p>")).toEqual({ title: null, priceCents: null, currency: null });
  });

  it("keeps the meta price when the JSON-LD has none", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Livre"}</script>
      <meta property="og:price:amount" content="12,50">`;
    expect(extract(html)).toMatchObject({ title: "Livre", priceCents: 1250 });
  });
});

describe("priceToCents", () => {
  it("reads prices the way pages write them", () => {
    expect(priceToCents(49.9)).toBe(4990);
    expect(priceToCents("49,90 €")).toBe(4990);
    expect(priceToCents("1 299,00")).toBe(129900);
    expect(priceToCents("1,299.00")).toBe(129900);
    expect(priceToCents("1.299")).toBe(129900);
    expect(priceToCents("12")).toBe(1200);
    expect(priceToCents("gratuit")).toBeNull();
    expect(priceToCents(Number.NaN)).toBeNull();
    expect(priceToCents(null)).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("decodes the named and numeric entities, and leaves the unknown ones", () => {
    expect(decodeEntities("a&nbsp;b &#233;t&#xE9; &lt;3&gt; &apos;x&apos; &bogus; &#0;")).toBe(
      "a b été <3> 'x' &bogus; &#0;",
    );
  });
});

describe("extractImages", () => {
  it("takes the product's images first, then the sharing ones, then the photos of the page", () => {
    const html = `
      <script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Lampe",
        "image":["/p/1.jpg",{"@type":"ImageObject","contentUrl":"/p/2.jpg"},{"url":"/p/3.jpg"}]}]}</script>
      <meta property="og:image" content="https://cdn.example.com/og.jpg?a=1&amp;b=2">
      <meta name="twitter:image" content="/tw.jpg">
      <link rel="image_src" href="/src.jpg">
      <img src="/logo.png"><img src="/icons/cart.svg"><img src="/tiny.jpg" width="16" height="16">
      <img src="/thumb.jpg" data-src="/large.jpg" width="600">`;
    expect(extractImages(html)).toEqual([
      "/p/1.jpg",
      "/p/2.jpg",
      "/p/3.jpg",
      "https://cdn.example.com/og.jpg?a=1&b=2",
      "/tw.jpg",
      "/src.jpg",
      "/large.jpg",
    ]);
  });

  it("reads a single JSON-LD image, skips a broken JSON-LD, and gives nothing without images", () => {
    expect(
      extractImages(`<script type="application/ld+json">{oops</script>
        <script type="application/ld+json">{"@type":"Product","image":"/one.webp"}</script>`),
    ).toEqual(["/one.webp"]);
    expect(
      extractImages(`<script type="application/ld+json">{"@type":"Product","image":42}</script>`),
    ).toEqual([]);
    expect(extractImages("<title>Rien</title>")).toEqual([]);
  });
});
