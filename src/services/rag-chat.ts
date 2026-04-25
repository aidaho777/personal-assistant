import type { SearchResult } from "./rag-search";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

const SYSTEM_PROMPT = `Ты — персональный ассистент. Отвечай на вопросы используя предоставленный контекст из документов пользователя.
Если ответа нет в контексте — скажи что именно ты искал и предложи переформулировать вопрос.
Указывай источник информации: имя файла и тег.
Отвечай на том же языке, на котором задан вопрос.`;

const NO_RESULTS_PROMPT = `Ты — персональный ассистент. Поиск по документам пользователя не нашёл релевантных фрагментов.
Сообщи пользователю, что документы загружены, но по данному запросу ничего не найдено.
Предложи переформулировать вопрос или использовать другие ключевые слова.
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

  const systemPrompt = chunks.length > 0 ? SYSTEM_PROMPT : NO_RESULTS_PROMPT;
  const userContent = chunks.length > 0
    ? `Контекст из документов:\n\n${buildContext(chunks)}\n\n---\n\nВопрос: ${query}`
    : `Вопрос: ${query}`;

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
      max_tokens: 1024,
    }),
  });

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}
