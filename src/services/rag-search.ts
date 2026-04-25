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
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 6000) }),
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

function mergeResults(vectorRows: SearchResult[], keywordRows: SearchResult[], limit: number): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const row of vectorRows) {
    const key = row.content.slice(0, 200);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(row);
    }
  }

  for (const row of keywordRows) {
    const key = row.content.slice(0, 200);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(row);
    }
  }

  merged.sort((a, b) => b.similarity - a.similarity);
  return merged.slice(0, limit);
}

export async function searchDocuments(
  query: string,
  userId: string,
  limit = 10
): Promise<SearchResult[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];

  const sql = postgres(dbUrl, { max: 3, idle_timeout: 20, connect_timeout: 10 });

  try {
    let vectorResults: SearchResult[] = [];
    try {
      const queryEmbedding = await getEmbedding(query);
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

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
      vectorResults = rows as unknown as SearchResult[];
      console.log("[RAG Search] Vector results:", vectorResults.length);
    } catch (e) {
      console.error("[RAG Search] Vector search failed:", e);
    }

    let keywordResults: SearchResult[] = [];
    const keywords = query.split(/\s+/).filter((w) => w.length > 2);
    if (keywords.length > 0) {
      try {
        const pattern = keywords.map((k) => `%${k}%`);
        const conditions = pattern.map((p) => sql`content ILIKE ${p}`);
        const whereClause = conditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);

        const rows = await sql`
          SELECT content, metadata, 0.5::float as similarity
          FROM document_chunks
          WHERE user_id = ${userId}::uuid
            AND (${whereClause})
          LIMIT ${limit}
        `;
        keywordResults = rows as unknown as SearchResult[];
        console.log("[RAG Search] Keyword results:", keywordResults.length);
      } catch (e) {
        console.error("[RAG Search] Keyword search failed:", e);
      }
    }

    const combined = mergeResults(vectorResults, keywordResults, limit);
    console.log("[RAG Search] Query:", query.slice(0, 100));
    console.log("[RAG Search] User ID:", userId);
    console.log("[RAG Search] Combined results:", combined.length);
    if (combined.length > 0) {
      console.log("[RAG Search] Top similarity:", combined[0].similarity);
      console.log("[RAG Search] Top preview:", combined[0].content?.substring(0, 100));
    }

    return combined;
  } finally {
    await sql.end().catch(() => {});
  }
}
