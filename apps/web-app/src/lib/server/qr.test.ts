import { describe, expect, it } from "vitest";

import { qrPath } from "./qr.ts";

describe("qrPath", () => {
  it("draws a square code with its quiet zone", () => {
    const { size, path } = qrPath("https://wish.example/s/Kq3v9ZpL2mXa");
    // Version 3 (29 modules) at the M level for an address this long, plus 2 modules each side
    expect(size).toBe(33);
    // The top left finder pattern starts at the quiet zone
    expect(path.startsWith("M2 2h1v1h-1z")).toBe(true);
    expect(path).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
  });

  it("makes a bigger code for a longer address", () => {
    expect(qrPath(`https://wish.example/s/${"x".repeat(120)}`).size).toBeGreaterThan(33);
  });
});
