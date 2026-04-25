import OpenAI from "openai";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import { extractTextFromPdfWithOCR, isTextGarbage } from "./pdf-ocr";
import mammoth from "mammoth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { downloadFileFromDrive } from "@/services/google-drive";

const { uploads, documentChunks } = schema;

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key, maxRetries: 3 });
}

const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 50;

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text: string): string[] {
  const cleaned = cleanText(text);

  if (cleaned.length < 1000) {
    return cleaned.trim().length > 10 ? [cleaned.trim()] : [];
  }

  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length <= CHUNK_SIZE) {
    return cleaned.trim() ? [cleaned.trim()] : [];
  }

  const chunks: string[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;

  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    if (i + CHUNK_SIZE >= words.length) break;
  }

  return chunks.length > 0 ? chunks : [cleaned.trim()].filter(Boolean);
}

async function extractText(buffer: Buffer, fileName: string, contentType: string): Promise<string | null> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (contentType === "voice" || ext === "ogg" || ext === "oga") return null;
  if (contentType === "photo" || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return null;

  let text: string | null = null;

  if (ext === "pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractPdfText(pdf, { mergePages: true });
      text = result.text || "";
      if (isTextGarbage(text)) {
        console.log("[Indexer] PDF text is garbage, using OCR for", fileName);
        text = await extractTextFromPdfWithOCR(buffer);
      }
    } catch (e) {
      console.error("[Indexer] PDF parse failed, using OCR:", e);
      text = await extractTextFromPdfWithOCR(buffer);
    }
  } else if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (["txt", "csv", "md", "json", "xml", "html", "log"].includes(ext)) {
    text = buffer.toString("utf-8");
  } else {
    text = buffer.toString("utf-8");
  }

  if (text) {
    text = cleanText(text);
    console.log("[Indexer] Extracted text preview:", text.substring(0, 500));

    if (text.length < 20) {
      console.warn("[Indexer] WARNING: Extracted text too short:", text.length, "chars from", fileName);
    }

    const printableRatio = text.replace(/[^\x20-\x7E\n\r\tА-яЁё]/g, "").length / text.length;
    if (printableRatio < 0.7) {
      console.warn("[Indexer] WARNING: Low printable ratio:", (printableRatio * 100).toFixed(0) + "% for", fileName, "— may need OCR");
    }
  }

  return text;
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

export async function indexDocument(uploadId: string): Promise<{ chunksCreated: number }> {
  const [upload] = await db
    .select()
    .from(uploads)
    .where(eq(uploads.id, uploadId))
    .limit(1);

  if (!upload) throw new Error(`Upload ${uploadId} not found`);
  if (!upload.driveFileId) throw new Error(`Upload ${uploadId} has no driveFileId`);

  await db.delete(documentChunks).where(eq(documentChunks.uploadId, uploadId));

  const buffer = await downloadFileFromDrive(upload.driveFileId);
  const text = await extractText(buffer, upload.fileName, upload.contentType);

  if (!text || text.trim().length < 10) {
    console.warn("[Indexer] No usable text from", upload.fileName);
    return { chunksCreated: 0 };
  }

  const chunks = splitIntoChunks(text);
  console.log("[Indexer] File:", upload.fileName, "→", chunks.length, "chunks");

  const BATCH_SIZE = 20;
  let totalCreated = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await getEmbeddings(batch);

    const rows = batch.map((content, j) => ({
      uploadId: upload.id,
      userId: upload.userId,
      content,
      embedding: embeddings[j],
      metadata: {
        fileName: upload.originalName ?? upload.fileName,
        tag: upload.tag,
        driveUrl: upload.driveUrl ?? undefined,
        chunkIndex: i + j,
      },
      chunkIndex: i + j,
    }));

    await db.insert(documentChunks).values(rows);
    totalCreated += rows.length;
  }

  return { chunksCreated: totalCreated };
}

export async function indexAllDocuments(userId?: string): Promise<{ indexed: number; errors: string[] }> {
  const conditions = [eq(uploads.status, "success" as string)];
  if (userId) conditions.push(eq(uploads.userId, userId));

  const allUploads = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(conditions.length === 1 ? conditions[0] : undefined);

  let indexed = 0;
  const errors: string[] = [];

  for (const u of allUploads) {
    try {
      const result = await indexDocument(u.id);
      if (result.chunksCreated > 0) indexed++;
    } catch (err) {
      errors.push(`${u.id}: ${String(err)}`);
    }
  }

  return { indexed, errors };
}
