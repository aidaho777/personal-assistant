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

  const webUserId = session.user.id;

  try {
    // Count web-uploaded document chunks
    let webDocuments = 0;
    let webChunks = 0;

    try {
      await db.execute(sql.raw(`
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
      `));

      const webResult: any = await db.execute(sql.raw(`
        SELECT
          COUNT(DISTINCT file_name) AS doc_count,
          COUNT(*) AS chunk_count
        FROM web_document_chunks
        WHERE web_user_id = '${webUserId}'
      `));

      const webRows = Array.isArray(webResult)
        ? webResult
        : (webResult.rows ?? []);
      webDocuments = parseInt(String(webRows[0]?.doc_count ?? "0"), 10);
      webChunks = parseInt(String(webRows[0]?.chunk_count ?? "0"), 10);
    } catch {
      // Table doesn't exist yet
    }

    // Count Telegram-linked document chunks
    let tgDocuments = 0;
    let tgChunks = 0;
    let totalUploads = 0;

    try {
      const webUserResult: any = await db.execute(
        sql.raw(
          `SELECT telegram_user_id FROM web_users WHERE id = '${webUserId}'`
        )
      );
      const webUserRows = Array.isArray(webUserResult)
        ? webUserResult
        : (webUserResult.rows ?? []);
      const telegramUserId = webUserRows[0]?.telegram_user_id as
        | string
        | undefined;

      if (telegramUserId) {
        const tgResult: any = await db.execute(sql.raw(`
          SELECT
            COUNT(DISTINCT upload_id) AS doc_count,
            COUNT(*) AS chunk_count
          FROM document_chunks
          WHERE user_id = '${telegramUserId}'
        `));
        const tgRows = Array.isArray(tgResult)
          ? tgResult
          : (tgResult.rows ?? []);
        tgDocuments = parseInt(String(tgRows[0]?.doc_count ?? "0"), 10);
        tgChunks = parseInt(String(tgRows[0]?.chunk_count ?? "0"), 10);

        const uploadsResult: any = await db.execute(sql.raw(`
          SELECT COUNT(*) AS cnt
          FROM uploads
          WHERE user_id = '${telegramUserId}'
            AND content_type IN ('document', 'text', 'voice')
            AND status = 'success'
        `));
        const uploadsRows = Array.isArray(uploadsResult)
          ? uploadsResult
          : (uploadsResult.rows ?? []);
        totalUploads = parseInt(String(uploadsRows[0]?.cnt ?? "0"), 10);
      }
    } catch {
      // No telegram link
    }

    return NextResponse.json({
      indexedDocuments: webDocuments + tgDocuments,
      totalChunks: webChunks + tgChunks,
      totalUploads,
      webDocuments,
      webChunks,
    });
  } catch (error) {
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
