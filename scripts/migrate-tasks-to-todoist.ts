/**
 * Одноразовый перенос открытых задач из таблицы `tasks` в Todoist.
 * Запускать ОДИН РАЗ до дропа таблицы:
 *   npx tsx scripts/migrate-tasks-to-todoist.ts
 *
 * Переносятся только status IN ('todo','in_progress'). Каждая задача
 * получает метку `migrated`, чтобы её было видно в Todoist.
 * Скрипт ничего не удаляет — дроп таблицы делает drizzle-миграция.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { createTask, taskUrl } from "../src/services/todoist";

interface OldTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  raw_message: string | null;
}

/**
 * Старая схема: varchar low|medium|high|urgent. Todoist: 1 (обычный) … 4 (p1).
 * `medium` был дефолтом для всех задач из бота, поэтому он маппится в 1 —
 * иначе каждая перенесённая задача приехала бы с цветным флагом.
 */
function mapPriority(p: string | null): 1 | 2 | 3 | 4 {
  switch ((p ?? "").toLowerCase()) {
    case "urgent": return 4;
    case "high": return 3;
    default: return 1;
  }
}

/** "2026-09-20 09:00" — числовой формат Todoist парсит независимо от языка. */
function toDueString(due: string | null): string | undefined {
  if (!due) return undefined;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return undefined;
  const tz = process.env.TIMEZONE ?? "Europe/Oslo";
  const date = d.toLocaleDateString("sv-SE", { timeZone: tz });
  const time = d.toLocaleTimeString("sv-SE", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

async function main() {
  const rows = (await db.execute(sql`
    SELECT id, title, description, due_date, priority, raw_message
    FROM tasks
    WHERE status IN ('todo', 'in_progress')
    ORDER BY created_at ASC
  `)) as unknown as OldTask[];

  console.log(`[Migrate] Found ${rows.length} open task(s) in the tasks table.`);

  let migrated = 0;
  const failed: { title: string; error: string }[] = [];

  for (const row of rows) {
    const title = (row.title ?? "").trim();
    if (!title) {
      console.warn("[Migrate] Skipping row with empty title:", row.id);
      continue;
    }
    try {
      const created = await createTask({
        content: title,
        description: row.description?.trim() || row.raw_message?.trim() || undefined,
        dueString: toDueString(row.due_date),
        priority: mapPriority(row.priority),
        labels: ["migrated"],
      });
      migrated++;
      console.log(`[Migrate] ✅ ${title} → ${taskUrl(created.id)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ title, error: msg });
      console.error(`[Migrate] ❌ ${title}: ${msg}`);
    }
  }

  console.log(`\n[Migrate] Migrated: ${migrated} / ${rows.length}`);
  if (failed.length > 0) {
    console.log(`[Migrate] Failed: ${failed.length}`);
    for (const f of failed) console.log(`  - ${f.title}: ${f.error}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[Migrate] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
