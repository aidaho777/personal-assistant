import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";

const { users } = schema;

/**
 * Look up an authorized user by their Telegram ID.
 * Returns null if user is not in the whitelist or is deactivated.
 */
export async function getAuthorizedUser(telegramId: bigint) {
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.telegramId, telegramId),
        eq(users.isActive, true)
      )
    )
    .limit(1);

  return user ?? null;
}

/**
 * Check if the database is reachable.
 */
export async function checkDbConnection(): Promise<boolean> {
  try {
    await db.select({ id: users.id }).from(users).limit(1);
    return true;
  } catch {
    return false;
  }
}
