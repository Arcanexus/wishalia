import { LIST_ICONS } from "@wishalia/domain";
import { z } from "zod";

import type { Config } from "../../config.js";
import { eventInput, eventPatch } from "../manage/events.js";
import { imagePatch } from "../manage/item-images.js";
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
      icon: {
        enum: [...LIST_ICONS, null],
        description: "The icon shown next to its name; null shows the default one (gift).",
      },
      image: {
        oneOf: [ref("ImageSources"), { type: "null" }],
        description: "The image the owner sent, shown instead of the icon; null without one.",
      },
      theme: { enum: ["neutral", "christmas", null] },
      revealMode: { enum: ["received", "manual"] },
      secretLifted: { type: "boolean" },
      visibility: {
        enum: ["private", "public"],
        description:
          "Private: share links only. Public: the home page's search finds it, anyone may take part.",
      },
      openUrl: { ...nullable("string"), description: "The open link of a public list; null when private." },
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
      image: {
        oneOf: [ref("ItemImage"), { type: "null" }],
        description: "The image shown, framed, in three sizes, and the others; null without one.",
      },
      imageCrop: { oneOf: [ref("Crop"), { type: "null" }] },
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
      enrichmentStep: {
        enum: ["images", null],
        description: "While pending: images once the title and price are written and the images load.",
      },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  ImageSources: {
    type: "object",
    description:
      "Signed thumbnail paths (WebP), to read on the management app's host: " +
      "small 192 px and medium 480 px squares, large up to 1200 px, whole.",
    properties: {
      small: { type: "string", examples: ["/img/<signature>/rs:fill:192:192:0/<source>.webp"] },
      medium: { type: "string" },
      large: { type: "string" },
    },
  },
  ItemImage: {
    allOf: [
      ref("ImageSources"),
      {
        type: "object",
        properties: {
          gallery: {
            type: "array",
            maxItems: 7,
            items: { type: "string" },
            description: "The item's other images, whole (large size), in the order of its page.",
          },
        },
      },
    ],
  },
  Crop: {
    type: "object",
    description: "A frame, as fractions (0 to 1) of the image's width and height.",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number" },
      height: { type: "number" },
    },
  },
  ItemImages: {
    type: "object",
    properties: {
      imageId: nullable("string", "uuid"),
      crop: { oneOf: [ref("Crop"), { type: "null" }] },
      images: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            source: { enum: ["page", "upload"] },
            width: nullable("integer"),
            height: nullable("integer"),
            sources: ref("ImageSources"),
          },
        },
      },
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
        get: {
          summary: "The lists, in their order; with archived=true, the archived ones (to restore or delete)",
          parameters: [
            {
              name: "archived",
              in: "query",
              required: false,
              schema: { enum: ["true", "false"] },
            },
          ],
          responses: { 200: json(list("List")) },
        },
        post: {
          summary: "Create a list",
          requestBody: body(listInput),
          responses: { 201: json(ref("List"), "Created") },
        },
      },
      "/lists/{listId}": {
        parameters: [uuidParam("listId")],
        patch: {
          summary: "Edit a list; archived: true hides it from the guests, archived: false restores it",
          requestBody: body(listPatch),
          responses: { 200: json(ref("List")) },
        },
        delete: {
          summary:
            "Delete a list for good, with its items: they leave every screen, event and link, and cannot be restored",
          responses: { 204: noContent, 404: json(ref("Error"), "Unknown or already deleted") },
        },
      },
      "/lists/{listId}/image": {
        parameters: [uuidParam("listId")],
        put: {
          summary:
            "Send the list's own image (JPEG, PNG, WebP, GIF, AVIF or HEIC; 10 MB at most), shown instead of its icon",
          requestBody: {
            required: true,
            content: { "image/*": { schema: { type: "string", format: "binary" } } },
          },
          responses: {
            200: json(ref("List")),
            413: json(ref("Error"), "Over 10 MB"),
            415: json(ref("Error"), "Not an accepted image"),
            503: json(ref("Error"), "Images are off on this server"),
          },
        },
        delete: {
          summary: "Remove the list's own image: its icon shows again",
          responses: {
            200: json(ref("List")),
            404: json(ref("Error"), "No image sent for this list"),
            503: json(ref("Error"), "Images are off on this server"),
          },
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
      "/lists/{listId}/refresh": {
        parameters: [uuidParam("listId")],
        post: {
          summary:
            "Read the links of the list's open items again (title, price, images), spaced site by site. " +
            "What the owner typed or sent is kept",
          responses: {
            200: json(
              { type: "object", properties: { queued: { type: "integer" } } },
              "How many were queued",
            ),
            429: json(ref("Error"), "Asked too often"),
          },
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
          summary: "Edit an item; status archived hides it from the guests, open restores it",
          requestBody: body(itemPatch),
          responses: { 200: json(ref("Item")) },
        },
        delete: {
          summary:
            "Delete an item for good: it leaves its list, its events and every link, its images go, and it cannot be restored",
          responses: { 204: noContent, 404: json(ref("Error"), "Unknown or already deleted") },
        },
      },
      "/items/{itemId}/refresh": {
        parameters: [uuidParam("itemId")],
        post: {
          summary: "Read the item's link again (title, price, images). What the owner typed or sent is kept",
          responses: {
            200: json(ref("Item"), "Queued, enrichment pending"),
            409: json(ref("Error"), "No link"),
            429: json(ref("Error"), "Asked too often"),
          },
        },
      },
      "/items/{itemId}/history": {
        parameters: [uuidParam("itemId")],
        get: { summary: "The history of an item", responses: { 200: json(list("HistoryEntry")) } },
      },
      "/items/{itemId}/images": {
        parameters: [uuidParam("itemId")],
        get: {
          summary: "The images to choose from: the owner's own, then the page's proposals",
          responses: { 200: json(ref("ItemImages")) },
        },
      },
      "/items/{itemId}/image": {
        parameters: [uuidParam("itemId")],
        put: {
          summary: "Send an image (JPEG, PNG, WebP, GIF, AVIF or HEIC; 10 MB at most), shown at once",
          requestBody: {
            required: true,
            content: { "image/*": { schema: { type: "string", format: "binary" } } },
          },
          responses: {
            200: json(ref("Item")),
            413: json(ref("Error"), "Over 10 MB"),
            415: json(ref("Error"), "Not an accepted image"),
            503: json(ref("Error"), "Images are off on this server"),
          },
        },
        patch: {
          summary: "Choose the image shown (or none) and its frame",
          requestBody: body(imagePatch),
          responses: { 200: json(ref("Item")) },
        },
      },
      "/items/{itemId}/image/upload": {
        parameters: [uuidParam("itemId")],
        delete: {
          summary:
            "Remove the image the owner sent: the page's first image is shown instead, and the link is read again",
          responses: {
            200: json(ref("Item")),
            404: json(ref("Error"), "No image sent for this item"),
            503: json(ref("Error"), "Images are off on this server"),
          },
        },
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
