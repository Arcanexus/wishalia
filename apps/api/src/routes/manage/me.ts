import { schema } from "@wishalia/db";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { first, parse, userId } from "../../http.js";
import type { ManageDeps } from "./index.js";

/** What a person changes about themselves: their name and how the apps look to them. */
export const mePatch = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    theme: z.enum(["auto", "neutral", "christmas"]),
    mode: z.enum(["device", "light", "dark"]),
  })
  .partial()
  .strict();

type UserRow = typeof schema.users.$inferSelect;

const me = (row: UserRow) => ({
  id: row.id,
  displayName: row.displayName,
  email: row.email,
  theme: row.theme,
  mode: row.mode,
});

export const meRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db }) => {
  /** The signed-in person and their display settings: what the app shows in its header. */
  app.get("/me", async (request) => {
    return me(
      first(
        await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, userId(request))),
      ),
    );
  });

  /** The settings follow the person on every device (docs/branding.md, « Theme settings »). */
  app.patch("/me", async (request) => {
    const patch = parse(mePatch, request.body);
    const rows = await db
      .update(schema.users)
      .set(patch)
      .where(eq(schema.users.id, userId(request)))
      .returning();
    return me(first(rows));
  });
};
