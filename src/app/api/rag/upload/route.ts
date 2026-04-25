import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Smaller chunks = fewer tokens per chunk = faster processing
const CHUNK_SIZE = 150; // words per chunk (~600 tokens)
const CHUNK_OVERLAP = 15;
const MAX_CHUNKS = 40; // limit total chunks to stay within 60s timeout

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    const chunk = words.slice(start, end).join(" ");
    if (chunk.trim().length > 10) {
      chunks.push(chunk);
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// Batch embeddings — one API call for all chunks
async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  // Truncate each text to avoid token limit
  const safeTexts = texts.map((t) => t.slice(0, 4000));

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: safeTexts,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error: ${err}`);
  }

  const data = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  // Sort by index to ensure correct order
  const sorted = data.data.sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
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

  // PDF — use pdfjs-dist (works in serverless, no Canvas needed)
  if (lowerName.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "";
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdfDoc = await loadingTask.promise;
      const textParts: string[] = [];
      // Limit to first 30 pages to avoid timeout
      const maxPages = Math.min(pdfDoc.numPages, 30);
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: { str?: string }) => item.str || "")
          .join(" ");
        textParts.push(pageText);
      }
      const text = textParts.join("\n");
      if (text.trim().length > 10) return text;
    } catch (e) {
      console.error("PDF parse error:", e);
    }
    // Fallback: raw text extraction
    return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t\u0400-\u04FF]/g, " ");
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

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS web_document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        web_user_id UUID NOT NULL,
        file_name TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
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

    // Extract text
    const text = await extractTextFromFile(buffer, mimeType, fileName);

    if (!text || text.trim().length < 10) {
      await sql.end();
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
    }

    // Delete old chunks for this file
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

    // Get ALL embeddings in ONE API call (batch)
    const embeddings = await getBatchEmbeddings(chunks);

    // Insert all chunks into DB
    let indexed = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embeddingString = `[${embeddings[i].join(',')}]`;
        await sql`
          INSERT INTO web_document_chunks (id, web_user_id, file_name, content, embedding, chunk_index)
          VALUES (
            gen_random_uuid(),
            ${webUserId}::uuid,
            ${fileName},
            ${chunks[i]},
            ${embeddingString}::vector,
            ${i}
          )
        `;
        indexed++;
      } catch (chunkErr) {
        console.error(`Error inserting chunk ${i}:`, chunkErr);
      }
    }

    await sql.end();

    return NextResponse.json({
      success: true,
      fileName,
      chunks: indexed,
      totalChunks: chunks.length,
      characters: text.length,
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
