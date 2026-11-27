import { memoryStorage } from "@wishalia/storage";
import { describe, expect, it, vi } from "vitest";

import { removeInBackground } from "./images.js";

const imgproxy = { key: "00", salt: "00", source: "s3://wishalia/" };

describe("removeInBackground", () => {
  it("removes the files after the caller went on", async () => {
    const storage = memoryStorage();
    await storage.put("wishes/a", new Uint8Array([1]), "image/webp");
    const removed = removeInBackground({ storage, imgproxy }, ["wishes/a"]);
    // Nothing waited for: the file is still there right after the call
    expect(storage.objects.has("wishes/a")).toBe(true);
    await removed;
    expect(storage.objects.has("wishes/a")).toBe(false);
  });

  it("leaves what fails to the periodic cleanup, and says so", async () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "delete").mockRejectedValue(new Error("bucket down"));
    const warn = vi.fn();
    await expect(removeInBackground({ storage, imgproxy }, ["wishes/a", "wishes/b"], { warn })).resolves.toBe(
      undefined,
    );
    expect(warn).toHaveBeenCalledWith({ failed: 2 }, "files left for the periodic cleanup");
  });

  it("does nothing without images or files", async () => {
    await expect(removeInBackground(null, ["wishes/a"])).resolves.toBe(undefined);
    const storage = memoryStorage();
    const spy = vi.spyOn(storage, "delete");
    await removeInBackground({ storage, imgproxy }, []);
    expect(spy).not.toHaveBeenCalled();
  });
});
