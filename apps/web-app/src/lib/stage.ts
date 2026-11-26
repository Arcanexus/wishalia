import { stageOf, type Stage } from "@wishalia/domain";

import type { Item } from "./types.ts";

/**
 * The step an item shows (docs/live-updates.md). The API says "pending" for a waiting or a running
 * item alike, and gives enrichmentStep "images" only while the worker fetches the images.
 */
export const itemStage = (item: Pick<Item, "enrichment" | "enrichmentStep">): Stage =>
  item.enrichmentStep === "images" ? "images" : stageOf(item.enrichment ?? null, null);
