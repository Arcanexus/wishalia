import type { FastifyPluginAsync } from "fastify";

/**
 * Routes of the management app (app.<product>.<domain>), for the owner of the lists.
 * Rule: no response of this scope ever carries contribution data (spec, section 3).
 */
export const manageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request) => {
    request.scope = "manage";
  });
  app.get("/ping", async (request) => ({ scope: request.scope }));
};
