import type { FastifyPluginAsync } from "fastify";

import type { Auth } from "../auth/auth.js";
import { sendWebResponse, toWebRequest } from "../auth/fastify.js";
import type { Config } from "../config.js";

/**
 * Better Auth endpoints (/auth/*): sign in with OIDC, a passkey or a magic link, sign out,
 * sessions. The management app proxies /auth/* here, so that the cookies stay on its host.
 */
export const authRoutes: FastifyPluginAsync<{ auth: Auth; config: Config }> = async (
  app,
  { auth, config },
) => {
  app.route({
    method: ["GET", "POST"],
    url: "/*",
    handler: async (request, reply) =>
      sendWebResponse(reply, await auth.handler(toWebRequest(request, config))),
  });
};
