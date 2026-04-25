import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Max ~1500 tokens per chunk (safe for text-embedding-3-small which supports 8192)
const CHUNK_SIZE = 200; // words per chunk
const CHUNK_OVERLAP = 20; // words overlap between chunks

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    const chunk = words.slice(start, end).join(" ");
    if (chunk.trim().length > 10) {
      chunks.push(chunk);
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  // Truncate text to avoid token limit (max ~6000 chars for safety)
  const safeText = text.slice(0, 6000);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: safeText }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error: ${err}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  // Plain text formats
  if (
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".rtf") ||
    lowerName.endsWith(".json")
  ) {
    return buffer.toString("utf-8");
  }

  // PDF
  if (lowerName.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      if (result.text && result.text.trim().length > 10) return result.text;
    } catch (e) {
      console.error("PDF parse error:", e);
    }
    return buffer.toString("utf-8");
  }

  // DOCX / DOC
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim().length > 10) return result.value;
    } catch (e) {
      console.error("DOCX parse error:", e);
    }
    return buffer.toString("utf-8");
  }

  // Fallback
  return buffer.toString("utf-8");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webUserId = session.user.id; // UUID string
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "config_missing",
        message: "OPENAI_API_KEY не настроен. Добавьте его в переменные окружения Vercel.",
      },
      { status: 200 }
    );
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });
  }

  // Use postgres.js directly for reliable parameterized queries
  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    // Create table if not exists — store embedding as TEXT (JSON array string)
    // This avoids PostgreSQL protocol issues with vector type casting
    await sql`
      CREATE TABLE IF NOT EXISTS web_document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        web_user_id UUID NOT NULL,
        file_name TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        chunk_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_web_doc_chunks_user 
      ON web_document_chunks(web_user_id)
    `;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      await sql.end();
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 30 * 1024 * 1024; // 30MB
    if (file.size > maxSize) {
      await sql.end();
      return NextResponse.json(
        { error: "File too large. Max size is 30MB." },
        { status: 400 }
      );
    }

    // Supported formats
    const supportedExtensions = [
      ".txt", ".md", ".csv", ".json",
      ".pdf",
      ".docx", ".doc",
      ".rtf",
    ];
    const lowerName = file.name.toLowerCase();
    const isSupported = supportedExtensions.some((ext) => lowerName.endsWith(ext));
    if (!isSupported) {
      await sql.end();
      return NextResponse.json(
        { error: `Unsupported file format. Supported: ${supportedExtensions.join(", ")}` },
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
      await sql.end();
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
    }

    // Delete old chunks for this file from this user
    await sql`
      DELETE FROM web_document_chunks
      WHERE web_user_id = ${webUserId}::uuid
        AND file_name = ${fileName}
    `;

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      await sql.end();
      return NextResponse.json({ error: "No content to index" }, { status: 400 });
    }

    // Index each chunk with embedding stored as TEXT (JSON string)
    let indexed = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const embedding = await getEmbedding(chunk);
        // Store as JSON string — TEXT column, no vector protocol issues
        const embeddingText = JSON.stringify(embedding);

        await sql`
          INSERT INTO web_document_chunks (id, web_user_id, file_name, content, embedding, chunk_index)
          VALUES (
            gen_random_uuid(),
            ${webUserId}::uuid,
            ${fileName},
            ${chunk},
            ${embeddingText},
            ${i}
          )
        `;
        indexed++;
      } catch (chunkErr) {
        const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
        errors.push(`Chunk ${i}: ${msg}`);
        console.error(`Error indexing chunk ${i}:`, chunkErr);
      }

      // Rate limit protection: pause after each batch
      if ((i + 1) % BATCH_SIZE === 0 && i + 1 < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    await sql.end();

    return NextResponse.json({
      success: true,
      fileName,
      chunks: indexed,
      totalChunks: chunks.length,
      characters: text.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("RAG upload error:", error);
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("OPENAI_API_KEY is not set")) {
      return NextResponse.json(
        {
          error: "config_missing",
          message: "OPENAI_API_KEY не настроен. Добавьте его в переменные окружения Vercel.",
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
