import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import postgres from "postgres";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 6000) }),
  });
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function generateAnswer(
  question: string,
  chunks: { content: string; fileName?: string }[],
  hasDocuments: boolean
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const context = chunks
    .map((c, i) => {
      const source = c.fileName ? ` [${c.fileName}]` : "";
      return `[${i + 1}]${source}\n${c.content}`;
    })
    .join("\n\n---\n\n");

  let systemPrompt: string;
  if (chunks.length > 0) {
    systemPrompt = `Ты — умный ассистент. Отвечай на вопросы пользователя, опираясь на предоставленные фрагменты документов. Если ответа нет в документах — скажи об этом честно. Отвечай на русском языке.`;
  } else if (hasDocuments) {
    systemPrompt = `Ты — умный ассистент. Документы пользователя загружены, но по данному запросу не найдены релевантные фрагменты. Предложи пользователю переформулировать вопрос или использовать другие ключевые слова. Отвечай на русском языке.`;
  } else {
    systemPrompt = `Ты — умный ассистент. Документы пользователя ещё не загружены. Сообщи пользователю, что нужно загрузить документы через кнопку "📎 Загрузить документ" на странице AI Chat. Отвечай на русском языке.`;
  }

  const userContent =
    chunks.length > 0
      ? `Контекст из документов:\n\n${context}\n\n---\n\nВопрос: ${question}`
      : `Вопрос: ${question}`;
  const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
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
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content;
}

export async function POST(req: NextRequest) {
  try {
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
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'web_document_chunks'
        ) as exists
      `;
      const tableExists = tableCheck[0]?.exists;

      let topChunks: { content: string; fileName?: string }[] = [];
      let hasDocuments = false;
      let searchMethod = "none";

      if (tableExists) {
        const countRows = await sql`
          SELECT COUNT(*) as cnt FROM web_document_chunks
          WHERE web_user_id = ${webUserId}::uuid
        `;
        const chunkCount = parseInt(String(countRows[0]?.cnt ?? "0"), 10);
        hasDocuments = chunkCount > 0;
        console.log("[RAG Chat] web_user_id:", webUserId, "web chunks:", chunkCount);

        if (chunkCount > 0) {
          // Vector search
          try {
            const queryEmbedding = await getEmbedding(message);
            const embeddingString = `[${queryEmbedding.join(",")}]`;

            const rows = await sql`
              SELECT content, file_name
              FROM web_document_chunks
              WHERE web_user_id = ${webUserId}::uuid
                AND embedding IS NOT NULL
              ORDER BY embedding <=> ${embeddingString}::vector
              LIMIT 5
            `;

            topChunks = rows.map((row) => ({
              content: row.content as string,
              fileName: row.file_name as string,
            }));
            searchMethod = "vector";
            console.log("[RAG Chat] Vector results:", topChunks.length);
          } catch (e) {
            console.error("[RAG Chat] Vector search error:", e);
          }

          // Keyword fallback if vector returned nothing
          if (topChunks.length === 0) {
            try {
              const keywords = message.split(/\s+/).filter((w) => w.length > 2);
              if (keywords.length > 0) {
                const patterns = keywords.map((k) => `%${k}%`);
                const conditions = patterns.map((p) => sql`content ILIKE ${p}`);
                const whereClause = conditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);

                const rows = await sql`
                  SELECT content, file_name
                  FROM web_document_chunks
                  WHERE web_user_id = ${webUserId}::uuid
                    AND (${whereClause})
                  LIMIT 5
                `;

                topChunks = rows.map((row) => ({
                  content: row.content as string,
                  fileName: row.file_name as string,
                }));
                searchMethod = "keyword";
                console.log("[RAG Chat] Keyword results:", topChunks.length);
              }
            } catch (e) {
              console.error("[RAG Chat] Keyword search error:", e);
            }
          }
        }
      }

      // Fallback to Telegram document_chunks
      if (topChunks.length === 0 && !hasDocuments) {
        try {
          const webUserRows = await sql`
            SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid
          `;
          const telegramUserId = webUserRows[0]?.telegram_user_id as string | undefined;

          if (telegramUserId) {
            hasDocuments = true;
            const queryEmbedding = await getEmbedding(message);
            const embeddingString = `[${queryEmbedding.join(",")}]`;

            const tgRows = await sql`
              SELECT dc.content, u.original_name AS file_name
              FROM document_chunks dc
              LEFT JOIN uploads u ON u.id = dc.upload_id
              WHERE dc.user_id = ${telegramUserId}::uuid
                AND dc.embedding IS NOT NULL
              ORDER BY dc.embedding <=> ${embeddingString}::vector
              LIMIT 5
            `;

            topChunks = tgRows.map((row) => ({
              content: row.content as string,
              fileName: (row.file_name as string) ?? "Telegram",
            }));
            searchMethod = "telegram_vector";
            console.log("[RAG Chat] Telegram results:", topChunks.length);
          }
        } catch (e) {
          console.error("[RAG Chat] Telegram search error:", e);
        }
      }

      await sql.end();

      console.log("[RAG Chat] Final: method=%s, chunks=%d, hasDocuments=%s", searchMethod, topChunks.length, hasDocuments);

      const sourceFiles = [...new Set(topChunks.map((c) => c.fileName).filter(Boolean))];

      const answer = await generateAnswer(message, topChunks, hasDocuments);
      return NextResponse.json({
        answer,
        sources: topChunks.length,
        sourceFiles,
        searchMethod,
        hasDocuments,
      });
    } catch (innerError) {
      await sql.end().catch(() => {});
      throw innerError;
    }
  } catch (error) {
    console.error("RAG chat error:", error);
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
      { error: "Chat failed", message: msg },
      { status: 500 }
    );
  }
}
