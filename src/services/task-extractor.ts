import { fetchWithRetry } from "@/lib/fetch-with-retry";

interface TaskExtraction {
  isTask: boolean;
  title?: string;
  description?: string;
  dueDate?: string;
}

export async function extractTask(text: string): Promise<TaskExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { isTask: false };

  const today = new Date().toISOString();

  try {
    const res = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Ты анализируешь сообщения пользователя. Если сообщение похоже на задачу (что-то нужно сделать, купить, позвонить, напомнить и т.д.), верни JSON:
{"isTask": true, "title": "краткая суть задачи (до 60 символов)", "description": "детали если есть", "dueDate": "ISO-дата"}
Если дата не указана явно, но есть слова "завтра", "послезавтра", "в пятницу", "через неделю" — вычисли дату относительно сегодня: ${today}.
Если дата вообще не упомянута — поставь сегодняшнюю дату.
Если это НЕ задача (просто заметка, мысль, цитата) — верни {"isTask": false}.
Отвечай ТОЛЬКО валидным JSON, без markdown.`,
          },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = data.choices[0].message.content.trim();
    const parsed = JSON.parse(raw) as TaskExtraction;
    return parsed;
  } catch (e) {
    console.error("[TaskExtractor] Failed:", e);
    return { isTask: false };
  }
}
