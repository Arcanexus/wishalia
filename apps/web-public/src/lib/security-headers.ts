/**
 * Security headers added to every response, on top of the CSP that SvelteKit writes.
 * no-referrer matters most on the public view: a share link carries its token in the URL,
 * which must never leak to another site through the Referer header.
 */
export const securityHeaders: Readonly<Record<string, string>> = {
  "referrer-policy": "no-referrer",
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
