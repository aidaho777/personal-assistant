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
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 6000) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error: ${err}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

// Cosine similarity between two vectors (computed in JS)
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const webUserId = session.user.id; // UUID string
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
      // Check if web_document_chunks table exists
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'web_document_chunks'
        ) as exists
      `;
      const tableExists = tableCheck[0]?.exists;

      let topChunks: { content: string; fileName?: string }[] = [];

      if (tableExists) {
        // Fetch all chunks for this user (embedding stored as TEXT/JSON)
        const rows = await sql`
          SELECT content, file_name, embedding
          FROM web_document_chunks
          WHERE web_user_id = ${webUserId}::uuid
          ORDER BY created_at DESC
          LIMIT 500
        `;

        if (rows.length > 0) {
          // Get query embedding
          const queryEmbedding = await getEmbedding(message);

          // Compute cosine similarity in JavaScript
          const scored = rows
            .map((row) => {
              let similarity = 0;
              if (row.embedding) {
                try {
                  const emb = JSON.parse(row.embedding as string) as number[];
                  similarity = cosineSimilarity(queryEmbedding, emb);
                } catch {
                  similarity = 0;
                }
              }
              return {
                content: row.content as string,
                fileName: row.file_name as string,
                similarity,
              };
            })
            .filter((r) => r.similarity > 0.3)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5);

          topChunks = scored;
        }
      }

      // If no web chunks found, try to answer without context
      if (topChunks.length === 0) {
        // Also try Telegram document_chunks if user has linked telegram account
        try {
          const webUserRows = await sql`
            SELECT telegram_user_id FROM web_users WHERE id = ${webUserId}::uuid
          `;
          const telegramUserId = webUserRows[0]?.telegram_user_id as string | undefined;

          if (telegramUserId) {
            // Get query embedding for telegram search
            const queryEmbedding = await getEmbedding(message);
            const embeddingLiteral = `{${queryEmbedding.join(",")}}`;

            const tgRows = await sql`
              SELECT dc.content, u.original_name AS file_name
              FROM document_chunks dc
              LEFT JOIN uploads u ON u.id = dc.upload_id
              WHERE dc.user_id = ${telegramUserId}::bigint
                AND dc.embedding IS NOT NULL
              ORDER BY dc.embedding <=> ${embeddingLiteral}::vector
              LIMIT 5
            `;

            topChunks = tgRows.map((row) => ({
              content: row.content as string,
              fileName: (row.file_name as string) ?? "Telegram",
            }));
          }
        } catch (e) {
          // pgvector might not be available or telegram not linked — ignore
          console.error("Telegram chunks search error:", e);
        }
      }

      await sql.end();

      const answer = await generateAnswer(message, topChunks);
      return NextResponse.json({ answer, sources: topChunks.length });
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
