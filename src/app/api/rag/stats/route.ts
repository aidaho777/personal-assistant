import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Count indexed documents (uploads that have chunks) for this web user
    const indexedResult = await db.execute(sql.raw(`
      SELECT COUNT(DISTINCT dc.upload_id) as count
      FROM document_chunks dc
      JOIN uploads u ON dc.upload_id = u.id
      JOIN web_users wu ON wu.telegram_user_id = u.user_id
      WHERE wu.id = '${session.user.id}'
    `));

    // Count total chunks
    const chunksResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as count
      FROM document_chunks dc
      JOIN uploads u ON dc.upload_id = u.id
      JOIN web_users wu ON wu.telegram_user_id = u.user_id
      WHERE wu.id = '${session.user.id}'
    `));

    // Count total uploads for this web user
    const uploadsResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as count
      FROM uploads u
      JOIN web_users wu ON wu.telegram_user_id = u.user_id
      WHERE wu.id = '${session.user.id}'
    `));

    const indexedDocuments = Number((indexedResult.rows?.[0] as { count?: string })?.count ?? 0);
    const totalChunks = Number((chunksResult.rows?.[0] as { count?: string })?.count ?? 0);
    const totalUploads = Number((uploadsResult.rows?.[0] as { count?: string })?.count ?? 0);

    return NextResponse.json({ indexedDocuments, totalChunks, totalUploads });
  } catch (error) {
    console.error("RAG stats error:", error);
    // Return zeros if table doesn't exist yet
    return NextResponse.json({ indexedDocuments: 0, totalChunks: 0, totalUploads: 0 });
  }
}
