/**
 * Smoke-тест Todoist API v1: создаёт задачу, печатает id/URL, закрывает её.
 * Запуск: npx tsx scripts/todoist-smoke.ts
 */
import "dotenv/config";
import { createTask, completeTask, taskUrl } from "../src/services/todoist";

async function main() {
  console.log("[Smoke] Creating task «проверка связи» due «сегодня в 18:00»...");
  const task = await createTask({ content: "проверка связи", dueString: "сегодня в 18:00" });
  console.log("[Smoke] id:", task.id);
  console.log("[Smoke] url:", taskUrl(task.id));
  console.log("[Smoke] due:", JSON.stringify(task.due));
  console.log("[Smoke] labels:", task.labels);

  await completeTask(task.id);
  console.log("[Smoke] Completed ✅");
}

main().catch((e) => {
  console.error("[Smoke] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
