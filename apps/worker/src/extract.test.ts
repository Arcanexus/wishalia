import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { currencyOf, decodeEntities, extract, extractImages, isBotWall, priceToCents } from "./extract.js";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

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

describe("extract, on Amazon", () => {
  // Amazon writes no JSON-LD and no price tag: the price is in the page
  const page = fixture("amazon-fr-product.html");

  it("reads the product's title and the price to pay, not the struck-out one", () => {
    expect(extract(page)).toEqual({
      title: "LEGO Creator 3-en-1 La Maison Moderne, Jouet de Construction & Décoration",
      priceCents: 5999,
      currency: "EUR",
    });
  });

  it("reads the price split in whole and fraction, when the hidden text is missing", () => {
    const html = page.replace(/<span class="a-offscreen">[^<]*<\/span>/g, "");
    expect(extract(html)).toMatchObject({ priceCents: 5999, currency: "EUR" });
    const thousands = `<div id="dp"><div id="corePrice_feature_div"><span class="a-price">
      <span class="a-price-whole">1&#8239;299<span class="a-price-decimal">,</span></span>
      <span class="a-price-symbol">€</span></span></div></div>`;
    expect(extract(thousands)).toMatchObject({ priceCents: 129900, currency: "EUR" });
  });

  it("falls back on the hidden fields of the cart, then on the variants' data", () => {
    const fields = page.replace(/<div id="apex_desktop"[\s\S]*?<div id="rightCol">/, '<div id="rightCol">');
    expect(extract(fields)).toMatchObject({ priceCents: 5999, currency: "EUR" });
    const twister = `<div id="ppd"><input type="hidden" id="twister-plus-price-data-price" value="24,90">
      <input type="hidden" id="twister-plus-price-data-price-unit" value="€"></div>`;
    expect(extract(twister)).toMatchObject({ priceCents: 2490, currency: "EUR" });
    const bare = `<div id="ppd"><input type="hidden" id="attach-base-product-price" value="15.00"></div>`;
    expect(extract(bare)).toMatchObject({ priceCents: 1500, currency: null });
    const json = `<div id="ppd"></div><script>P.declare("twister",{"priceAmount":19.5,"currencyCode":"EUR"})</script>`;
    expect(extract(json)).toMatchObject({ priceCents: 1950, currency: "EUR" });
    const jsonNoCode = `<div id="ppd"></div><script>{"priceAmount":"7"}</script>`;
    expect(extract(jsonNoCode)).toMatchObject({ priceCents: 700, currency: null });
  });

  it("keeps the title without a price, and an amazon.com price in dollars", () => {
    expect(
      extract(`<div id="dp"><span id="productTitle"> Livre </span><div id="price">Indisponible</div></div>`),
    ).toEqual({ title: "Livre", priceCents: null, currency: null });
    const us = `<div id="dp"><div id="corePrice_desktop"><span class="a-offscreen">$1,299.00</span></div></div>`;
    expect(extract(us)).toMatchObject({ priceCents: 129900, currency: "USD" });
    // A range of prices: its lowest
    const range = `<div id="dp"><div id="price"><span class="a-offscreen">19,99 € - 29,99 €</span></div></div>`;
    expect(extract(range)).toMatchObject({ priceCents: 1999 });
  });

  it("leaves a page that only looks like Amazon alone", () => {
    expect(extract(`<div class="a-offscreen">12 €</div>`)).toMatchObject({ priceCents: null });
  });
});

describe("extract, from microdata", () => {
  it("reads itemprop price, from its content or its text, and its currency", () => {
    expect(
      extract(
        `<span itemprop="price" content="89.00">89 €</span><meta itemprop="priceCurrency" content="EUR">`,
      ),
    ).toMatchObject({ priceCents: 8900, currency: "EUR" });
    expect(extract(`<p>Prix : <span itemprop="price">12,50&nbsp;€</span></p>`)).toMatchObject({
      priceCents: 1250,
      currency: "EUR",
    });
    expect(extract(`<b itemprop="price">bientôt</b><i itemprop="price">£5</i>`)).toMatchObject({
      priceCents: 500,
      currency: "GBP",
    });
    expect(extract(`<b itemprop="price">9`)).toMatchObject({ priceCents: 900, currency: null });
  });

  it("comes after the JSON-LD and the tags", () => {
    expect(
      extract(`<meta property="og:price:amount" content="10"><span itemprop="price" content="20"></span>`),
    ).toMatchObject({ priceCents: 1000 });
  });
});

describe("isBotWall", () => {
  it("knows the walls against robots, and never takes a product page for one", () => {
    expect(isBotWall(fixture("amazon-fr-captcha.html"))).toBe(true);
    expect(isBotWall("<title>Robot Check</title>")).toBe(true);
    expect(isBotWall("<title>Just a moment...</title><div id=cf-chl-widget>")).toBe(true);
    expect(isBotWall(fixture("amazon-fr-product.html"))).toBe(false);
    expect(isBotWall(`<span id="productTitle">x</span><form action="/errors/validateCaptcha">`)).toBe(false);
    expect(isBotWall("<title>Lampe</title>")).toBe(false);
  });
});

describe("currencyOf", () => {
  it("reads ISO codes and the usual symbols", () => {
    expect(currencyOf("12 eur")).toBe("EUR");
    expect(currencyOf("CHF 12")).toBe("CHF");
    expect(currencyOf("¥1200")).toBe("JPY");
    expect(currencyOf("12")).toBeNull();
    expect(currencyOf(null)).toBeNull();
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
