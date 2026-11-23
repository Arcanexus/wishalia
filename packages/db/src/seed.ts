/**
 * Demo data for local development and screenshots: one owner, two guests, two lists, a Christmas
 * event with a pool, a quantity item, a unique item and a book series. Never run in production.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema.js";

export interface SeedResult {
  ownerId: string;
  christmasId: string;
}

export async function seedDemo(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
  { christmasDate = "2026-12-25" } = {},
): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const [owner, grandma, cousin] = await tx
      .insert(schema.users)
      .values([
        { displayName: "Alex", email: "alex@example.com" },
        { displayName: "Mamie", email: "mamie@example.com" },
        { displayName: "Léo", email: null },
      ])
      .returning({ id: schema.users.id });
    if (!owner || !grandma || !cousin) {
      throw new Error("seed: users not created");
    }

    const [books, home] = await tx
      .insert(schema.wishLists)
      .values([
        { ownerId: owner.id, name: "Livres", position: 0 },
        { ownerId: owner.id, name: "Maison", position: 1 },
      ])
      .returning({ id: schema.wishLists.id });
    if (!books || !home) {
      throw new Error("seed: lists not created");
    }

    const [saga] = await tx
      .insert(schema.series)
      .values({ ownerId: owner.id, name: "La Passe-Miroir", totalVolumes: 4 })
      .returning({ id: schema.series.id });
    if (!saga) {
      throw new Error("seed: series not created");
    }

    const wishes = await tx
      .insert(schema.wishes)
      .values([
        { listId: home.id, kind: "pool", title: "Machine à café", priceCents: 34900, targetCents: 34900 },
        { listId: home.id, kind: "quantity", title: "Verres à vin", priceCents: 900, quantity: 6 },
        { listId: home.id, kind: "unique", title: "Plaid en laine", priceCents: 5900 },
        { listId: home.id, kind: "unique", repeatable: true, title: "Bon pour un restaurant" },
        ...[1, 2, 3, 4].map((number) => ({
          listId: books.id,
          kind: "unique" as const,
          title: `La Passe-Miroir, tome ${number}`,
          seriesId: saga.id,
          seriesNumber: number,
          seriesState: number <= 2 ? ("owned" as const) : ("wanted" as const),
          position: number,
        })),
      ])
      .returning({ id: schema.wishes.id, title: schema.wishes.title });
    const byTitle = (title: string) => {
      const wish = wishes.find((candidate) => candidate.title === title);
      if (!wish) {
        throw new Error(`seed: wish ${title} not created`);
      }
      return wish.id;
    };

    const [christmas] = await tx
      .insert(schema.events)
      .values({ ownerId: owner.id, name: "Noël", kind: "christmas", date: christmasDate })
      .returning({ id: schema.events.id });
    if (!christmas) {
      throw new Error("seed: event not created");
    }

    const coffee = byTitle("Machine à café");
    const glasses = byTitle("Verres à vin");
    await tx.insert(schema.eventWishes).values(
      [coffee, glasses, byTitle("Plaid en laine"), byTitle("La Passe-Miroir, tome 3")].map(
        (wishId, position) => ({
          eventId: christmas.id,
          wishId,
          position,
        }),
      ),
    );

    await tx.insert(schema.contributions).values([
      { wishId: coffee, eventId: christmas.id, contributorId: grandma.id, amountCents: 15000 },
      { wishId: coffee, eventId: christmas.id, guestName: "Léo", amountCents: 5000, anonymous: true },
      { wishId: glasses, eventId: christmas.id, contributorId: grandma.id, units: 2 },
    ]);

    await tx.insert(schema.itemEvents).values([
      ...wishes.map((wish) => ({
        wishId: wish.id,
        type: "created",
        actorId: owner.id,
        visibility: "owner" as const,
      })),
      {
        wishId: coffee,
        type: "contribution_added",
        actorId: grandma.id,
        visibility: "sealed" as const,
        payload: { amountCents: 15000 },
      },
      {
        wishId: coffee,
        type: "contribution_added",
        visibility: "sealed" as const,
        payload: { amountCents: 5000 },
      },
      {
        wishId: glasses,
        type: "reserved",
        actorId: grandma.id,
        visibility: "sealed" as const,
        payload: { units: 2 },
      },
    ]);

    return { ownerId: owner.id, christmasId: christmas.id };
  });
}
