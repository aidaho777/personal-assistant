"use client";

import { useState } from "react";

export default function SettingsForm({ initialName, hasPassword }: { initialName: string; hasPassword: boolean }) {
  const [name, setName] = useState(initialName);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (newPwd) {
      if (newPwd.length < 8) { setMsg({ type: "err", text: "Пароль минимум 8 символов" }); return; }
      if (newPwd !== confirmPwd) { setMsg({ type: "err", text: "Пароли не совпадают" }); return; }
    }

    setLoading(true);
    const body: Record<string, string> = { name };
    if (newPwd) { body.newPassword = newPwd; if (hasPassword) body.oldPassword = oldPwd; }

    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { error?: string };
    setLoading(false);

    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Ошибка" });
    } else {
      setMsg({ type: "ok", text: "Сохранено" });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Имя</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Сменить пароль</p>
        {hasPassword && (
          <div className="mb-3">
            <label className="block text-xs text-slate-500 mb-1">Текущий пароль</label>
            <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Новый пароль</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Минимум 8 символов"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Подтверждение</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded-lg px-4 py-2 ${msg.type === "ok" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"}`}>
          {msg.text}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors">
        {loading ? "Сохранение..." : "Сохранить"}
      </button>
    </form>
  );
}
