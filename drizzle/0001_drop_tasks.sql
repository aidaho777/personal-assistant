-- Задачи переехали в Todoist (см. src/services/todoist.ts).
-- Перед применением прогнать scripts/migrate-tasks-to-todoist.ts —
-- он переносит открытые задачи в Todoist с меткой `migrated`.
--
-- Таблица создавалась в рантайме (CREATE TABLE IF NOT EXISTS в бывшем
-- /api/tasks), поэтому в снапшоте 0000 её нет и `generate` дроп не увидит.
-- Отсюда — миграция, написанная руками.
DROP TABLE IF EXISTS "tasks";
