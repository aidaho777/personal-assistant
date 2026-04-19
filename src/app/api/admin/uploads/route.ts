import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, sql, gte, lte, and, desc, ilike } from "drizzle-orm";

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
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const filterType = url.searchParams.get("type"); // document | photo | voice | text
    const filterTag = url.searchParams.get("tag");
    const filterStatus = url.searchParams.get("status"); // success | error | pending
    const filterFrom = url.searchParams.get("from"); // ISO date string
    const filterTo = url.searchParams.get("to"); // ISO date string
    const filterSearch = url.searchParams.get("search"); // search in fileName

    // Build conditions
    const conditions = [];
    if (filterType) conditions.push(eq(uploads.contentType, filterType));
    if (filterTag) conditions.push(eq(uploads.tag, filterTag));
    if (filterStatus) conditions.push(eq(uploads.status, filterStatus));
    if (filterFrom) conditions.push(gte(uploads.createdAt, new Date(filterFrom)));
    if (filterTo) conditions.push(lte(uploads.createdAt, new Date(filterTo)));
    if (filterSearch) conditions.push(ilike(uploads.fileName, `%${filterSearch}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total matching records
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(whereClause);

    const total = countResult?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch paginated records with user info
    const rows = await db
      .select({
        id: uploads.id,
        fileName: uploads.fileName,
        originalName: uploads.originalName,
        contentType: uploads.contentType,
        fileSize: uploads.fileSize,
        tag: uploads.tag,
        driveUrl: uploads.driveUrl,
        driveFileId: uploads.driveFileId,
        status: uploads.status,
        errorMessage: uploads.errorMessage,
        transcription: uploads.transcription,
        createdAt: uploads.createdAt,
        username: users.username,
        firstName: users.firstName,
      })
      .from(uploads)
      .leftJoin(users, eq(uploads.userId, users.id))
      .where(whereClause)
      .orderBy(desc(uploads.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString(),
        fileSize: r.fileSize ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error("[admin/uploads] Error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}
