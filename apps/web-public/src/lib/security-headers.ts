/**
 * Security headers added to every response, on top of the CSP that SvelteKit writes.
 * same-origin matters most on the public view: a share link carries its token in the URL,
 * which must never leak to another site through the Referer header. Not no-referrer: with it, the
 * browsers send `Origin: null` on a plain form POST, and SvelteKit's CSRF check refuses the form
 * (the sign-out button, the light/dark button).
 */
export const securityHeaders: Readonly<Record<string, string>> = {
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
}
