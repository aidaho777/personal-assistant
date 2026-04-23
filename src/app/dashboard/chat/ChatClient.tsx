"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";

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

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/rag/stats");
      if (res.ok) setStats(await res.json() as RagStats);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setError(null);
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string; message?: string };
        throw new Error(data.message ?? data.error ?? "Request failed");
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json() as { error?: string; message?: string };
        if (data.error === "no_documents") {
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message ?? "Нет документов для поиска." }]);
          setIsLoading(false);
          return;
        }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        const cleanText = accumulated.replace(/^\d+:"?|"?\n$/gm, "").replace(/\\n/g, "\n");
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: cleanText } : m))
        );
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }

    setIsLoading(false);
  }

  async function handleIndex() {
    setIndexing(true);
    setIndexResult(null);
    try {
      const res = await fetch("/api/rag/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json() as { indexed?: number; errors?: string[] };
      setIndexResult(`Проиндексировано: ${data.indexed ?? 0} документов${data.errors?.length ? `, ошибок: ${data.errors.length}` : ""}`);
      loadStats();
    } catch {
      setIndexResult("Ошибка индексации");
    }
    setIndexing(false);
  }

  function extractSources(text: string): string[] {
    const matches = text.match(/\[([^\]]+\.[a-z]+[^\]]*)\]/gi);
    return matches ? [...new Set(matches.map((m) => m.slice(1, -1)))] : [];
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4 gap-3">
        <div className="flex items-center gap-6 text-sm text-slate-500">
          <span>Документов: <strong className="text-slate-900 dark:text-white">{stats?.indexedDocuments ?? 0}</strong></span>
          <span>Чанков: <strong className="text-slate-900 dark:text-white">{stats?.totalChunks ?? 0}</strong></span>
          <span>Всего файлов: <strong className="text-slate-900 dark:text-white">{stats?.totalUploads ?? 0}</strong></span>
        </div>
        <button
          onClick={handleIndex}
          disabled={indexing}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {indexing ? "Индексация..." : "Переиндексировать"}
        </button>
      </div>

      {indexResult && (
        <div className="mb-4 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2">
          {indexResult}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 py-12">
            <div className="text-4xl mb-4">🤖</div>
            <p className="text-lg font-medium mb-1">AI Ассистент</p>
            <p className="text-sm">Задайте вопрос по вашим документам из Google Drive</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              m.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white"
            }`}>
              <div className="text-sm whitespace-pre-wrap">{m.content || "..."}</div>
              {m.role === "assistant" && m.content && (() => {
                const sources = extractSources(m.content);
                return sources.length > 0 ? (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Источники:</p>
                    <div className="flex flex-wrap gap-1">
                      {sources.map((s) => (
                        <span key={s} className="text-xs bg-slate-200 dark:bg-slate-600 rounded px-2 py-0.5 text-slate-600 dark:text-slate-300">{s}</span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        ))}

        {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2">
            Ошибка: {error}
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
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors text-sm"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
