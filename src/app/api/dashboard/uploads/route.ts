import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const { uploads } = schema;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 10), 100);
  const tag = searchParams.get("tag");

  const conditions = [eq(uploads.status, "success")];
  if (tag) conditions.push(eq(uploads.tag, tag));

  const rows = await db
    .select({
      id: uploads.id,
      fileName: uploads.fileName,
      tag: uploads.tag,
      contentType: uploads.contentType,
      fileSize: uploads.fileSize,
      driveUrl: uploads.driveUrl,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(and(...conditions))
    .orderBy(desc(uploads.createdAt))
    .limit(limit);

  return NextResponse.json({ uploads: rows });
}
