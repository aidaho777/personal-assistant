"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface LinkStatus {
  google: { linked: boolean; email?: string };
}

export default function GoogleDriveLink() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const linked = searchParams.get("linked");
  const error = searchParams.get("error");

  useEffect(() => {
    fetch("/api/auth/link-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStatus(data as LinkStatus); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Google Drive</h2>
      <p className="text-sm text-slate-500 mb-4">
        Привяжите Google аккаунт для синхронизации документов из Google Drive с RAG-поиском.
      </p>

      {linked === "google" && (
        <div className="text-sm rounded-lg px-4 py-2 mb-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
          ✅ Google Drive успешно подключён
        </div>
      )}

      {error && (
        <div className="text-sm rounded-lg px-4 py-2 mb-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          ❌ Ошибка привязки: {error === "token_failed" ? "не удалось получить токен" : error === "no_code" ? "не получен код авторизации" : "неизвестная ошибка"}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 animate-pulse">Проверка статуса...</p>
      ) : status?.google?.linked ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            ✅ Подключён: {status.google.email}
          </span>
          <a
            href="/api/auth/link-google"
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Переподключить
          </a>
        </div>
      ) : (
        <a
          href="/api/auth/link-google"
          className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors"
        >
          Привязать Google Drive
        </a>
      )}
    </div>
  );
}
