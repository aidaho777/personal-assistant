"use client";

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from "react";
import DocumentManager from "./DocumentManager";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface RagStats {
  indexedDocuments: number;
  totalChunks: number;
  totalUploads: number;
  webDocuments?: number;
  webChunks?: number;
}

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<RagStats | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStats = () => {
    fetch("/api/rag/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats(data as RagStats);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshStats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = (await res.json()) as {
        answer?: string;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        const errMsg = data.message || data.error || "Ошибка сервера";
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `⚠️ ${errMsg}`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: data.answer ?? "",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "⚠️ Не удалось подключиться к серверу",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleIndexAll() {
    setIndexing(true);
    setIndexResult(null);
    try {
      const res = await fetch("/api/rag/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = (await res.json()) as {
        indexed?: number;
        message?: string;
        error?: string;
      };
      if (res.ok) {
        setIndexResult(`✅ Проиндексировано из Telegram: ${data.indexed ?? 0}`);
        refreshStats();
      } else {
        setIndexResult(`❌ ${data.error ?? data.message ?? "неизвестная ошибка"}`);
      }
    } catch {
      setIndexResult("❌ Не удалось запустить индексацию");
    } finally {
      setIndexing(false);
    }
  }

  async function handleReindex() {
    setReindexing(true);
    setReindexResult(null);
    try {
      const res = await fetch("/api/rag/reindex", { method: "POST" });
      const data = (await res.json()) as { reindexed?: number; total?: number; errors?: string[]; error?: string };
      if (res.ok) {
        setReindexResult(`✅ Переиндексировано: ${data.reindexed}/${data.total}${data.errors?.length ? ` (ошибки: ${data.errors.length})` : ""}`);
        refreshStats();
      } else {
        setReindexResult(`❌ ${data.error ?? "Ошибка переиндексации"}`);
      }
    } catch {
      setReindexResult("❌ Не удалось выполнить переиндексацию");
    } finally {
      setReindexing(false);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/rag/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as {
        success?: boolean;
        fileName?: string;
        chunks?: number;
        error?: string;
        message?: string;
      };

      if (res.ok && data.success) {
        setUploadResult(
          `✅ Загружен "${data.fileName}" — ${data.chunks} чанков проиндексировано`
        );
        refreshStats();
      } else {
        setUploadResult(`❌ ${data.message ?? data.error ?? "Ошибка загрузки"}`);
      }
    } catch {
      setUploadResult("❌ Не удалось загрузить файл");
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {stats ? (
          <>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full">
              📄 Документов: {stats.indexedDocuments}
            </span>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full">
              🧩 Чанков: {stats.totalChunks}
            </span>
            {stats.totalUploads > 0 && (
              <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full">
                📁 Telegram: {stats.totalUploads}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">Загрузка статистики...</span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => { setShowDocs((v) => !v); setShowUpload(false); }}
            className="text-xs px-3 py-1 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-medium"
          >
            📋 Мои документы
          </button>
          <button
            onClick={() => { setShowUpload((v) => !v); setShowDocs(false); }}
            className="text-xs px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            📎 Загрузить документ
          </button>
          <button
            onClick={handleIndexAll}
            disabled={indexing}
            className="text-xs px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
          >
            {indexing ? "Индексация..." : "🔄 Telegram"}
          </button>
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="text-xs px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium"
          >
            {reindexing ? "OCR..." : "🔍 Переиндексация"}
          </button>
        </div>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Загрузить документ для RAG
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Поддерживаются: TXT, MD, PDF, DOCX, DOC, RTF, CSV, JSON (до 30MB). После загрузки документ будет
            автоматически проиндексирован.
          </p>
          <div className="flex gap-2 items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx,.doc,.rtf,.csv,.json,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/rtf,text/csv,application/json"
              onChange={handleFileUpload}
              disabled={uploading}
              className="text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-500 disabled:opacity-50"
            />
            {uploading && (
              <span className="text-xs text-slate-400 animate-pulse">
                Загрузка и индексация...
              </span>
            )}
          </div>
          {uploadResult && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {uploadResult}
            </p>
          )}
        </div>
      )}

      {showDocs && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Загруженные документы
          </p>
          <DocumentManager onDelete={refreshStats} />
        </div>
      )}

      {indexResult && (
        <div className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          {indexResult}
        </div>
      )}

      {reindexResult && (
        <div className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          {reindexResult}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <span className="text-4xl">🤖</span>
            <p className="text-sm text-center max-w-xs">
              Загрузите документы через кнопку{" "}
              <strong>📎 Загрузить документ</strong> и задайте вопрос.
              RAG-ассистент найдёт релевантные фрагменты и сгенерирует ответ.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Задайте вопрос по документам..."
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
