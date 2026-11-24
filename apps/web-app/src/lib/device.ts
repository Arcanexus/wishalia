/** Which instructions to show first to install the app (docs/install-app.md). Pure. */
export type Platform = "android" | "ios" | "computer";

/**
 * The platform, from the browser's user agent. iPadOS says it is a Mac: a Mac with a touch screen
 * is an iPad. A wrong guess only changes which instructions come first: all are on the page.
 */
export function platform(userAgent: string, touchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/macintosh/i.test(userAgent) && touchPoints > 1) return "ios";
  return "computer";
}

/** The address the iOS Shortcut opens, with what was shared added at its end. */
export const shortcutAddress = (origin: string) => `${origin}/ajouter?text=`;
