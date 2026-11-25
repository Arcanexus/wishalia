/**
 * The pages that follow the worker live (docs/live-updates.md): while an item is being completed
 * from its link, the management app and the guests' page ask a small "what changed" question
 * now and then, and load the list again only when the answer changes. These rules say what
 * each step is called, how often to ask, and what to tell a screen reader.
 */

export type EnrichmentState = "pending" | "running" | "done" | "failed" | null;
export type EnrichmentStep = "images" | null;

/** What the pages show: the link being read, its images on their way, a link that cannot be read. */
export type Stage = "reading" | "images" | "failed" | null;

export function stageOf(enrichment: EnrichmentState, step: EnrichmentStep): Stage {
  if (enrichment === "running" && step === "images") return "images";
  if (enrichment === "pending" || enrichment === "running") return "reading";
  if (enrichment === "failed") return "failed";
  return null;
}

/** Still on its way: the pages keep asking. */
export const isLive = (stage: Stage) => stage === "reading" || stage === "images";

/** Quick while the worker is usually on it, slower for the links tried again later. */
export const LIVE_FAST_MS = 2_000;
export const LIVE_SLOW_MS = 10_000;
/** Past it the worker has given up (three attempts, a minute apart and more): the page stops asking. */
export const LIVE_FAST_FOR_MS = 2 * 60_000;
export const LIVE_STOP_AFTER_MS = 10 * 60_000;

/** The wait before the next question, or null to stop, after `elapsed` ms of asking. */
export function nextLiveDelay(elapsed: number): number | null {
  if (elapsed >= LIVE_STOP_AFTER_MS) return null;
  return elapsed < LIVE_FAST_FOR_MS ? LIVE_FAST_MS : LIVE_SLOW_MS;
}

/** An item as the live page compares it, before and after. */
export interface LiveItem {
  id: string;
  title: string;
  priceCents: number | null;
  stage: Stage;
  /** Anything that changes when the shown image changes (its address). */
  image: string | null;
}

export type LiveChange =
  | { id: string; title: string; kind: "details" }
  | { id: string; title: string; kind: "image" }
  | { id: string; title: string; kind: "done" }
  | { id: string; title: string; kind: "failed" };

/**
 * What a screen reader is told after the list loaded again: one line per item, the most telling
 * change only (« found », « its image », « done », « cannot be read »). Items that appeared,
 * disappeared or did not change say nothing: the page itself already says it.
 */
export function liveChanges(before: readonly LiveItem[], after: readonly LiveItem[]): LiveChange[] {
  const old = new Map(before.map((item) => [item.id, item]));
  const changes: LiveChange[] = [];
  for (const item of after) {
    const was = old.get(item.id);
    if (!was) continue;
    const base = { id: item.id, title: item.title };
    if (item.stage === "failed" && was.stage !== "failed") changes.push({ ...base, kind: "failed" });
    else if (isLive(was.stage) && !isLive(item.stage)) changes.push({ ...base, kind: "done" });
    else if (item.image !== was.image && item.image !== null) changes.push({ ...base, kind: "image" });
    else if (item.title !== was.title || item.priceCents !== was.priceCents)
      changes.push({ ...base, kind: "details" });
  }
  return changes;
}
