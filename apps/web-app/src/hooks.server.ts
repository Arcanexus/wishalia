import type { Handle, ServerInit } from "@sveltejs/kit/hooks";
import { resolveTheme } from "@wishalia/domain";
import { metricsPort, processMetrics } from "@wishalia/metrics";

import { themeColorTags } from "#lib/install.ts";
import { readPreferences } from "#lib/server/preferences.ts";
import { applySecurityHeaders } from "#lib/security-headers.ts";

const metrics = processMetrics("web-app", process.env.APP_VERSION ?? "dev");

// Runs when the server starts, never during the build
export const init: ServerInit = async () => {
  await metrics.start(metricsPort(), {
    onError: (error) => process.stderr.write(`metrics server failed to start: ${error.message}\n`),
  });
};

export const handle: Handle = async ({ event, resolve }) => {
  const started = performance.now();
  const { themeChoice, mode } = readPreferences(event.cookies);
  event.locals.themeChoice = themeChoice;
  event.locals.mode = mode;
  event.locals.listTheme = null;
  event.locals.christmas = false;

  const response = await resolve(event, {
    // The theme and mode are on <html> from the first byte: no flash of the wrong colours. Read at
    // render time, after the page's load has set the list's forced theme
    transformPageChunk: ({ html }) => {
      const theme = resolveTheme({
        listTheme: event.locals.listTheme,
        christmasList: event.locals.christmas,
        personTheme: event.locals.themeChoice,
        today: new Date(),
      });
      return html
        .replace("%wishalia.theme%", theme)
        .replace("%wishalia.mode%", event.locals.mode)
        .replace("%wishalia.theme-color%", themeColorTags(theme, event.locals.mode));
    },
  });
  applySecurityHeaders(response.headers);
  // The route id (/[token]), never the URL: share link tokens never reach the metrics
  metrics.http.observe({
    method: event.request.method,
    route: event.route.id,
    status: response.status,
    seconds: (performance.now() - started) / 1000,
  });
  return response;
};
