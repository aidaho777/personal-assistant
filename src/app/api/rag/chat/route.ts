import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

async function generateAnswer(
  question: string,
  chunks: { content: string; fileName?: string }[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const context = chunks
    .map((c, i) => {
      const source = c.fileName ? ` [${c.fileName}]` : "";
      return `[${i + 1}]${source}\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt =
    chunks.length > 0
      ? `Ты — умный ассистент. Отвечай на вопросы пользователя, опираясь на предоставленные фрагменты документов. Если ответа нет в документах — скажи об этом честно. Отвечай на русском языке.`
      : `Ты — умный ассистент. Документы пользователя ещё не загружены или не найдены релевантные фрагменты. Сообщи пользователю, что нужно загрузить документы через кнопку "📎 Загрузить документ" на странице AI Chat. Отвечай на русском языке.`;

  const userContent =
    chunks.length > 0
      ? `Контекст из документов:\n\n${context}\n\n---\n\nВопрос: ${question}`
      : `Вопрос: ${question}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat error: ${err}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webUserId = session.user.id;
  const { message } = (await req.json()) as { message?: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "config_missing",
        message:
          "OPENAI_API_KEY не настроен. Добавьте его в переменные окружения Vercel.",
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
    const embedding = await getEmbedding(message);
    // Format as PostgreSQL vector literal: '{0.1,0.2,...}'
    const embeddingLiteral = `{${embedding.join(",")}}`;

    const allChunks: { content: string; fileName?: string }[] = [];

    // 1. Search web_document_chunks (uploaded via web UI)
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      await sql`
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
      `;

      const webRows = await sql`
        SELECT content, file_name,
               1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
        FROM web_document_chunks
        WHERE web_user_id = ${webUserId}::uuid
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}::vector
        LIMIT 5
      `;

      for (const row of webRows) {
        if ((row.similarity ?? 0) > 0.2) {
          allChunks.push({ content: row.content as string, fileName: row.file_name as string });
        }
      }
    } catch (e) {
      console.error("web_document_chunks search error:", e);
    }

    // 2. Search document_chunks from Telegram uploads (if linked)
    try {
      const webUserRows = await sql`
        SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid
      `;
      const telegramUserId = webUserRows[0]?.telegram_user_id as string | undefined;

      if (telegramUserId) {
        const tgRows = await sql`
          SELECT dc.content, u.original_name AS file_name,
                 1 - (dc.embedding <=> ${embeddingLiteral}::vector) AS similarity
          FROM document_chunks dc
          LEFT JOIN uploads u ON u.id = dc.upload_id
          WHERE dc.user_id = ${telegramUserId}::bigint
            AND dc.embedding IS NOT NULL
          ORDER BY dc.embedding <=> ${embeddingLiteral}::vector
          LIMIT 5
        `;

        for (const row of tgRows) {
          if ((row.similarity ?? 0) > 0.2) {
            allChunks.push({
              content: row.content as string,
              fileName: (row.file_name as string) ?? "Telegram",
            });
          }
        }
      }
    } catch (e) {
      console.error("Telegram document_chunks search error:", e);
    }

    await sql.end();

    const topChunks = allChunks.slice(0, 5);
    const answer = await generateAnswer(message, topChunks);
    return NextResponse.json({ answer, sources: topChunks.length });
  } catch (error) {
    await sql.end().catch(() => {});
    console.error("RAG chat error:", error);
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
      { error: "Chat failed", message: msg },
      { status: 500 }
    );
  }
}
