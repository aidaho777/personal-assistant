import OpenAI from "openai";

interface TaskExtractionResult {
  isTask: boolean;
  title: string | null;
  dueDate: string | null;
}

export async function extractTask(text: string): Promise<TaskExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { isTask: false, title: null, dueDate: null };

  const openai = new OpenAI({ apiKey, maxRetries: 3 });
  const today = new Date().toISOString();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Ты — классификатор сообщений. Определи, содержит ли сообщение задачу, которую пользователь должен выполнить.

Задачей считается ЛЮБОЕ сообщение, где:
- Есть действие, которое нужно совершить (позвонить, купить, сдать, отправить, написать, сделать, подготовить, оплатить, забрать, встретиться, записаться, проверить, починить, убрать, заказать...)
- Есть слова-маркеры обязательства: "нужно", "надо", "должен", "не забыть", "напомни", "планирую", "хочу", "собираюсь"
- Есть упоминание дедлайна или времени: "завтра", "сегодня", "в пятницу", "до конца недели", "вечером", "утром", "через час", "на следующей неделе", "до 15 числа"
- Есть контекст обязательства перед кем-то: "сдать работу", "отправить отчёт", "ответить клиенту"

НЕ задачей считается:
- Абстрактная мысль или наблюдение ("красивый закат сегодня")
- Идея без конкретного действия ("было бы круто сделать приложение")
- Цитата, ссылка, пересланное сообщение без контекста действия
- Вопрос без обязательства ("как дела?")

Правила для даты:
- Сегодняшняя дата и время: ${today}
- "завтра" = текущая дата + 1 день
- "послезавтра" = текущая дата + 2 дня
- "в пятницу" = ближайшая пятница (если сегодня пятница — следующая)
- "вечером" = 20:00, "утром" = 09:00, "днём" = 14:00
- "на следующей неделе" = понедельник следующей недели
- Если дата не указана и не подразумевается — dueDate: null

Верни строго JSON: {"isTask": boolean, "title": string | null, "dueDate": string | null}
Где dueDate — ISO-8601 формат или null.`,
        },
        { role: "user", content: text },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { isTask: false, title: null, dueDate: null };
    return JSON.parse(content) as TaskExtractionResult;
  } catch (e) {
    console.error("[TaskExtractor] Failed:", e);
    return { isTask: false, title: null, dueDate: null };
  }
}
