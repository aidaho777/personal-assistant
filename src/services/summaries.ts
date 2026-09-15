/**
 * Утренняя (09:00) и вечерняя (21:00) сводки в Telegram с инлайн-кнопками.
 * Расписание — node-cron в scripts/polling.ts, обработка кнопок — bot.ts.
 *
 * Каждая задача — отдельное сообщение со своей клавиатурой (максимум 8),
 * чтобы по нажатию можно было пометить именно эту строку.
 */
import { Telegraf, Markup } from "telegraf";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { getTodayTasks, findTasks, getCompletedBetween, formatTask, type TodoistTask } from "./todoist";

const MAX_TASK_CARDS = 8;

function tz(): string {
  return process.env.TIMEZONE ?? "Europe/Oslo";
}

function mdEscape(s: string): string {
  return s.replace(/([_*\[\]`\\])/g, "\\$1");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── Time helpers (TIMEZONE-aware) ──────────────────────────────────────

function tzOffsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return (asUtc - at.getTime()) / 60_000;
}

/** Локальная дата в TIMEZONE как YYYY-MM-DD. */
function todayYmd(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: tz() });
}

/** Полночь сегодняшнего дня в TIMEZONE как инстант. */
function startOfTodayInTz(): Date {
  const guess = new Date(`${todayYmd()}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMinutes(tz(), guess) * 60_000);
}

function isOverdue(t: TodoistTask): boolean {
  if (!t.due) return false;
  if (t.due.datetime) return new Date(t.due.datetime) < new Date();
  return t.due.date < todayYmd();
}

// ─── Data ───────────────────────────────────────────────────────────────

async function activeChatIds(): Promise<string[]> {
  const rows = await db
    .select({ telegramId: schema.users.telegramId })
    .from(schema.users)
    .where(eq(schema.users.isActive, true));
  return rows.map((r) => r.telegramId.toString());
}

async function countYesterdayUploads(): Promise<number> {
  const zone = tz();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.uploads)
    .where(
      sql`(${schema.uploads.createdAt} AT TIME ZONE ${zone})::date = ((NOW() AT TIME ZONE ${zone}) - INTERVAL '1 day')::date`
    );
  return row?.n ?? 0;
}

// ─── Keyboards ──────────────────────────────────────────────────────────

function morningKeyboard(id: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅", `done:${id}`),
      Markup.button.callback("📅 завтра", `tmrw:${id}`),
      Markup.button.callback("🕐 +2ч", `plus2h:${id}`),
    ],
  ]);
}

function eveningKeyboard(id: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📅 завтра", `tmrw:${id}`),
      Markup.button.callback("📅 понедельник", `mon:${id}`),
      Markup.button.callback("❌ снять", `drop:${id}`),
    ],
  ]);
}

async function sendTaskCards(
  bot: Telegraf,
  chatId: string,
  tasks: TodoistTask[],
  keyboard: (id: string) => ReturnType<typeof Markup.inlineKeyboard>
): Promise<void> {
  for (const t of tasks.slice(0, MAX_TASK_CARDS)) {
    await bot.telegram.sendMessage(chatId, formatTask(t), keyboard(t.id));
  }
  if (tasks.length > MAX_TASK_CARDS) {
    await bot.telegram.sendMessage(chatId, `… и ещё ${tasks.length - MAX_TASK_CARDS}. Полный список: /tasks`);
  }
}

// ─── Summaries ──────────────────────────────────────────────────────────

export async function sendMorningSummary(bot: Telegraf): Promise<void> {
  console.log("[Summary] morning: start");
  const chatIds = await activeChatIds();
  if (chatIds.length === 0) return;

  let tasks: TodoistTask[] = [];
  let todoistError: string | null = null;
  try {
    tasks = await getTodayTasks();
  } catch (e) {
    todoistError = errMsg(e);
    console.error("[Summary] morning: Todoist failed:", todoistError);
  }

  let notes = 0;
  try {
    notes = await countYesterdayUploads();
  } catch (e) {
    console.error("[Summary] morning: uploads count failed:", errMsg(e));
  }

  const overdue = tasks.filter(isOverdue).length;
  let header = `☀️ *Доброе утро!*\n`;
  if (todoistError) {
    header += `⚠️ Todoist недоступен: ${mdEscape(todoistError).slice(0, 200)}\n`;
  } else if (tasks.length === 0) {
    header += `На сегодня пусто — задач нет.\n`;
  } else {
    header += `Задач на сегодня: *${tasks.length}*${overdue ? ` (просрочено: ${overdue})` : ""}\n`;
  }
  header += `Вчера сохранено записей: *${notes}*`;

  for (const chatId of chatIds) {
    try {
      await bot.telegram.sendMessage(chatId, header, { parse_mode: "Markdown" });
      await sendTaskCards(bot, chatId, tasks, morningKeyboard);
    } catch (e) {
      console.error("[Summary] morning: send failed for", chatId, errMsg(e));
    }
  }
  console.log("[Summary] morning: done, tasks:", tasks.length, "recipients:", chatIds.length);
}

export async function sendEveningSummary(bot: Telegraf): Promise<void> {
  console.log("[Summary] evening: start");
  const chatIds = await activeChatIds();
  if (chatIds.length === 0) return;

  let completed: TodoistTask[] = [];
  let open: TodoistTask[] = [];
  let todoistError: string | null = null;
  try {
    completed = await getCompletedBetween(startOfTodayInTz(), new Date());
    open = await findTasks("today");
  } catch (e) {
    todoistError = errMsg(e);
    console.error("[Summary] evening: Todoist failed:", todoistError);
  }

  let header = `🌙 *Итоги дня*\n`;
  if (todoistError) {
    header += `⚠️ Todoist недоступен: ${mdEscape(todoistError).slice(0, 200)}`;
  } else {
    header += `Закрыто сегодня: *${completed.length}*\nОткрыто на сегодня: *${open.length}*`;
    if (completed.length > 0) {
      header += `\n\n✅ Сделано:\n` + completed.slice(0, 15).map((t) => `• ${mdEscape(t.content)}`).join("\n");
    }
    if (open.length > 0) {
      header += `\n\n⏳ Не закрыто — что делаем?`;
    }
  }

  for (const chatId of chatIds) {
    try {
      await bot.telegram.sendMessage(chatId, header, { parse_mode: "Markdown" });
      await sendTaskCards(bot, chatId, open, eveningKeyboard);
    } catch (e) {
      console.error("[Summary] evening: send failed for", chatId, errMsg(e));
    }
  }
  console.log("[Summary] evening: done, completed:", completed.length, "open:", open.length);
}
