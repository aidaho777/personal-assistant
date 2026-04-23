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

  const data = await res.json() as { data: { embedding: number[] }[] };
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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { uploadId?: string; all?: boolean };

  try {
    // Get the telegram user linked to this web user
    const webUserResult: any = await db.execute(sql.raw(`
      SELECT telegram_user_id FROM web_users WHERE id = '${session.user.id}'
    `));
    const webUserRows = Array.isArray(webUserResult) ? webUserResult : (webUserResult.rows ?? []);
    const telegramUserId = webUserRows[0]?.telegram_user_id as string | undefined;

    if (!telegramUserId) {
      return NextResponse.json(
        { error: "no_telegram_link", message: "Ваш аккаунт не связан с Telegram-пользователем. Документы индексируются из файлов, загруженных через Telegram-бота." },
        { status: 200 }
      );
    }

    // Get uploads to index
    let uploadsQuery: string;
    if (body.uploadId) {
      uploadsQuery = `
        SELECT id, file_name, original_name, tag, transcription
        FROM uploads
        WHERE id = '${body.uploadId}' AND user_id = '${telegramUserId}'
          AND content_type IN ('document', 'text', 'voice')
          AND status = 'success'
      `;
    } else {
      uploadsQuery = `
        SELECT id, file_name, original_name, tag, transcription
        FROM uploads
        WHERE user_id = '${telegramUserId}'
          AND content_type IN ('document', 'text', 'voice')
          AND status = 'success'
          AND id NOT IN (SELECT DISTINCT upload_id FROM document_chunks WHERE user_id = '${telegramUserId}')
        LIMIT 20
      `;
    }

    const uploadsResult: any = await db.execute(sql.raw(uploadsQuery));
    const uploadsRows = Array.isArray(uploadsResult) ? uploadsResult : (uploadsResult.rows ?? []);
    const uploads = uploadsRows as {
      id: string;
      file_name: string;
      original_name?: string;
      tag?: string;
      transcription?: string;
    }[];

    if (uploads.length === 0) {
      return NextResponse.json({ indexed: 0, message: "Нет новых документов для индексации" });
    }

    let indexed = 0;

    for (const upload of uploads) {
      try {
        // Use transcription for voice, or file_name as placeholder text for documents
        const text = upload.transcription ?? `Документ: ${upload.original_name ?? upload.file_name}`;
        const chunks = chunkText(text);

        // Delete old chunks for this upload
        await db.execute(sql.raw(`DELETE FROM document_chunks WHERE upload_id = '${upload.id}'`));

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await getEmbedding(chunk);
          const embeddingStr = `[${embedding.join(",")}]`;
          const metadataStr = JSON.stringify({
            fileName: upload.original_name ?? upload.file_name,
            tag: upload.tag ?? "Inbox",
            position: i,
          }).replace(/'/g, "''");

          await db.execute(sql.raw(`
            INSERT INTO document_chunks (id, upload_id, user_id, content, embedding, metadata, chunk_index)
            VALUES (
              gen_random_uuid(),
              '${upload.id}',
              '${telegramUserId}',
              '${chunk.replace(/'/g, "''")}',
              '${embeddingStr}'::vector,
              '${metadataStr}'::jsonb,
              ${i}
            )
          `));
        }

        indexed++;
      } catch (err) {
        console.error(`Failed to index upload ${upload.id}:`, err);
      }
    }

    return NextResponse.json({ indexed, total: uploads.length });
  } catch (error) {
    console.error("RAG index error:", error);
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("OPENAI_API_KEY is not set")) {
      return NextResponse.json(
        { error: "config_missing", message: "OPENAI_API_KEY не настроен. Добавьте его в переменные окружения Vercel." },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Indexing failed", message: msg }, { status: 500 });
  }
}
