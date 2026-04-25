import { NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";
import { extractText, getDocumentProxy } from "unpdf";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { extractTextFromPdfWithOCR, isTextGarbage } from "@/services/pdf-ocr";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHUNK_SIZE = 150;
const CHUNK_OVERLAP = 15;

function chunkText(text: string): string[] {
  if (text.length < 1000) {
    return text.trim().length > 10 ? [text.trim()] : [];
  }
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length && chunks.length < 40) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    const chunk = words.slice(start, end).join(" ");
    if (chunk.trim().length > 10) chunks.push(chunk);
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function extractTextFromFile(buffer: Buffer, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      if (text && text.trim().length > 10 && !isTextGarbage(text)) {
        return text;
      }
    } catch { /* fall through to OCR */ }
    return await extractTextFromPdfWithOCR(buffer);
  }

  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      if (result.value?.trim().length > 10) return result.value;
    } catch { /* ignore */ }
  }

  return buffer.toString("utf-8");
}

async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const safeTexts = texts.map((t) => t.slice(0, 4000));
  const res = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: safeTexts }),
  });
  const data = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webUserId = session.user.id;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 500 });

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    const files = await sql`
      SELECT DISTINCT file_name FROM web_document_chunks
      WHERE web_user_id = ${webUserId}::uuid
    `;

    if (files.length === 0) {
      await sql.end();
      return NextResponse.json({ reindexed: 0, message: "No documents to reindex" });
    }

    let reindexed = 0;
    const errors: string[] = [];

    for (const file of files) {
      const fileName = file.file_name as string;

      try {
        const chunks = await sql`
          SELECT content FROM web_document_chunks
          WHERE web_user_id = ${webUserId}::uuid AND file_name = ${fileName}
          ORDER BY chunk_index ASC
        `;
        const originalText = chunks.map((c) => c.content).join(" ");

        let textToIndex = originalText;
        if (isTextGarbage(originalText) && fileName.toLowerCase().endsWith(".pdf")) {
          console.log("[Reindex] Garbage detected in", fileName, "— need original PDF buffer for OCR");
          errors.push(`${fileName}: OCR requires re-upload (original PDF not stored)`);
          continue;
        }

        await sql`
          DELETE FROM web_document_chunks
          WHERE web_user_id = ${webUserId}::uuid AND file_name = ${fileName}
        `;

        const newChunks = chunkText(textToIndex);
        if (newChunks.length === 0) continue;

        const embeddings = await getBatchEmbeddings(newChunks);

        for (let i = 0; i < newChunks.length; i++) {
          const embeddingString = `[${embeddings[i].join(",")}]`;
          await sql`
            INSERT INTO web_document_chunks (id, web_user_id, file_name, content, embedding, chunk_index)
            VALUES (gen_random_uuid(), ${webUserId}::uuid, ${fileName}, ${newChunks[i]}, ${embeddingString}::vector, ${i})
          `;
        }

        console.log("[Reindex]", fileName, "→", newChunks.length, "chunks");
        reindexed++;
      } catch (e) {
        console.error("[Reindex] Error with", fileName, e);
        errors.push(`${fileName}: ${String(e)}`);
      }
    }

    await sql.end();
    return NextResponse.json({ reindexed, total: files.length, errors });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("[Reindex] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
