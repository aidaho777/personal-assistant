import OpenAI from "openai";
import { db } from "@/db";
import { sql } from "drizzle-orm";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
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
  const openai = getOpenAI();

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embRes.data[0].embedding;
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(sql`
    SELECT
      content,
      metadata,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM document_chunks
    WHERE user_id = ${userId}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `);

  return results as unknown as SearchResult[];
}
