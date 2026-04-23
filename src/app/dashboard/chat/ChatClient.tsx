"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface RagStats {
  indexedDocuments: number;
  totalChunks: number;
  totalUploads: number;
}

export default function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<RagStats | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/rag/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setStats(data as RagStats); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json() as { answer?: string; error?: string; message?: string };

      if (!res.ok) {
        const errMsg = data.message || data.error || "Ошибка сервера";
        setError(errMsg);
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: "assistant", content: `⚠️ ${errMsg}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: "assistant", content: data.answer ?? "" },
        ]);
      }
    } catch {
      const msg = "Не удалось подключиться к серверу";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: `⚠️ ${msg}` },
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
      const data = await res.json() as { indexed?: number; message?: string; error?: string };
      if (res.ok) {
        setIndexResult(`✅ Проиндексировано документов: ${data.indexed ?? 0}`);
        // Refresh stats
        fetch("/api/rag/stats")
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) setStats(d as RagStats); })
          .catch(() => {});
      } else {
        setIndexResult(`❌ Ошибка: ${data.error ?? data.message ?? "неизвестная ошибка"}`);
      }
    } catch {
      setIndexResult("❌ Не удалось запустить индексацию");
    } finally {
      setIndexing(false);
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
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full">
              📁 Загрузок: {stats.totalUploads}
            </span>
          </>
        ) : (
          <span className="text-xs text-slate-400">Загрузка статистики...</span>
        )}
        <button
          onClick={handleIndexAll}
          disabled={indexing}
          className="ml-auto text-xs px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
        >
          {indexing ? "Индексация..." : "🔄 Переиндексировать"}
        </button>
      </div>

      {indexResult && (
        <div className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
          {indexResult}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <span className="text-4xl">🤖</span>
            <p className="text-sm text-center max-w-xs">
              Задайте вопрос по вашим документам. RAG-ассистент найдёт релевантные фрагменты и сгенерирует ответ.
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
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
