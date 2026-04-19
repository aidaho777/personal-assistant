import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { eq, gte, sql, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const { uploads } = schema;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 6 * 86400_000);

  const [total, today, week, volumeRow, tags] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` })
      .from(uploads).where(eq(uploads.status, "success"))
      .then(r => r[0]?.count ?? 0),

    db.select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(and(eq(uploads.status, "success"), gte(uploads.createdAt, todayStart)))
      .then(r => r[0]?.count ?? 0),

    db.select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(and(eq(uploads.status, "success"), gte(uploads.createdAt, weekStart)))
      .then(r => r[0]?.count ?? 0),

    db.select({ total: sql<number>`coalesce(sum(file_size)::bigint, 0)` })
      .from(uploads).where(eq(uploads.status, "success"))
      .then(r => r[0]?.total ?? 0),

    db.select({ tag: uploads.tag, count: sql<number>`count(*)::int` })
      .from(uploads).where(eq(uploads.status, "success"))
      .groupBy(uploads.tag)
      .orderBy(sql`count(*) desc`)
      .limit(5),
  ]);

  return NextResponse.json({ total, today, week, totalBytes: volumeRow, tags });
}
