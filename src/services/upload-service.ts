import { db, schema } from "../db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import type { NewUpload } from "../db/schema";

const { uploads } = schema;

/**
 * Insert a new upload record.
 */
export async function createUploadRecord(data: NewUpload) {
  const [record] = await db.insert(uploads).values(data).returning();
  return record;
}

/**
 * Update an existing upload record (e.g. after Drive upload completes).
 */
export async function updateUploadRecord(
  id: string,
  data: Partial<Pick<NewUpload, "driveFileId" | "driveFolderId" | "driveUrl" | "status" | "errorMessage" | "fileMd5" | "transcription">>
) {
  const [record] = await db
    .update(uploads)
    .set(data)
    .where(eq(uploads.id, id))
    .returning();
  return record;
}

/**
 * Check if a file with the same MD5 hash was already uploaded by this user.
 */
export async function findDuplicateByMd5(userId: string, md5: string) {
  const [dup] = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        eq(uploads.fileMd5, md5),
        eq(uploads.status, "success")
      )
    )
    .limit(1);
  return dup ?? null;
}

/**
 * Get user stats: total files, files today, top-3 tags.
 */
export async function getUserStats(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploads)
    .where(and(eq(uploads.userId, userId), eq(uploads.status, "success")));

  const [todayResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        eq(uploads.status, "success"),
        gte(uploads.createdAt, today)
      )
    );

  const topTags = await db
    .select({
      tag: uploads.tag,
      count: sql<number>`count(*)::int`,
    })
    .from(uploads)
    .where(and(eq(uploads.userId, userId), eq(uploads.status, "success")))
    .groupBy(uploads.tag)
    .orderBy(sql`count(*) desc`)
    .limit(3);

  return {
    total: totalResult?.count ?? 0,
    today: todayResult?.count ?? 0,
    topTags,
  };
}

/**
 * Get the last N uploads, optionally filtered by tag.
 */
export async function getRecentUploads(userId: string, limit: number = 5, tag?: string) {
  const conditions = [eq(uploads.userId, userId), eq(uploads.status, "success")];
  if (tag) {
    conditions.push(eq(uploads.tag, tag));
  }

  return db
    .select()
    .from(uploads)
    .where(and(...conditions))
    .orderBy(desc(uploads.createdAt))
    .limit(limit);
}
