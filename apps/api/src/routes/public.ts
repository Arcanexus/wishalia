import type { FastifyPluginAsync } from "fastify";

/**
 * Routes of the public view (<product>.<domain>), reached through share links. Contributions are
 * only returned after the single anti-spoil check (canSeeContributions in @wishalia/domain).
 */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request) => {
    request.scope = "public";
  });
  app.get("/ping", async (request) => ({ scope: request.scope }));
};
