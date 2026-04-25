import { NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webUserId = session.user.id;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
  }

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    let webDocuments = 0;
    let webChunks = 0;

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS web_document_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          web_user_id UUID NOT NULL,
          file_name TEXT NOT NULL,
          content TEXT NOT NULL,
          embedding vector(1536),
          metadata JSONB,
          chunk_index INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      const webRows = await sql`
        SELECT
          COUNT(DISTINCT file_name) AS doc_count,
          COUNT(*) AS chunk_count
        FROM web_document_chunks
        WHERE web_user_id = ${webUserId}::uuid
      `;

      webDocuments = parseInt(String(webRows[0]?.doc_count ?? "0"), 10);
      webChunks = parseInt(String(webRows[0]?.chunk_count ?? "0"), 10);
    } catch {
      // Table doesn't exist yet
    }

    let tgDocuments = 0;
    let tgChunks = 0;
    let totalUploads = 0;

    try {
      const webUserRows = await sql`
        SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid
      `;
      const telegramUserId = webUserRows[0]?.telegram_user_id as string | undefined;

      if (telegramUserId) {
        const tgRows = await sql`
          SELECT
            COUNT(DISTINCT upload_id) AS doc_count,
            COUNT(*) AS chunk_count
          FROM document_chunks
          WHERE user_id = ${telegramUserId}::uuid
        `;
        tgDocuments = parseInt(String(tgRows[0]?.doc_count ?? "0"), 10);
        tgChunks = parseInt(String(tgRows[0]?.chunk_count ?? "0"), 10);

        const uploadsRows = await sql`
          SELECT COUNT(*) AS cnt
          FROM uploads
          WHERE user_id = ${telegramUserId}::uuid
            AND content_type IN ('document', 'text', 'voice')
            AND status = 'success'
        `;
        totalUploads = parseInt(String(uploadsRows[0]?.cnt ?? "0"), 10);
      }
    } catch {
      // No telegram link
    }

    await sql.end();

    return NextResponse.json({
      indexedDocuments: webDocuments + tgDocuments,
      totalChunks: webChunks + tgChunks,
      totalUploads,
      webDocuments,
      webChunks,
    });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("RAG stats error:", error);
    return NextResponse.json({
      indexedDocuments: 0,
      totalChunks: 0,
      totalUploads: 0,
      webDocuments: 0,
      webChunks: 0,
    });
  }
}
