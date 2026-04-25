import OpenAI from "openai";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
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

function splitIntoChunks(text: string, maxTokens = 500, overlapTokens = 100): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  const step = maxTokens - overlapTokens;

  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + maxTokens).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
    if (i + maxTokens >= words.length) break;
  }

  return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
}

async function extractText(buffer: Buffer, fileName: string, contentType: string): Promise<string | null> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (contentType === "voice" || ext === "ogg" || ext === "oga") return null;
  if (contentType === "photo" || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return null;

  if (ext === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text || "";
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (["txt", "csv", "md", "json", "xml", "html", "log"].includes(ext)) {
    return buffer.toString("utf-8");
  }

  return buffer.toString("utf-8");
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

  if (!text || text.trim().length < 10) return { chunksCreated: 0 };

  const chunks = splitIntoChunks(text);
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
        fileName: upload.fileName,
        tag: upload.tag,
        driveUrl: upload.driveUrl ?? undefined,
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

  const filteredUploads = userId
    ? allUploads
    : allUploads;

  let indexed = 0;
  const errors: string[] = [];

  for (const u of filteredUploads) {
    try {
      const result = await indexDocument(u.id);
      if (result.chunksCreated > 0) indexed++;
    } catch (err) {
      errors.push(`${u.id}: ${String(err)}`);
    }
  }

  return { indexed, errors };
}
