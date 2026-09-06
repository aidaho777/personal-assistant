/**
 * LLM-роутер входящих сообщений (текст и расшифровка голоса).
 * Один вызов gpt-4o-mini с tool-calling: create_tasks | save_note.
 *
 * Даты НЕ вычисляются здесь — due_string уходит в Todoist сырой русской
 * фразой («завтра в 10», «каждый понедельник»), Todoist парсит сам.
 */
import OpenAI from "openai";

export interface RoutedTask {
  title: string;
  due_string?: string;
  priority?: 1 | 2 | 3 | 4;
  project_hint?: string;
}

export type RouteResult =
  | { kind: "tasks"; tasks: RoutedTask[] }
  | { kind: "note" };

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_tasks",
      description:
        "Создать одну или несколько задач в Todoist. Вызывай только если в сообщении есть конкретное действие, которое пользователь собирается выполнить. Одно сообщение может содержать несколько задач.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description:
                    "Короткая формулировка задачи в инфинитиве, без даты, вежливых слов и вводных: «купить молоко», «отправить отчёт Иванову».",
                },
                due_string: {
                  type: "string",
                  description:
                    "Срок СЫРОЙ русской фразой ровно так, как сказал пользователь: «завтра в 10», «в пятницу вечером», «каждый понедельник», «через час». НЕ преобразовывать в ISO. Пропустить, если срока нет.",
                },
                priority: {
                  type: "integer",
                  enum: [1, 2, 3, 4],
                  description: "4 = срочно, 3 = высокий, 2 = средний, 1 = обычный. Указывать только если пользователь явно обозначил срочность.",
                },
                project_hint: {
                  type: "string",
                  description: "Название проекта, если пользователь явно его назвал («в проект Ремонт»).",
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_note",
      description:
        "Сообщение не содержит задач: это мысль, наблюдение, впечатление, идея без действия, цитата, ссылка или вопрос. Сохранить как заметку.",
      parameters: { type: "object", properties: {} },
    },
  },
];

function systemPrompt(tz: string): string {
  const today = new Date().toLocaleDateString("ru-RU", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Ты — роутер входящих сообщений личного ассистента. Сообщение пришло из Telegram: текст или расшифровка голосового. Реши, содержит ли оно задачи (вызови create_tasks) или это заметка (вызови save_note). Всегда вызывай ровно один инструмент.

Сегодня: ${today}. Часовой пояс пользователя: ${tz}.

Задача — конкретное действие, которое пользователь собирается выполнить: позвонить, купить, отправить, сделать, записаться, оплатить, проверить, напомнить о чём-то. Одно сообщение может содержать несколько задач — верни каждую отдельным элементом массива.

НЕ задача: мысли, наблюдения, впечатления, идеи без действия, цитаты, ссылки, вопросы. Слово «нужно» само по себе не делает сообщение задачей: «нужно было видеть этот закат» — заметка.

due_string: передавай срок сырой русской фразой ровно так, как его сказал пользователь («завтра в 10», «в пятницу вечером», «каждый понедельник», «через час»). Не переводи в ISO и не вычисляй дату — это делает Todoist. Если срока нет — не указывай поле.

title: коротко, инфинитив, без даты, вежливых слов и вводных («прошу», «добрый день», «поставь задачу»).
priority: 4 только при явном «срочно»/«важно»; иначе не указывай.`;
}

export async function routeMessage(text: string): Promise<RouteResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const tz = process.env.TIMEZONE ?? "Europe/Oslo";

  const openai = new OpenAI({ apiKey, maxRetries: 3 });
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    tools: TOOLS,
    tool_choice: "required",
    messages: [
      { role: "system", content: systemPrompt(tz) },
      { role: "user", content: text },
    ],
  });

  const calls = res.choices[0]?.message?.tool_calls ?? [];
  const tasks: RoutedTask[] = [];

  for (const c of calls) {
    if (c.type !== "function" || c.function.name !== "create_tasks") continue;
    let args: { tasks?: unknown };
    try {
      args = JSON.parse(c.function.arguments || "{}");
    } catch {
      continue;
    }
    for (const raw of Array.isArray(args.tasks) ? args.tasks : []) {
      const t = raw as Partial<RoutedTask>;
      const title = typeof t.title === "string" ? t.title.trim() : "";
      if (!title) continue;
      const p = Math.round(Number(t.priority));
      tasks.push({
        title,
        due_string: typeof t.due_string === "string" && t.due_string.trim() ? t.due_string.trim() : undefined,
        priority: p >= 1 && p <= 4 ? (p as 1 | 2 | 3 | 4) : undefined,
        project_hint: typeof t.project_hint === "string" && t.project_hint.trim() ? t.project_hint.trim() : undefined,
      });
    }
  }

  if (tasks.length > 0) return { kind: "tasks", tasks };
  if (calls.some((c) => c.type === "function" && c.function.name === "save_note")) return { kind: "note" };
  throw new Error("router: model returned no tool call");
}
