import { z } from "zod";

import type { Config } from "../../config.js";
import { eventInput, eventPatch } from "../manage/events.js";
import { itemPatch, quickAddInput } from "../manage/items.js";
import { listInput, listPatch } from "../manage/lists.js";

type Schema = Record<string, unknown>;

/** A request body, from the zod schema the route validates with: the description cannot drift. */
const body = (schema: z.ZodType): Schema => ({
  required: true,
  content: {
    "application/json": { schema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) },
  },
});

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Schema, description = "OK"): Schema => ({
  description,
  content: { "application/json": { schema } },
});
const noContent = { description: "Done" };
const uuidParam = (name: string): Schema => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
});

const nullable = (type: string, format?: string): Schema => ({
  type: [type, "null"],
  ...(format ? { format } : {}),
});

const schemas: Record<string, Schema> = {
  Error: {
    type: "object",
    required: ["error"],
    properties: {
      error: { type: "string", examples: ["not_found"] },
      issues: {
        type: "array",
        items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } },
      },
    },
  },
  Me: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      displayName: { type: "string" },
      email: { type: "string" },
    },
  },
  List: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      position: { type: "integer" },
      theme: { enum: ["neutral", "christmas", null] },
      revealMode: { enum: ["received", "manual"] },
      secretLifted: { type: "boolean" },
      itemCount: { type: "integer", description: "Open items." },
      createdAt: { type: "string", format: "date-time" },
      archivedAt: nullable("string", "date-time"),
    },
  },
  Item: {
    type: "object",
    description: "An item as its owner sees it: never any contribution data.",
    properties: {
      id: { type: "string", format: "uuid" },
      listId: { type: "string", format: "uuid" },
      kind: { enum: ["unique", "quantity", "pool"] },
      repeatable: { type: "boolean" },
      title: { type: "string" },
      url: nullable("string"),
      notes: nullable("string"),
      imageKey: nullable("string"),
      priceCents: nullable("integer"),
      targetCents: nullable("integer"),
      quantity: nullable("integer"),
      seriesId: nullable("string", "uuid"),
      seriesNumber: nullable("integer"),
      seriesState: { enum: ["owned", "wanted", "given", null] },
      status: { enum: ["open", "received", "archived"] },
      position: { type: "integer" },
      enrichment: {
        enum: ["pending", "done", "failed", null],
        description: "The completion from the link: pending while the worker has it to do.",
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  HistoryEntry: {
    type: "object",
    description: "Contributions only appear once their secret is lifted.",
    properties: {
      id: { type: "integer" },
      type: { type: "string" },
      at: { type: "string", format: "date-time" },
      actorId: nullable("string", "uuid"),
      payload: { type: "object" },
    },
  },
  Event: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      kind: { enum: ["birthday", "christmas", "other"] },
      date: { type: "string", format: "date" },
      revealDelayDays: { type: "integer" },
      revealAvailableAt: { type: "string", format: "date-time" },
      canReveal: { type: "boolean" },
      secretLifted: { type: "boolean" },
    },
  },
};

const list = (name: string) => ({ type: "array", items: ref(name) });

/**
 * The OpenAPI 3.1 description of the REST API v1, served at /v1/openapi.json. The request bodies
 * come from the zod schemas of the routes themselves.
 */
export function openApiDocument(config: Config) {
  return {
    openapi: "3.1.0",
    info: {
      title: `${config.APP_NAME} API`,
      version: "1",
      description:
        "Lists, items and events of the owner of the token, for scripts and home automation. " +
        "Never any contribution data (anti-spoil). Errors are JSON: { error, issues? }.",
    },
    servers: [{ url: `${config.API_ORIGIN ?? "http://localhost:3000"}/v1` }],
    security: [{ token: [] }],
    components: {
      securitySchemes: {
        token: {
          type: "http",
          scheme: "bearer",
          description:
            "A personal access token (wsh_...), made in the management app. Read-only tokens only read. " +
            `${config.API_RATE_LIMIT} requests per minute and per token (429 beyond, with Retry-After).`,
        },
      },
      schemas,
    },
    paths: {
      "/me": { get: { summary: "The owner of the token", responses: { 200: json(ref("Me")) } } },
      "/lists": {
        get: { summary: "The lists, in their order", responses: { 200: json(list("List")) } },
        post: {
          summary: "Create a list",
          requestBody: body(listInput),
          responses: { 201: json(ref("List"), "Created") },
        },
      },
      "/lists/{listId}": {
        parameters: [uuidParam("listId")],
        patch: {
          summary: "Edit a list",
          requestBody: body(listPatch),
          responses: { 200: json(ref("List")) },
        },
      },
      "/lists/{listId}/items": {
        parameters: [uuidParam("listId")],
        get: { summary: "The items of a list", responses: { 200: json(list("Item")) } },
      },
      "/lists/{listId}/reveal": {
        parameters: [uuidParam("listId")],
        post: {
          summary: "Lift the secret of the contributions without an event (manual mode)",
          responses: { 200: json(ref("List")), 409: json(ref("Error"), "Not in manual mode") },
        },
      },
      "/items": {
        post: {
          summary: "Quick add: a URL and/or text",
          requestBody: body(quickAddInput),
          responses: { 201: json(ref("Item"), "Created, with duplicateOf") },
        },
      },
      "/items/{itemId}": {
        parameters: [uuidParam("itemId")],
        get: { summary: "An item", responses: { 200: json(ref("Item")) } },
        patch: {
          summary: "Edit an item",
          requestBody: body(itemPatch),
          responses: { 200: json(ref("Item")) },
        },
      },
      "/items/{itemId}/history": {
        parameters: [uuidParam("itemId")],
        get: { summary: "The history of an item", responses: { 200: json(list("HistoryEntry")) } },
      },
      "/events": {
        get: { summary: "The events, by date", responses: { 200: json(list("Event")) } },
        post: {
          summary: "Create an event",
          requestBody: body(eventInput),
          responses: { 201: json(ref("Event"), "Created") },
        },
      },
      "/events/{eventId}": {
        parameters: [uuidParam("eventId")],
        patch: {
          summary: "Edit an event",
          requestBody: body(eventPatch),
          responses: { 200: json(ref("Event")) },
        },
      },
      "/events/{eventId}/items": {
        parameters: [uuidParam("eventId")],
        get: { summary: "The items an event selects", responses: { 200: json(list("Item")) } },
      },
      "/events/{eventId}/items/{itemId}": {
        parameters: [uuidParam("eventId"), uuidParam("itemId")],
        put: { summary: "Add an item to an event", responses: { 204: noContent } },
        delete: { summary: "Remove an item from an event", responses: { 204: noContent } },
      },
      "/events/{eventId}/reveal": {
        parameters: [uuidParam("eventId")],
        post: {
          summary: "Lift the secret of an event",
          responses: { 200: json(ref("Event")), 409: json(ref("Error"), "Too early") },
        },
      },
    },
  };
}
