import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

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

  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function searchDocuments(
  query: string,
  webUserId: string,
  limit = 5
): Promise<{ content: string; metadata: Record<string, unknown> | null }[]> {
  try {
    const embedding = await getEmbedding(query);
    const embeddingStr = `[${embedding.join(",")}]`;

    // Use raw SQL to avoid Drizzle ORM type issues with pgvector
    const results = await db.execute(sql.raw(`
      SELECT dc.content, dc.metadata
      FROM document_chunks dc
      JOIN uploads u ON dc.upload_id = u.id
      JOIN web_users wu ON wu.telegram_user_id = u.user_id
      WHERE wu.id = '${webUserId}'
      ORDER BY dc.embedding <=> '${embeddingStr}'::vector
      LIMIT ${limit}
    `));

    return (results.rows ?? []) as { content: string; metadata: Record<string, unknown> | null }[];
  } catch {
    // Fallback: full-text search if pgvector not available
    const results = await db.execute(sql.raw(`
      SELECT dc.content, dc.metadata
      FROM document_chunks dc
      JOIN uploads u ON dc.upload_id = u.id
      JOIN web_users wu ON wu.telegram_user_id = u.user_id
      WHERE wu.id = '${webUserId}'
        AND dc.content ILIKE '%${query.replace(/'/g, "''")}%'
      LIMIT ${limit}
    `));
    return (results.rows ?? []) as { content: string; metadata: Record<string, unknown> | null }[];
  }
}

async function generateAnswer(question: string, chunks: { content: string; metadata: Record<string, unknown> | null }[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const context = chunks
    .map((c, i) => {
      const meta = c.metadata as { fileName?: string; tag?: string } | null;
      const source = meta?.fileName ? ` [${meta.fileName}]` : "";
      return `[${i + 1}]${source}\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = chunks.length > 0
    ? `Ты — умный ассистент. Отвечай на вопросы пользователя, опираясь на предоставленные фрагменты документов. Если ответа нет в документах — скажи об этом честно. Отвечай на русском языке.`
    : `Ты — умный ассистент. Отвечай на вопросы пользователя. Если вопрос касается документов — сообщи, что документы ещё не проиндексированы. Отвечай на русском языке.`;

  const userContent = chunks.length > 0
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

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message } = await req.json() as { message?: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  try {
    const chunks = await searchDocuments(message, session.user.id, 5);
    const answer = await generateAnswer(message, chunks);
    return NextResponse.json({ answer, sources: chunks.length });
  } catch (error) {
    console.error("RAG chat error:", error);
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("OPENAI_API_KEY is not set")) {
      return NextResponse.json(
        { error: "config_missing", message: "OPENAI_API_KEY не настроен. Добавьте его в переменные окружения Vercel." },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Chat failed", message: msg }, { status: 500 });
  }
}
