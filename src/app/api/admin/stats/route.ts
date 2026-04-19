import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql, gte, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const { uploads, users } = schema;

function checkAdminToken(request: Request): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const adminToken = process.env.DASHBOARD_SECRET_TOKEN;
  if (!adminToken) return false;
  return token === adminToken;
}

export async function GET(request: Request) {
  if (!checkAdminToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Total uploads by status
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads);

    const [successResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(eq(uploads.status, "success"));

    const [errorResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(eq(uploads.status, "error"));

    // Uploads by content type
    const byType = await db
      .select({
        contentType: uploads.contentType,
        count: sql<number>`count(*)::int`,
      })
      .from(uploads)
      .where(eq(uploads.status, "success"))
      .groupBy(uploads.contentType);

    // Unique users
    const [usersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.isActive, true));

    // Time-based counts
    const [todayResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(
        and(eq(uploads.status, "success"), gte(uploads.createdAt, todayStart))
      );

    const [weekResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(
        and(eq(uploads.status, "success"), gte(uploads.createdAt, weekStart))
      );

    const [monthResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(
        and(eq(uploads.status, "success"), gte(uploads.createdAt, monthStart))
      );

    // Top tags
    const topTags = await db
      .select({
        tag: uploads.tag,
        count: sql<number>`count(*)::int`,
      })
      .from(uploads)
      .where(eq(uploads.status, "success"))
      .groupBy(uploads.tag)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // Recent uploads with user info
    const recentUploads = await db
      .select({
        id: uploads.id,
        fileName: uploads.fileName,
        originalName: uploads.originalName,
        contentType: uploads.contentType,
        fileSize: uploads.fileSize,
        tag: uploads.tag,
        driveUrl: uploads.driveUrl,
        status: uploads.status,
        transcription: uploads.transcription,
        createdAt: uploads.createdAt,
        username: users.username,
        firstName: users.firstName,
      })
      .from(uploads)
      .leftJoin(users, eq(uploads.userId, users.id))
      .orderBy(desc(uploads.createdAt))
      .limit(20);

    // Build type map
    const typeMap: Record<string, number> = {
      document: 0,
      photo: 0,
      voice: 0,
      text: 0,
    };
    for (const row of byType) {
      typeMap[row.contentType] = row.count;
    }

    return NextResponse.json({
      totals: {
        all: totalResult?.count ?? 0,
        success: successResult?.count ?? 0,
        error: errorResult?.count ?? 0,
      },
      byType: typeMap,
      users: usersResult?.count ?? 0,
      timeSeries: {
        today: todayResult?.count ?? 0,
        week: weekResult?.count ?? 0,
        month: monthResult?.count ?? 0,
      },
      topTags,
      recentUploads: recentUploads.map((u) => ({
        ...u,
        createdAt: u.createdAt?.toISOString(),
        fileSize: u.fileSize ?? null,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/stats] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}
