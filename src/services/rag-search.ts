import postgres from "postgres";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });

  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

export interface SearchResult {
  content: string;
  similarity: number;
  metadata: {
    fileName?: string;
    tag?: string;
    driveUrl?: string;
    [key: string]: unknown;
  } | null;
}

export async function searchDocuments(
  query: string,
  userId: string,
  limit = 5
): Promise<SearchResult[]> {
  const queryEmbedding = await getEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    const rows = await sql`
      SELECT
        content,
        metadata,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM document_chunks
      WHERE user_id = ${userId}::uuid
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
    return rows as SearchResult[];
  } finally {
    await sql.end().catch(() => {});
  }
}
