import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Max ~1500 tokens per chunk (safe for text-embedding-3-small which supports 8192)
// 300 words ≈ 400-600 tokens for English, ~600-900 for Russian
const CHUNK_SIZE_WORDS = 300;
const CHUNK_OVERLAP_WORDS = 30;

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  // Truncate text to ~6000 chars to stay safely under 8192 tokens
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

function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE_WORDS,
  overlap = CHUNK_OVERLAP_WORDS
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim().length > 20) {
      chunks.push(chunk);
    }
    i += chunkSize - overlap;
  }
  return chunks;
}

async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lowerName = fileName.toLowerCase();

  // Plain text, markdown, CSV
  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "text/csv" ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json")
  ) {
    return buffer.toString("utf-8");
  }

  // DOCX files using mammoth
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim().length > 10) {
        return result.value;
      }
    } catch (e) {
      console.error("mammoth error:", e);
    }
    return `Документ: ${fileName}`;
  }

  // DOC files (old Word format) - basic extraction
  if (mimeType === "application/msword" || lowerName.endsWith(".doc")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim().length > 10) {
        return result.value;
      }
    } catch (e) {
      console.error("mammoth doc error:", e);
    }
    return `Документ: ${fileName}`;
  }

  // PDF files using pdf-parse
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      if (data.text && data.text.trim().length > 10) {
        return data.text;
      }
    } catch (e) {
      console.error("pdf-parse error:", e);
      // Fallback: basic text extraction from PDF binary
      const text = buffer.toString("latin1");
      const matches = text.match(/\(([^)]{3,})\)/g) ?? [];
      const extracted = matches
        .map((m) => m.slice(1, -1))
        .filter((s) => /[a-zA-Zа-яА-Я]/.test(s))
        .join(" ");
      if (extracted.length > 50) return extracted;
    }
    return `Документ: ${fileName}`;
  }

  // RTF files - basic text extraction
  if (mimeType === "application/rtf" || lowerName.endsWith(".rtf")) {
    const text = buffer.toString("utf-8");
    // Strip RTF control words
    const stripped = text
      .replace(/\\[a-z]+\d*\s?/g, " ")
      .replace(/[{}\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped.length > 20) return stripped;
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
    // Ensure pgvector extension exists
    await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS vector`));

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 30 * 1024 * 1024; // 30MB
    if (file.size > maxSize) {
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
    const isSupported = supportedExtensions.some((ext) =>
      lowerName.endsWith(ext)
    );
    if (!isSupported) {
      return NextResponse.json(
        {
          error: `Unsupported file format. Supported: ${supportedExtensions.join(", ")}`,
        },
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

    // Index each chunk with embedding
    let indexed = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
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
      } catch (chunkErr) {
        const msg =
          chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
        errors.push(`Chunk ${i}: ${msg}`);
        console.error(`Error indexing chunk ${i}:`, chunkErr);
      }
    }

    return NextResponse.json({
      success: true,
      fileName,
      chunks: indexed,
      totalChunks: chunks.length,
      characters: text.length,
      errors: errors.length > 0 ? errors : undefined,
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
