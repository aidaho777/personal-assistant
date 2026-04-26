"use client";

import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  source: string;
  created_at: string;
}

const COLUMNS = [
  { id: "todo", label: "To Do", icon: "📋", bg: "bg-slate-50 dark:bg-slate-800/50", border: "border-slate-200 dark:border-slate-700", header: "bg-slate-100 dark:bg-slate-700" },
  { id: "in_progress", label: "In Progress", icon: "🔄", bg: "bg-blue-50/50 dark:bg-blue-900/10", border: "border-blue-200/60 dark:border-blue-800/40", header: "bg-blue-100 dark:bg-blue-900/30" },
  { id: "done", label: "Done", icon: "✅", bg: "bg-emerald-50/50 dark:bg-emerald-900/10", border: "border-emerald-200/60 dark:border-emerald-800/40", header: "bg-emerald-100 dark:bg-emerald-900/30" },
  { id: "cancelled", label: "Cancelled", icon: "❌", bg: "bg-slate-50/50 dark:bg-slate-800/30", border: "border-slate-200/60 dark:border-slate-700/40", header: "bg-slate-100 dark:bg-slate-700/50" },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300",
  medium: "bg-yellow-200 text-yellow-700 dark:bg-yellow-800/40 dark:text-yellow-300",
  high: "bg-orange-200 text-orange-700 dark:bg-orange-800/40 dark:text-orange-300",
  urgent: "bg-red-200 text-red-700 dark:bg-red-800/40 dark:text-red-300",
};

function formatDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function isOverdue(s: string | null, status: string): boolean {
  if (!s || status === "done" || status === "cancelled") return false;
  return new Date(s) < new Date(new Date().toISOString().split("T")[0]);
}

export default function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", dueDate: "" });
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = (await res.json()) as { tasks: Task[] };
        setTasks(data.tasks);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function createTask() {
    if (!form.title.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowAdd(false);
        setForm({ title: "", description: "", priority: "medium", dueDate: "" });
        fetchTasks();
      }
    } catch { /* ignore */ }
  }

  async function updateTask(id: string, updates: Record<string, unknown>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
    } catch { fetchTasks(); }
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch { fetchTasks(); }
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const taskId = result.draggableId;
    if (tasks.find((t) => t.id === taskId)?.status === newStatus) return;
    updateTask(taskId, { status: newStatus });
  }

  const filtered = tasks.filter((t) => {
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterSource !== "all" && t.source !== filterSource) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tasks</h1>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          {tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length} активных
        </span>

        <div className="ml-auto flex items-center gap-2">
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <option value="all">Все приоритеты</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <option value="all">Все источники</option>
            <option value="web">Web</option>
            <option value="telegram">Telegram</option>
          </select>
          <button onClick={() => setShowAdd(true)} className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold">
            + Добавить задачу
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 animate-pulse text-center py-20">Загрузка задач...</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
            {COLUMNS.map((col) => {
              const colTasks = filtered.filter((t) => t.status === col.id);
              return (
                <Droppable droppableId={col.id} key={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={`flex flex-col rounded-xl border ${col.border} ${col.bg} overflow-hidden ${snapshot.isDraggingOver ? "ring-2 ring-blue-300" : ""}`}>
                      <div className={`flex items-center gap-2 px-3 py-2.5 ${col.header}`}>
                        <span className="text-sm">{col.icon}</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">{col.label}</span>
                        <span className="ml-auto text-xs font-semibold text-slate-400 bg-white/60 dark:bg-slate-800/60 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                      </div>
                      <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto">
                        {colTasks.map((task, idx) => (
                          <Draggable draggableId={task.id} index={idx} key={task.id}>
                            {(prov, snap) => (
                              <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className={`bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-100 dark:border-slate-700 cursor-grab active:cursor-grabbing transition-shadow ${snap.isDragging ? "shadow-lg ring-1 ring-blue-200" : "shadow-sm hover:shadow-md"}`}>
                                <div className="flex items-start gap-2">
                                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1 leading-snug">{task.title}</p>
                                  <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-red-500 text-xs shrink-0">✕</button>
                                </div>
                                {task.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>}
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>
                                    {task.priority.toUpperCase()}
                                  </span>
                                  {task.source === "telegram" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300">TG</span>}
                                  {task.due_date && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isOverdue(task.due_date, task.status) ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 font-semibold" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
                                      {formatDate(task.due_date)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">Новая задача</h2>
            <div className="flex flex-col gap-3">
              <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Название задачи" className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && createTask()} />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Описание (необязательно)" rows={2} className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Приоритет</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Дедлайн</label>
                  <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={createTask} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white">Создать</button>
              <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
