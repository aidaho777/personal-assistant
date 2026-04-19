import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { eq, gte, sql, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

const { uploads } = schema;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Number(new URL(req.url).searchParams.get("days") ?? 30), 90);
  const since = new Date(Date.now() - (days - 1) * 86400_000);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', created_at)::date::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(uploads)
    .where(and(eq(uploads.status, "success"), gte(uploads.createdAt, since)))
    .groupBy(sql`date_trunc('day', created_at)`)
    .orderBy(sql`date_trunc('day', created_at)`);

  // Fill missing days with 0
  const map = new Map(rows.map(r => [r.date, r.count]));
  const chart: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    chart.push({ date: key, count: map.get(key) ?? 0 });
  }

  return NextResponse.json({ chart });
}
