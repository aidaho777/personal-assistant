import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { SearchResult } from "./rag-search";

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

export function generateAnswer(query: string, chunks: SearchResult[]) {
  const context = buildContext(chunks);

  return streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Контекст из документов:\n\n${context}\n\n---\n\nВопрос: ${query}`,
      },
    ],
    maxOutputTokens: 1024,
  });
}
