import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error: ${err}`);
  }

  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
    i += chunkSize - overlap;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  // For plain text files
  if (
    mimeType === "text/plain" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  ) {
    return buffer.toString("utf-8");
  }

  // For PDF files - extract text using basic approach
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    const text = buffer.toString("latin1");
    // Extract readable text from PDF (basic extraction)
    const matches = text.match(/\(([^)]{3,})\)/g) ?? [];
    const extracted = matches
      .map((m) => m.slice(1, -1))
      .filter((s) => /[a-zA-Zа-яА-Я]/.test(s))
      .join(" ");
    if (extracted.length > 50) return extracted;
    // Fallback: return filename as placeholder
    return `Документ: ${fileName}`;
  }

  // For other files - use filename as text
  return `Документ: ${fileName}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webUserId = session.user.id;

  try {
    // Ensure web_document_chunks table exists
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

    // Ensure pgvector extension exists
    await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS vector`));

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Max size is 10MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name;
    const mimeType = file.type;

    // Extract text from file
    const text = await extractTextFromFile(buffer, mimeType, fileName);

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
    }

    // Delete old chunks for this file from this user
    await db.execute(
      sql.raw(
        `DELETE FROM web_document_chunks WHERE web_user_id = '${webUserId}' AND file_name = '${fileName.replace(/'/g, "''")}'`
      )
    );

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No content to index" },
        { status: 400 }
      );
    }

    // Index each chunk
    let indexed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      const embeddingStr = `[${embedding.join(",")}]`;
      const metadataStr = JSON.stringify({
        fileName,
        mimeType,
        position: i,
        totalChunks: chunks.length,
      }).replace(/'/g, "''");

      await db.execute(
        sql.raw(`
        INSERT INTO web_document_chunks (id, web_user_id, file_name, content, embedding, metadata, chunk_index)
        VALUES (
          gen_random_uuid(),
          '${webUserId}',
          '${fileName.replace(/'/g, "''")}',
          '${chunk.replace(/'/g, "''")}',
          '${embeddingStr}'::vector,
          '${metadataStr}'::jsonb,
          ${i}
        )
      `)
      );
      indexed++;
    }

    return NextResponse.json({
      success: true,
      fileName,
      chunks: indexed,
      characters: text.length,
    });
  } catch (error) {
    console.error("RAG upload error:", error);
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("OPENAI_API_KEY is not set")) {
      return NextResponse.json(
        {
          error: "config_missing",
          message:
            "OPENAI_API_KEY не настроен. Добавьте его в переменные окружения Vercel.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Upload failed", message: msg },
      { status: 500 }
    );
  }
}
