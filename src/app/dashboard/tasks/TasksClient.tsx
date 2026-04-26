"use client";

import { useState, useEffect, useCallback } from "react";

interface Task {
  id: string;
  title: string;
  raw_message: string | null;
  due_date: string | null;
  is_completed: boolean;
  source: string;
  created_at: string;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isToday(dateStr: string): boolean {
  return toDateStr(new Date(dateStr)) === toDateStr(new Date());
}

function isTomorrow(dateStr: string): boolean {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return toDateStr(new Date(dateStr)) === toDateStr(t);
}

function isThisWeek(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  return d > now && d <= endOfWeek;
}

function isOverdue(dateStr: string): boolean {
  return new Date(dateStr) < new Date(toDateStr(new Date()));
}

function getGroup(task: Task): string {
  if (!task.due_date) return "Без даты";
  if (isOverdue(task.due_date)) return "Просроченные";
  if (isToday(task.due_date)) return "Сегодня";
  if (isTomorrow(task.due_date)) return "Завтра";
  if (isThisWeek(task.due_date)) return "На этой неделе";
  return "Позже";
}

const GROUP_ORDER = ["Просроченные", "Сегодня", "Завтра", "На этой неделе", "Позже", "Без даты"];
const GROUP_STYLES: Record<string, string> = {
  "Просроченные": "border-l-red-500 bg-red-50 dark:bg-red-900/10",
  "Сегодня": "border-l-blue-500 bg-blue-50 dark:bg-blue-900/10",
  "Завтра": "border-l-violet-500 bg-violet-50 dark:bg-violet-900/10",
  "На этой неделе": "border-l-cyan-500 bg-cyan-50 dark:bg-cyan-900/10",
  "Позже": "border-l-slate-300 bg-white dark:bg-slate-800",
  "Без даты": "border-l-slate-200 bg-white dark:bg-slate-800",
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = (await res.json()) as { tasks: Task[] };
        setTasks(data.tasks);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), dueDate: newDate || undefined }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewDate("");
        fetchTasks();
      }
    } catch { /* ignore */ }
  }

  async function toggleComplete(id: string) {
    setCompleting(id);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isCompleted: true }),
      });
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setCompleting(null);
      }, 600);
    } catch {
      setCompleting(null);
    }
  }

  async function deleteTask(id: string) {
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch { /* ignore */ }
  }

  const grouped: Record<string, Task[]> = {};
  for (const t of tasks) {
    const g = getGroup(t);
    (grouped[g] ??= []).push(t);
  }
  const pendingCount = tasks.filter((t) => !t.is_completed).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Мои задачи</h1>
        {pendingCount > 0 && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            {pendingCount}
          </span>
        )}
      </div>

      {/* Quick add */}
      <form onSubmit={createTask} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Добавить задачу..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="datetime-local"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm"
        >
          Добавить
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400 animate-pulse py-10 text-center">Загрузка задач...</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <span className="text-4xl">✅</span>
          <p className="text-sm">Нет задач. Напишите или надиктуйте задачу боту в Telegram.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400">{group}</h2>
                <span className="text-xs text-slate-400">({grouped[group].length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {grouped[group].map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 transition-all duration-500 ${GROUP_STYLES[group] ?? ""} ${completing === task.id ? "opacity-30 line-through scale-95" : ""}`}
                  >
                    <button
                      onClick={() => toggleComplete(task.id)}
                      className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-500 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 shrink-0 transition-colors flex items-center justify-center"
                      title="Выполнено"
                    >
                      {completing === task.id && <span className="text-blue-500 text-xs">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
                    </div>
                    {task.due_date && (
                      <span className={`text-xs shrink-0 ${isOverdue(task.due_date) ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        {formatDateTime(task.due_date)}
                      </span>
                    )}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
