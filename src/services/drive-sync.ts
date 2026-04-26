import postgres from "postgres";
import { google } from "googleapis";
import { extractText, getDocumentProxy } from "unpdf";
import { extractTextFromPdfWithOCR, isTextGarbage } from "./pdf-ocr";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

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

async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      if (text && text.trim().length > 10 && !isTextGarbage(text)) return text;
    } catch { /* fall through */ }
    return await extractTextFromPdfWithOCR(buffer);
  }

  if (ext === "docx" || ext === "doc") {
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
  const res = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts.map((t) => t.slice(0, 4000)) }),
  });
  const data = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
  total: number;
  details: string[];
}

async function downloadWithToken(fileId: string, accessToken: string): Promise<Buffer> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function syncDriveDocuments(webUserId: string, accessToken: string): Promise<SyncResult> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });
  const result: SyncResult = { synced: 0, skipped: 0, errors: 0, total: 0, details: [] };

  try {
    // Get ALL successful document/text uploads — no user filter (single-user MVP)
    const uploads = await sql`
      SELECT id, user_id, file_name, original_name, drive_file_id, drive_url, tag, content_type
      FROM uploads
      WHERE status = 'success'
        AND content_type IN ('document', 'text')
        AND drive_file_id IS NOT NULL
      ORDER BY created_at DESC
    `;

    result.total = uploads.length;
    console.log("[DriveSync] Found", uploads.length, "uploads in DB");

    if (uploads.length === 0) {
      result.details.push("No uploads found in DB with status=success and content_type in (document, text)");
      await sql.end();
      return result;
    }

    for (const upload of uploads) {
      const fileName = (upload.original_name ?? upload.file_name) as string;
      const driveFileId = upload.drive_file_id as string;

      try {
        // Skip if already indexed for this web user
        const existing = await sql`
          SELECT COUNT(*)::int as cnt FROM web_document_chunks
          WHERE web_user_id = ${webUserId}::uuid
            AND file_name = ${fileName}
        `;
        if (parseInt(String(existing[0]?.cnt ?? "0"), 10) > 0) {
          console.log("[DriveSync] Already indexed:", fileName);
          result.skipped++;
          continue;
        }

        console.log("[DriveSync] Downloading:", fileName, "driveFileId:", driveFileId);
        let buffer: Buffer;
        try {
          buffer = await downloadWithToken(driveFileId, accessToken);
        } catch (dlErr) {
          console.error("[DriveSync] Download failed:", fileName, dlErr);
          result.details.push(`${fileName}: download failed — ${String(dlErr)}`);
          result.errors++;
          continue;
        }

        if (!buffer || buffer.length === 0) {
          result.details.push(`${fileName}: empty download`);
          result.errors++;
          continue;
        }

        console.log("[DriveSync] Downloaded", buffer.length, "bytes, extracting text...");
        const text = await extractTextFromBuffer(buffer, fileName);

        if (!text || text.trim().length < 10) {
          result.details.push(`${fileName}: no text extracted`);
          result.errors++;
          continue;
        }

        console.log("[DriveSync] Text length:", text.length, "preview:", text.substring(0, 100));

        const chunks = chunkText(text);
        if (chunks.length === 0) {
          result.errors++;
          continue;
        }

        const embeddings = await getBatchEmbeddings(chunks);

        for (let i = 0; i < chunks.length; i++) {
          const embeddingString = `[${embeddings[i].join(",")}]`;
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
        }

        result.synced++;
        result.details.push(`${fileName}: ${chunks.length} chunks`);
        console.log("[DriveSync] ✅ Synced:", fileName, "→", chunks.length, "chunks");
      } catch (e) {
        console.error("[DriveSync] ❌ Error with", fileName, e);
        result.details.push(`${fileName}: ${String(e)}`);
        result.errors++;
      }
    }

    await sql.end();
    console.log("[DriveSync] Done. synced=%d skipped=%d errors=%d total=%d", result.synced, result.skipped, result.errors, result.total);
    return result;
  } catch (error) {
    await sql.end().catch(() => {});
    throw error;
  }
}
