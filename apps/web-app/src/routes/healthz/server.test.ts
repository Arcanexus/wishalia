import { describe, expect, it } from "vitest";

import { GET } from "./+server";

describe("GET /healthz", () => {
  it("answers ok", async () => {
    // The handler reads nothing from the event
    const response = await GET({} as Parameters<typeof GET>[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
