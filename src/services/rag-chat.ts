import type { SearchResult } from "./rag-search";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

const SYSTEM_PROMPT = `Ты — персональный ассистент. Отвечай на вопросы используя предоставленный контекст из документов пользователя.
Если ответа нет в контексте — честно скажи об этом.
Указывай источник информации: имя файла и тег.
Отвечай на том же языке, на котором задан вопрос.`;

function buildContext(chunks: SearchResult[]): string {
  return chunks
    .map((c, i) => {
      const meta = c.metadata;
      const source = meta?.fileName ? `[${meta.fileName}${meta.tag ? ` #${meta.tag}` : ""}]` : "";
      return `--- Документ ${i + 1} ${source} (релевантность: ${(c.similarity * 100).toFixed(0)}%) ---\n${c.content}`;
    })
    .join("\n\n");
}

export async function generateAnswer(query: string, chunks: SearchResult[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const context = buildContext(chunks);

  const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Контекст из документов:\n\n${context}\n\n---\n\nВопрос: ${query}`,
        },
      ],
      max_tokens: 1024,
    }),
  });

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}
