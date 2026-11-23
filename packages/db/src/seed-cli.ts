import { createDb } from "./client.js";
import { seedDemo } from "./seed.js";

// pnpm --filter @wishalia/db db:seed, against DATABASE_URL (local development only)
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo data in production");
}
const { db, close } = createDb({ url: process.env.DATABASE_URL ?? "" });
try {
  const { ownerId } = await seedDemo(db);
  process.stdout.write(`Demo data created, owner ${ownerId}\n`);
} finally {
  await close();
}
