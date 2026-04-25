"use client";

import { useState, useEffect } from "react";

interface Document {
  fileName: string;
  chunkCount: number;
  uploadedAt: string;
}

interface Props {
  onDelete?: () => void;
}

export default function DocumentManager({ onDelete }: Props) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function fetchDocs() {
    try {
      const res = await fetch("/api/rag/documents");
      if (res.ok) {
        const data = (await res.json()) as { documents: Document[] };
        setDocs(data.documents);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDocs();
  }, []);

  async function handleDelete(fileName: string) {
    if (!confirm(`Удалить "${fileName}" и все его чанки?`)) return;

    setDeleting(fileName);
    try {
      const res = await fetch("/api/rag/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }),
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.fileName !== fileName));
        onDelete?.();
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <p className="text-xs text-slate-400 animate-pulse py-2">
        Загрузка документов...
      </p>
    );
  }

  if (docs.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
        Нет загруженных документов
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {docs.map((doc) => (
        <div
          key={doc.fileName}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 group"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 dark:text-slate-200 truncate">
              {doc.fileName}
            </p>
            <p className="text-xs text-slate-400">
              {doc.chunkCount} чанков &middot;{" "}
              {new Date(doc.uploadedAt).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <button
            onClick={() => handleDelete(doc.fileName)}
            disabled={deleting === doc.fileName}
            className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Удалить документ"
          >
            {deleting === doc.fileName ? (
              <span className="text-xs animate-pulse">...</span>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
