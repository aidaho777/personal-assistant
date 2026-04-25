import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
  }

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'web_document_chunks'
      ) as exists
    `;

    if (!tableCheck[0]?.exists) {
      await sql.end();
      return NextResponse.json({ documents: [] });
    }

    const rows = await sql`
      SELECT
        file_name,
        COUNT(*) as chunk_count,
        MIN(created_at) as uploaded_at
      FROM web_document_chunks
      WHERE web_user_id = ${session.user.id}::uuid
      GROUP BY file_name
      ORDER BY MIN(created_at) DESC
    `;

    await sql.end();

    const documents = rows.map((row) => ({
      fileName: row.file_name as string,
      chunkCount: Number(row.chunk_count),
      uploadedAt: row.uploaded_at as string,
    }));

    return NextResponse.json({ documents });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("RAG documents list error:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileName } = (await req.json()) as { fileName?: string };
  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
  }

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    const result = await sql`
      DELETE FROM web_document_chunks
      WHERE web_user_id = ${session.user.id}::uuid
        AND file_name = ${fileName}
    `;

    await sql.end();

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("RAG document delete error:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
