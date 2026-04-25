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
    const result: Record<string, unknown> = {
      currentUserId: webUserId,
    };

    // Web document chunks
    try {
      const webCount = await sql`
        SELECT
          COUNT(DISTINCT file_name) AS doc_count,
          COUNT(*) AS chunk_count
        FROM web_document_chunks
        WHERE web_user_id = ${webUserId}::uuid
      `;
      result.webDocuments = parseInt(String(webCount[0]?.doc_count ?? "0"), 10);
      result.webChunks = parseInt(String(webCount[0]?.chunk_count ?? "0"), 10);

      const webSample = await sql`
        SELECT file_name, LEFT(content, 200) as content_preview, chunk_index,
               embedding IS NOT NULL as has_embedding
        FROM web_document_chunks
        WHERE web_user_id = ${webUserId}::uuid
        ORDER BY created_at DESC
        LIMIT 3
      `;
      result.webSampleChunks = webSample;

      const webUserIds = await sql`
        SELECT DISTINCT web_user_id::text FROM web_document_chunks LIMIT 20
      `;
      result.allWebUserIds = webUserIds.map((r) => r.web_user_id);
    } catch (e) {
      result.webError = String(e);
    }

    // Telegram document chunks
    try {
      const webUserRow = await sql`
        SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid
      `;
      const telegramUserId = webUserRow[0]?.telegram_user_id as string | undefined;
      result.telegramUserId = telegramUserId ?? null;

      if (telegramUserId) {
        const tgCount = await sql`
          SELECT
            COUNT(DISTINCT upload_id) AS doc_count,
            COUNT(*) AS chunk_count
          FROM document_chunks
          WHERE user_id = ${telegramUserId}::uuid
        `;
        result.tgDocuments = parseInt(String(tgCount[0]?.doc_count ?? "0"), 10);
        result.tgChunks = parseInt(String(tgCount[0]?.chunk_count ?? "0"), 10);

        const tgSample = await sql`
          SELECT LEFT(content, 200) as content_preview, chunk_index,
                 embedding IS NOT NULL as has_embedding, metadata
          FROM document_chunks
          WHERE user_id = ${telegramUserId}::uuid
          ORDER BY created_at DESC
          LIMIT 3
        `;
        result.tgSampleChunks = tgSample;
      }

      const tgUserIds = await sql`
        SELECT DISTINCT user_id::text FROM document_chunks LIMIT 20
      `;
      result.allTgUserIds = tgUserIds.map((r) => r.user_id);
    } catch (e) {
      result.tgError = String(e);
    }

    await sql.end();
    return NextResponse.json(result);
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("RAG debug error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
