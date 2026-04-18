import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ─── Lazy initialization ────────────────────────────────────────────────
// We use a lazy getter pattern so the DB client is only created at runtime
// (when DATABASE_URL is available), not at Next.js build time.

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
  drizzleClient: DbClient | undefined;
};

function getDb(): DbClient {
  if (globalForDb.drizzleClient) return globalForDb.drizzleClient;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const client = globalForDb.pgClient ?? postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pgClient = client;
  }

  const instance = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.drizzleClient = instance;
  }

  return instance;
}

// Proxy object: accessing `db` triggers lazy init only at runtime
export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export { schema };
