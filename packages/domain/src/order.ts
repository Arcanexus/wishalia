/**
 * A list's new order, from the one the page sends and the open items as they stand
 * (docs/management-app.md, « Order »). The page saves in the background, so its order can be a
 * moment behind: an id that is no longer an open item of the list (deleted, received, archived,
 * someone else's) is left out, and an open item it does not name (just added, on this device or
 * another) keeps its place in front, where a new wish lands. Null when an id is repeated: that is
 * not an order.
 */
export function mergedOrder(named: readonly string[], current: readonly string[]): string[] | null {
  if (new Set(named).size !== named.length) return null;
  const open = new Set(current);
  const kept = named.filter((id) => open.has(id));
  const given = new Set(kept);
  return [...current.filter((id) => !given.has(id)), ...kept];
}
