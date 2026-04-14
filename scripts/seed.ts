/**
 * Seed script — adds an admin user to the whitelist.
 * Run: ADMIN_TELEGRAM_ID=123456789 npx tsx scripts/seed.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";

const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME ?? "Admin";

if (!ADMIN_TELEGRAM_ID) {
  console.error("Set ADMIN_TELEGRAM_ID env var");
  process.exit(1);
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema });

  const [user] = await db
    .insert(schema.users)
    .values({
      telegramId: BigInt(ADMIN_TELEGRAM_ID!),
      username: ADMIN_USERNAME,
      firstName: ADMIN_FIRST_NAME,
      role: "admin",
      isActive: true,
    })
    .onConflictDoNothing({ target: schema.users.telegramId })
    .returning();

  if (user) {
    console.log(`✅ Admin user created: ${user.username} (TG ID: ${user.telegramId})`);
  } else {
    console.log("ℹ️ Admin user already exists.");
  }

  await client.end();
}

main();
