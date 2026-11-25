/** Drag and drop of a list's items, as pure functions (the page does the pointer work). */

/** The ids with one of them moved to a new place (clamped to the list). */
export function moveId(ids: readonly string[], id: string, to: number): string[] {
  const rest = ids.filter((other) => other !== id);
  if (rest.length === ids.length) return [...ids];
  const at = Math.min(rest.length, Math.max(0, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Where a dragged item lands: after every other item whose middle is above the pointer. */
export function dropIndex(middles: readonly number[], y: number): number {
  return middles.filter((middle) => middle < y).length;
}
