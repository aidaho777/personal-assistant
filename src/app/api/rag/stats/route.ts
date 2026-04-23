import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const { documentChunks, uploads } = schema;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [chunksRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentChunks)
      .where(eq(documentChunks.userId, session.user.id));

    const [docsRow] = await db
      .select({ count: sql<number>`count(distinct upload_id)::int` })
      .from(documentChunks)
      .where(eq(documentChunks.userId, session.user.id));

    const [totalUploads] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(uploads)
      .where(eq(uploads.status, "success"));

    return NextResponse.json({
      indexedDocuments: docsRow?.count ?? 0,
      totalChunks: chunksRow?.count ?? 0,
      totalUploads: totalUploads?.count ?? 0,
    });
  } catch (error) {
    console.error("RAG stats error:", error);
    return NextResponse.json({ indexedDocuments: 0, totalChunks: 0, totalUploads: 0 });
  }
}
