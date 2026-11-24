import { describe, expect, it } from "vitest";

import { cropOption, imagePath, imageSources, isImagePath, sign } from "./imgproxy.js";

const settings = { key: "736563726574", salt: "68656c6c6f", bucket: "wishalia" };

describe("imgproxy paths", () => {
  it("signs as imgproxy's documentation shows", () => {
    expect(
      sign(settings, "/rs:fill:300:400:0/g:sm/aHR0cDovL2V4YW1w/bGUuY29tL2ltYWdl/cy9jdXJpb3NpdHku/anBn.png"),
    ).toBe("oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8");
  });

  it("writes the frame with relative values, a full side as 0", () => {
    expect(cropOption({ x: 0.1, y: 0.25, width: 0.5, height: 1 })).toBe("c:0.5:0:nowe:0.1:0.25");
    expect(cropOption({ x: 0, y: 0, width: 0.33333, height: 0.66666 })).toBe("c:0.3333:0.6667:nowe:0:0");
  });

  it("builds a signed path under /img, with the frame on the small sizes only", () => {
    const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const path = imagePath(settings, "wishes/a/b", "small", crop);
    const source = Buffer.from("s3://wishalia/wishes/a/b").toString("base64url");
    expect(path).toMatch(
      new RegExp(`^/img/[\\w-]{43}/c:0.5:0.5:nowe:0.1:0.1/rs:fill:192:192:0/${source}\\.webp$`),
    );
    const rest = path.slice("/img/".length + 43);
    expect(path.slice(5, 48)).toBe(sign(settings, rest));
    expect(imagePath(settings, "wishes/a/b", "large", crop)).not.toContain("c:");
    const sources = imageSources(settings, "wishes/a/b", null);
    expect(sources.medium).toContain("/rs:fill:480:480:0/");
    expect(sources.small).not.toContain("c:");
    expect(isImagePath(sources.large.slice(4))).toBe(true);
  });

  it("only lets signed-looking paths through to imgproxy", () => {
    const good = imagePath(settings, "wishes/a/b", "medium", null).slice(4);
    expect(isImagePath(good)).toBe(true);
    expect(isImagePath("/insecure/plain/http://10.0.0.1/x.webp")).toBe(false);
    expect(isImagePath(`${good.slice(0, 44)}/../health.webp`)).toBe(false);
    expect(isImagePath(good.replace(".webp", ".svg"))).toBe(false);
    expect(isImagePath(`${good}?x=1`)).toBe(false);
  });
});
