"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

type Filter = "all" | "today" | "future";
type View = "kanban" | "calendar";

const STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;

const STATUS_CONFIG: Record<string, { label: string; icon: string; bg: string; border: string; badge: string }> = {
  todo:        { label: "To Do",       icon: "📋", bg: "bg-blue-50/80",    border: "border-blue-200/60",    badge: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", icon: "🔄", bg: "bg-amber-50/80",   border: "border-amber-200/60",   badge: "bg-amber-100 text-amber-700" },
  done:        { label: "Done",        icon: "✅", bg: "bg-emerald-50/80", border: "border-emerald-200/60", badge: "bg-emerald-100 text-emerald-700" },
  cancelled:   { label: "Cancelled",   icon: "❌", bg: "bg-slate-50/80",   border: "border-slate-200/60",   badge: "bg-slate-100 text-slate-500" },
};

function toLocalDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return toLocalDate(new Date(dateStr)) === toLocalDate(new Date());
}

function isTomorrow(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDate(new Date(dateStr)) === toLocalDate(tomorrow);
}

function isOverdue(dateStr: string | null, status: string): boolean {
  if (!dateStr || status === "done" || status === "cancelled") return false;
  return new Date(dateStr) < new Date(toLocalDate(new Date()));
}

function getCalendarGroup(dateStr: string | null, status: string): string {
  if (!dateStr) return "Без даты";
  if (isOverdue(dateStr, status)) return "Просрочено";
  if (isToday(dateStr)) return "Сегодня";
  if (isTomorrow(dateStr)) return "Завтра";

  const d = new Date(dateStr);
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  if (d <= endOfWeek) return "На этой неделе";

  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfWeek.getDate() + 7);
  if (d <= endOfNextWeek) return "На след. неделе";

  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return "В этом месяце";

  return "Позже";
}

const CALENDAR_ORDER = ["Просрочено", "Сегодня", "Завтра", "На этой неделе", "На след. неделе", "В этом месяце", "Позже", "Без даты"];
const CALENDAR_COLORS: Record<string, string> = {
  "Просрочено": "border-l-red-400 bg-red-50/50",
  "Сегодня": "border-l-violet-400 bg-violet-50/50",
  "Завтра": "border-l-blue-400 bg-blue-50/50",
  "На этой неделе": "border-l-cyan-400 bg-cyan-50/30",
  "На след. неделе": "border-l-teal-400 bg-teal-50/30",
  "В этом месяце": "border-l-slate-300 bg-slate-50/30",
  "Позже": "border-l-slate-200 bg-white",
  "Без даты": "border-l-slate-200 bg-white",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("kanban");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", dueDate: toLocalDate(new Date()), category: "task" as string });

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?filter=${filter}`);
      if (res.ok) {
        const data = (await res.json()) as { tasks: Task[] };
        setTasks(data.tasks);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); fetchTasks(); }, [fetchTasks]);

  async function createTask() {
    if (!createForm.title.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateForm({ title: "", description: "", dueDate: toLocalDate(new Date()), category: "task" });
        fetchTasks();
      }
    } catch { /* ignore */ }
  }

  async function updateTask(id: string, updates: Record<string, unknown>) {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const data = (await res.json()) as { task: Task };
        setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
        if (editingTask?.id === id) setEditingTask(data.task);
      }
    } catch { /* ignore */ }
  }

  async function deleteTask(id: string) {
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setEditingTask(null);
    } catch { /* ignore */ }
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const taskId = result.draggableId;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    updateTask(taskId, { status: newStatus });
  }

  const regularTasks = tasks.filter((t) => t.category === "task");
  const goals = tasks.filter((t) => t.category === "goal");

  const grouped: Record<string, Task[]> = {};
  for (const t of regularTasks) {
    const group = getCalendarGroup(t.due_date, t.status);
    (grouped[group] ??= []).push(t);
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Tasks</h1>

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={() => setView("kanban")} className={`px-3 py-1.5 text-xs font-medium transition-all ${view === "kanban" ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              Kanban
            </button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 text-xs font-medium transition-all ${view === "calendar" ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              Календарь
            </button>
          </div>

          {/* Filters */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            {([["all", "Все"], ["today", "Сегодня"], ["future", "Будущие"]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-medium transition-all ${filter === f ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>

          <button onClick={() => { setShowCreate(true); setCreateForm({ title: "", description: "", dueDate: toLocalDate(new Date()), category: "task" }); }} className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600 shadow-sm transition-all">
            + Новая задача
          </button>
        </div>
      </div>

      {/* Strategic Goals */}
      {goals.length > 0 && (
        <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-50/80 to-purple-50/80 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🎯</span>
            <h2 className="text-sm font-semibold text-violet-700">Стратегические цели</h2>
            <button onClick={() => { setShowCreate(true); setCreateForm({ title: "", description: "", dueDate: "", category: "goal" }); }} className="ml-auto text-xs text-violet-500 hover:text-violet-700 font-medium">+ Добавить</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => (
              <button key={g.id} onClick={() => setEditingTask(g)} className="px-3 py-2 rounded-xl bg-white/80 border border-violet-100 text-sm text-slate-700 hover:shadow-md transition-all cursor-pointer text-left">
                <span className="font-medium">{g.title}</span>
                {g.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{g.description}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
      {goals.length === 0 && (
        <button onClick={() => { setShowCreate(true); setCreateForm({ title: "", description: "", dueDate: "", category: "goal" }); }} className="rounded-2xl border-2 border-dashed border-violet-200 p-4 text-sm text-violet-400 hover:text-violet-600 hover:border-violet-300 transition-all">
          🎯 Добавить стратегическую цель
        </button>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm animate-pulse">Загрузка задач...</div>
      ) : view === "kanban" ? (
        /* Kanban View */
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
            {STATUSES.map((status) => {
              const cfg = STATUS_CONFIG[status];
              const col = regularTasks.filter((t) => t.status === status);
              return (
                <Droppable droppableId={status} key={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex flex-col rounded-2xl border ${cfg.border} ${cfg.bg} p-3 transition-all ${snapshot.isDraggingOver ? "ring-2 ring-violet-300 ring-offset-2" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span>{cfg.icon}</span>
                        <span className="text-sm font-semibold text-slate-700">{cfg.label}</span>
                        <span className="ml-auto text-xs font-medium text-slate-400 bg-white/60 px-2 py-0.5 rounded-full">{col.length}</span>
                      </div>
                      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                        {col.map((task, idx) => (
                          <Draggable draggableId={task.id} index={idx} key={task.id}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                onClick={() => setEditingTask(task)}
                                className={`bg-white rounded-2xl p-3.5 border border-slate-100 cursor-grab active:cursor-grabbing transition-all ${snap.isDragging ? "shadow-lg ring-2 ring-violet-200 rotate-1" : "shadow-sm hover:shadow-md"}`}
                              >
                                <p className="font-medium text-sm text-slate-800 leading-snug">{task.title}</p>
                                {task.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>}
                                <div className="flex items-center gap-2 mt-2.5">
                                  {task.due_date && (
                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isOverdue(task.due_date, task.status) ? "bg-red-100 text-red-600" : isToday(task.due_date) ? "bg-violet-100 text-violet-600" : isTomorrow(task.due_date) ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                                      {isOverdue(task.due_date, task.status) ? "Просрочено" : isToday(task.due_date) ? "Сегодня" : isTomorrow(task.due_date) ? "Завтра" : formatDate(task.due_date)}
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
      ) : (
        /* Calendar View */
        <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
          {CALENDAR_ORDER.filter((g) => grouped[g]?.length).map((group) => (
            <div key={group} className={`rounded-2xl border-l-4 border border-slate-100 p-4 ${CALENDAR_COLORS[group] ?? "bg-white"}`}>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{group} <span className="text-slate-400 font-normal">({grouped[group].length})</span></h3>
              <div className="flex flex-col gap-2">
                {grouped[group].map((task) => (
                  <button key={task.id} onClick={() => setEditingTask(task)} className="flex items-center gap-3 bg-white/80 rounded-xl p-3 border border-slate-100 hover:shadow-md transition-all text-left w-full">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[task.status]?.badge ?? "bg-slate-100 text-slate-500"}`}>
                      {STATUS_CONFIG[task.status]?.label ?? task.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-slate-800 truncate ${task.status === "done" ? "line-through opacity-50" : ""}`}>{task.title}</p>
                      {task.description && <p className="text-xs text-slate-400 truncate">{task.description}</p>}
                    </div>
                    {task.due_date && <span className="text-xs text-slate-400 shrink-0">{formatDate(task.due_date)}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
              <span className="text-4xl">📭</span>
              <p className="text-sm">Нет задач для отображения</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">{createForm.category === "goal" ? "🎯 Новая цель" : "📌 Новая задача"}</h2>
            <div className="flex flex-col gap-3">
              <input autoFocus value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder="Название" className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 text-slate-800" onKeyDown={(e) => e.key === "Enter" && createTask()} />
              <textarea value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} placeholder="Описание (необязательно)" rows={2} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none text-slate-800" />
              {createForm.category !== "goal" && (
                <input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm((f) => ({ ...f, dueDate: e.target.value }))} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 text-slate-800" />
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={createTask} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 to-purple-500 text-white hover:from-violet-600 hover:to-purple-600 transition-all">Создать</button>
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-all">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setEditingTask(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col gap-3">
              <input value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} onBlur={() => updateTask(editingTask.id, { title: editingTask.title })} className="text-lg font-bold text-slate-800 px-0 py-1 border-0 border-b-2 border-transparent focus:border-violet-400 focus:outline-none transition-all bg-transparent" />
              <textarea value={editingTask.description ?? ""} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} onBlur={() => updateTask(editingTask.id, { description: editingTask.description })} placeholder="Добавить описание..." rows={3} className="text-sm text-slate-600 px-0 py-1 border-0 border-b-2 border-transparent focus:border-violet-400 focus:outline-none resize-none transition-all bg-transparent" />

              {editingTask.category !== "goal" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Статус</label>
                    <div className="flex gap-1.5">
                      {STATUSES.map((s) => (
                        <button key={s} onClick={() => updateTask(editingTask.id, { status: s })} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${editingTask.status === s ? STATUS_CONFIG[s].badge + " ring-2 ring-offset-1 ring-violet-300" : "bg-slate-50 text-slate-400 hover:bg-slate-100"}`}>
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Дата</label>
                    <input type="date" value={editingTask.due_date ? toLocalDate(new Date(editingTask.due_date)) : ""} onChange={(e) => { const v = e.target.value; setEditingTask({ ...editingTask, due_date: v || null }); updateTask(editingTask.id, { dueDate: v || undefined }); }} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 text-slate-800" />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setEditingTask(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-all">Закрыть</button>
              <button onClick={() => { if (confirm("Удалить задачу?")) deleteTask(editingTask.id); }} className="px-5 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
