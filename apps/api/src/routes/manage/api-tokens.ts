import { schema } from "@wishalia/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { first, notFound, parse, userId } from "../../http.js";
import { hashToken, newToken } from "../../tokens.js";
import type { ManageDeps } from "./index.js";

type ApiTokenRow = typeof schema.apiTokens.$inferSelect;

/** Every personal access token starts with it: secret scanners and people recognise it. */
export const API_TOKEN_PREFIX = "wsh_";
/** A token always expires: one year at most. */
export const MAX_API_TOKEN_DAYS = 365;
const DAY_MS = 24 * 3600 * 1000;

/** A new personal access token: the prefix, then 32 random bytes in base64url. */
export function newApiToken(): string {
  return `${API_TOKEN_PREFIX}${newToken()}`;
}

/** A token as a script may send it back. */
export function isWellFormedApiToken(value: string): boolean {
  return /^wsh_[A-Za-z0-9_-]{43}$/.test(value);
}

/** Whether a token still opens the API v1: not revoked, not expired. */
export function isApiTokenActive(row: Pick<ApiTokenRow, "expiresAt" | "revokedAt">, now: Date): boolean {
  return row.revokedAt === null && row.expiresAt.getTime() > now.getTime();
}

const apiTokenInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    expiresInDays: z.number().int().min(1).max(MAX_API_TOKEN_DAYS).default(90),
    readOnly: z.boolean().default(false),
  })
  .strict();
const apiTokenParams = z.object({ apiTokenId: z.uuid() });

function ownerApiToken(row: ApiTokenRow, now: Date) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    readOnly: row.readOnly,
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    active: isApiTokenActive(row, now),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The personal access tokens of the REST API v1 (spec §8.2), managed from the management app only:
 * a token can never create another one.
 */
export const apiTokenRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, now }) => {
  app.get("/api-tokens", async (request) => {
    const rows = await db
      .select()
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.ownerId, userId(request)))
      .orderBy(desc(schema.apiTokens.createdAt));
    const at = now();
    return rows.map((row) => ownerApiToken(row, at));
  });

  /** The token is in the answer, once: only its hash is stored. */
  app.post("/api-tokens", async (request, reply) => {
    const input = parse(apiTokenInput, request.body);
    const at = now();
    const token = newApiToken();
    const row = first(
      await db
        .insert(schema.apiTokens)
        .values({
          ownerId: userId(request),
          name: input.name,
          tokenHash: hashToken(token),
          prefix: token.slice(0, API_TOKEN_PREFIX.length + 4),
          readOnly: input.readOnly,
          expiresAt: new Date(at.getTime() + input.expiresInDays * DAY_MS),
          createdAt: at,
        })
        .returning(),
    );
    return reply.status(201).send({ ...ownerApiToken(row, at), token });
  });

  /** Revoking is final and idempotent. */
  app.post("/api-tokens/:apiTokenId/revoke", async (request) => {
    const { apiTokenId } = parse(apiTokenParams, request.params);
    const mine = and(eq(schema.apiTokens.id, apiTokenId), eq(schema.apiTokens.ownerId, userId(request)));
    const at = now();
    await db
      .update(schema.apiTokens)
      .set({ revokedAt: at })
      .where(and(mine, isNull(schema.apiTokens.revokedAt)));
    const [row] = await db.select().from(schema.apiTokens).where(mine);
    if (!row) throw notFound();
    return ownerApiToken(row, at);
  });
};
