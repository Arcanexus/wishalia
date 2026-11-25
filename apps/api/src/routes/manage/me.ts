import { schema } from "@wishalia/db";
import { LOCALE_CHOICES, parseLocale } from "@wishalia/i18n";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { first, parse, userId } from "../../http.js";
import type { ManageDeps } from "./index.js";

/** What a person changes about themselves: their name, how the apps look and speak to them. */
export const mePatch = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    theme: z.enum(["auto", "neutral", "christmas"]),
    mode: z.enum(["device", "light", "dark"]),
    // « auto »: the browser's language (docs/i18n.md), stored as null
    locale: z.enum(LOCALE_CHOICES as [string, ...string[]]),
  })
  .partial()
  .strict();

type UserRow = typeof schema.users.$inferSelect;

const me = (row: UserRow, imagesOn: boolean) => ({
  id: row.id,
  displayName: row.displayName,
  email: row.email,
  theme: row.theme,
  mode: row.mode,
  locale: parseLocale(row.locale) ?? "auto",
  /** What this server offers: images need the S3 bucket and imgproxy (docs/images.md). */
  features: { images: imagesOn },
});

export const meRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, images }) => {
  /** The signed-in person and their display settings: what the app shows in its header. */
  app.get("/me", async (request) => {
    return me(
      first(
        await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, userId(request))),
      ),
      images !== null,
    );
  });

  /** The settings follow the person on every device (docs/branding.md, « Theme settings »). */
  app.patch("/me", async (request) => {
    const { locale, ...patch } = parse(mePatch, request.body);
    const rows = await db
      .update(schema.users)
      .set(locale === undefined ? patch : { ...patch, locale: locale === "auto" ? null : locale })
      .where(eq(schema.users.id, userId(request)))
      .returning();
    return me(first(rows), images !== null);
  });
};
