import type { FastifyError, FastifyInstance } from "fastify";
import type { z } from "zod";

/** An error with an HTTP status, turned into `{ error, issues? }` by the error handler. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/**
 * 404 for anything the person may not see: a resource of someone else answers exactly like a
 * missing one, so that ids cannot be probed.
 */
export const notFound = () => new HttpError(404, "not_found");

/** Validates a body, a query or params; a 400 lists what is wrong, field by field. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}

/** JSON errors only, and never a stack trace or an internal message in a 5xx. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: error.code, ...error.details });
    }
    const status = error.statusCode ?? 500;
    if (status < 500) {
      return reply.status(status).send({ error: error.code ?? "bad_request" });
    }
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({ error: "internal" });
  });
}

/** The signed-in person's id, set by the /manage guard. */
export function userId(request: { user: { id: string } | null }): string {
  if (!request.user) throw new HttpError(401, "unauthenticated");
  return request.user.id;
}

/** The row an INSERT ... RETURNING or a lookup must give. */
export function first<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw notFound();
  return row;
}
