import { Telegraf } from "telegraf";
import postgres from "postgres";

function getDb() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (!url) throw new Error("No DATABASE_URL or DATABASE_PUBLIC_URL");
  return postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10 });
}

export async function checkDeadlines(bot: Telegraf) {
  console.log("[Deadlines] Checking...");

  const sql = getDb();

  try {
    // Ensure notified_at column exists
    try { await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ`; } catch { /* ignore */ }

    // Upcoming: due in the next 2 hours, not yet notified (or notified >2h ago)
    const upcoming = await sql`
      SELECT t.id, t.title, t.due_date, t.user_id, u.telegram_id
      FROM tasks t
      JOIN users u ON t.user_id = u.id
      WHERE t.status IN ('todo', 'in_progress')
        AND t.due_date IS NOT NULL
        AND t.due_date > NOW()
        AND t.due_date < NOW() + INTERVAL '2 hours'
        AND (t.notified_at IS NULL OR t.notified_at < NOW() - INTERVAL '2 hours')
    `;

    console.log("[Deadlines] Found", upcoming.length, "upcoming tasks");

    for (const task of upcoming) {
      if (!task.telegram_id) continue;

      const dueDate = new Date(task.due_date as string);
      const timeStr = dueDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const dateStr = dueDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

      try {
        await bot.telegram.sendMessage(
          task.telegram_id.toString(),
          `⏰ *Напоминание!*\n\n` +
          `Задача: "${task.title}"\n` +
          `Срок: ${dateStr} в ${timeStr}\n\n` +
          `Осталось менее 2 часов!`,
          { parse_mode: "Markdown" }
        );
        await sql`UPDATE tasks SET notified_at = NOW() WHERE id = ${task.id}::uuid`;
        console.log("[Deadlines] Notified about:", task.title);
      } catch (e) {
        console.error("[Deadlines] Failed to notify:", e);
      }
    }

    // Overdue: past due, not notified in last 24h
    const overdue = await sql`
      SELECT t.id, t.title, t.due_date, t.user_id, u.telegram_id
      FROM tasks t
      JOIN users u ON t.user_id = u.id
      WHERE t.status IN ('todo', 'in_progress')
        AND t.due_date IS NOT NULL
        AND t.due_date < NOW()
        AND (t.notified_at IS NULL OR t.notified_at < NOW() - INTERVAL '24 hours')
    `;

    console.log("[Deadlines] Found", overdue.length, "overdue tasks");

    for (const task of overdue) {
      if (!task.telegram_id) continue;

      try {
        await bot.telegram.sendMessage(
          task.telegram_id.toString(),
          `🔴 *Просрочено!*\n\n` +
          `Задача: "${task.title}"\n` +
          `Срок был: ${new Date(task.due_date as string).toLocaleDateString("ru-RU")}\n\n` +
          `Завершите или перенесите задачу.`,
          { parse_mode: "Markdown" }
        );
        await sql`UPDATE tasks SET notified_at = NOW() WHERE id = ${task.id}::uuid`;
      } catch (e) {
        console.error("[Deadlines] Overdue notification failed:", e);
      }
    }
  } catch (e) {
    console.error("[Deadlines] Check failed:", e);
  } finally {
    await sql.end().catch(() => {});
  }
}
