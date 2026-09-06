/**
 * Todoist API v1 client.
 * Заменяет собой таблицу `tasks`, deadline-checker и веб-канбан.
 *
 * ENV: TODOIST_API_TOKEN (Settings → Integrations → Developer)
 */

const API = "https://api.todoist.com/api/v1";

function token(): string {
  const t = process.env.TODOIST_API_TOKEN;
  if (!t) throw new Error("TODOIST_API_TOKEN is not set");
  return t;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    }

    // 429 / 5xx — экспоненциальный backoff
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      continue;
    }

    throw new Error(`Todoist API ${res.status}: ${await res.text()}`);
  }
  throw new Error("todoist: unreachable");
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface TodoistTask {
  id: string;
  content: string;
  description?: string | null;
  project_id: string;
  priority: number; // 1 = обычный … 4 = p1 (срочный)
  is_completed?: boolean;
  labels?: string[];
  due?: {
    date: string;        // YYYY-MM-DD или ISO с временем
    string: string;      // как пользователь это сказал
    is_recurring: boolean;
    datetime?: string;
  } | null;
}

export interface CreateTaskInput {
  /** Заголовок задачи. */
  content: string;
  /** Контекст: исходная фраза, ссылка на Drive, расшифровка голосового. */
  description?: string;
  /**
   * Дата на естественном языке: "завтра в 10", "в пятницу вечером",
   * "каждый понедельник". Todoist парсит сам — свой парсер не нужен.
   */
  dueString?: string;
  /** 1 = низкий, 2 = средний, 3 = высокий, 4 = срочный. */
  priority?: 1 | 2 | 3 | 4;
  projectId?: string;
  labels?: string[];
}

// ─── Actions ────────────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput): Promise<TodoistTask> {
  return call<TodoistTask>("/tasks", {
    method: "POST",
    body: JSON.stringify({
      content: input.content,
      description: input.description,
      // due_lang обязателен для русских формулировок, иначе Todoist
      // попытается разобрать их как английские и молча проигнорирует дату
      ...(input.dueString ? { due_string: input.dueString, due_lang: "ru" } : {}),
      priority: input.priority ?? 1,
      project_id: input.projectId,
      labels: input.labels ?? ["telegram"],
      // добавит стандартное напоминание, если у задачи есть время
      auto_reminder: true,
    }),
  });
}

/** Задачи на сегодня + просроченные. Для утренней сводки. */
export async function getTodayTasks(limit = 30): Promise<TodoistTask[]> {
  const q = new URLSearchParams({ filter: "(today | overdue)", limit: String(limit) });
  const data = await call<{ results?: TodoistTask[] } | TodoistTask[]>(`/tasks/filter?${q}`);
  return Array.isArray(data) ? data : data.results ?? [];
}

/** Произвольный фильтр Todoist: "p1", "#Ремонт", "7 days & @telegram". */
export async function findTasks(filter: string, limit = 30): Promise<TodoistTask[]> {
  const q = new URLSearchParams({ filter, limit: String(limit) });
  const data = await call<{ results?: TodoistTask[] } | TodoistTask[]>(`/tasks/filter?${q}`);
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function completeTask(id: string): Promise<void> {
  await call(`/tasks/${id}/close`, { method: "POST" });
}

export async function reopenTask(id: string): Promise<void> {
  await call(`/tasks/${id}/reopen`, { method: "POST" });
}

/** Перенос: "завтра", "через час", "в понедельник". */
export async function rescheduleTask(id: string, dueString: string): Promise<TodoistTask> {
  return call<TodoistTask>(`/tasks/${id}`, {
    method: "POST",
    body: JSON.stringify({ due_string: dueString, due_lang: "ru" }),
  });
}

export async function listProjects(): Promise<{ id: string; name: string }[]> {
  const data = await call<{ results?: any[] } | any[]>("/projects");
  const arr = Array.isArray(data) ? data : data.results ?? [];
  return arr.map((p) => ({ id: p.id, name: p.name }));
}

/**
 * В ответе API ссылки на задачу нет — её собираем из id.
 * Открывается и в вебе, и в macOS-приложении.
 */
export function taskUrl(id: string): string {
  return `https://app.todoist.com/app/task/${id}`;
}

// ─── Formatting ─────────────────────────────────────────────────────────

const PRIORITY_MARK: Record<number, string> = { 4: "🔴", 3: "🟠", 2: "🔵", 1: "" };

/** Строка задачи для сообщения в Telegram. */
export function formatTask(t: TodoistTask): string {
  const mark = PRIORITY_MARK[t.priority] ?? "";
  let line = `${mark ? mark + " " : ""}${t.content}`;

  if (t.due) {
    const d = new Date(t.due.datetime ?? t.due.date);
    const overdue = d < new Date();
    const time = t.due.datetime
      ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
      : "";
    const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    line += ` — ${overdue ? "⚠️ " : ""}${date}${time ? " " + time : ""}`;
  }

  return line;
}
