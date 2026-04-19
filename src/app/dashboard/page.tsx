"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StatsData {
  totals: { all: number; success: number; error: number };
  byType: Record<string, number>;
  users: number;
  timeSeries: { today: number; week: number; month: number };
  topTags: Array<{ tag: string; count: number }>;
  recentUploads: UploadRow[];
  generatedAt: string;
}

interface UploadRow {
  id: string;
  fileName: string;
  originalName: string | null;
  contentType: string;
  fileSize: number | null;
  tag: string;
  driveUrl: string | null;
  driveFileId: string | null;
  status: string;
  errorMessage: string | null;
  transcription: string | null;
  createdAt: string;
  username: string | null;
  firstName: string | null;
}

interface PaginatedUploads {
  data: UploadRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeIcon(type: string): string {
  switch (type) {
    case "document": return "📄";
    case "photo": return "🖼️";
    case "voice": return "🎤";
    case "text": return "📝";
    default: return "📁";
  }
}

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    success: { bg: "rgba(52,211,153,0.15)", color: "#34d399" },
    error: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
    pending: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  };
  const s = styles[status] ?? { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "0.72rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {status}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [token, setToken] = useState<string>("");
  const [inputToken, setInputToken] = useState<string>("");
  const [authed, setAuthed] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");

  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string>("");

  const [uploads, setUploads] = useState<PaginatedUploads | null>(null);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [expandedTranscription, setExpandedTranscription] = useState<string | null>(null);

  const [healthData, setHealthData] = useState<{
    status: string;
    services: Record<string, string>;
  } | null>(null);

  // On mount, check URL for token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) {
      setToken(t);
      setInputToken(t);
    }
  }, []);

  const fetchStats = useCallback(async (tok: string) => {
    setStatsLoading(true);
    setStatsError("");
    try {
      const res = await fetch(`/api/admin/stats?token=${encodeURIComponent(tok)}`);
      if (res.status === 401) {
        setAuthed(false);
        setAuthError("Неверный токен. Доступ запрещён.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
      setAuthed(true);
      setAuthError("");
    } catch (e) {
      setStatsError(`Ошибка загрузки статистики: ${e}`);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchUploads = useCallback(
    async (tok: string, pg: number, type: string, tag: string, status: string) => {
      setUploadsLoading(true);
      try {
        const params = new URLSearchParams({
          token: tok,
          page: String(pg),
          limit: "20",
        });
        if (type) params.set("type", type);
        if (tag) params.set("tag", tag);
        if (status) params.set("status", status);
        const res = await fetch(`/api/admin/uploads?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setUploads(data);
      } catch (e) {
        console.error("Failed to fetch uploads:", e);
      } finally {
        setUploadsLoading(false);
      }
    },
    []
  );

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealthData(data);
    } catch {
      // ignore
    }
  }, []);

  const handleLogin = async () => {
    if (!inputToken.trim()) return;
    setToken(inputToken.trim());
    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set("token", inputToken.trim());
    window.history.replaceState({}, "", url.toString());
    await fetchStats(inputToken.trim());
    await fetchHealth();
  };

  // Auto-load if token in URL
  useEffect(() => {
    if (token && !authed && !statsLoading) {
      fetchStats(token);
      fetchHealth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load uploads when authed or filters change
  useEffect(() => {
    if (authed && token) {
      fetchUploads(token, page, filterType, filterTag, filterStatus);
    }
  }, [authed, token, page, filterType, filterTag, filterStatus, fetchUploads]);

  // ─── Styles ───────────────────────────────────────────────────────────────

  const bg = "linear-gradient(135deg, #0d1b4b 0%, #1a2d6b 100%)";
  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "1.5rem",
    backdropFilter: "blur(10px)",
  };

  // ─── Login screen ─────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div
          style={{
            ...cardStyle,
            maxWidth: "400px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔐</div>
          <h1 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
            Admin Dashboard
          </h1>
          <p style={{ color: "#93c5fd", fontSize: "0.9rem", margin: "0 0 1.5rem" }}>
            Collector Bot · Панель администратора
          </p>
          <input
            type="password"
            placeholder="Введите секретный токен..."
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
              color: "#fff",
              fontSize: "0.9rem",
              outline: "none",
              boxSizing: "border-box",
              marginBottom: "1rem",
            }}
          />
          {authError && (
            <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0 0 1rem" }}>
              {authError}
            </p>
          )}
          <button
            onClick={handleLogin}
            disabled={statsLoading}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "rgba(59,130,246,0.3)",
              border: "1px solid rgba(59,130,246,0.5)",
              borderRadius: "8px",
              color: "#93c5fd",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {statsLoading ? "Проверяем..." : "Войти"}
          </button>
          <p style={{ color: "#475569", fontSize: "0.75rem", marginTop: "1.5rem" }}>
            Доступ только для администраторов
          </p>
        </div>
      </main>
    );
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  return (
    <main
      style={{
        minHeight: "100vh",
        background: bg,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        padding: "1.5rem",
        color: "#e2e8f0",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.8rem" }}>🤖</span>
          <div>
            <h1 style={{ color: "#fff", fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>
              Collector Bot
            </h1>
            <p style={{ color: "#64748b", fontSize: "0.8rem", margin: 0 }}>
              Admin Dashboard
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {stats && (
            <span style={{ color: "#475569", fontSize: "0.75rem" }}>
              Обновлено: {formatDate(stats.generatedAt)}
            </span>
          )}
          <button
            onClick={() => { fetchStats(token); fetchHealth(); fetchUploads(token, page, filterType, filterTag, filterStatus); }}
            style={{
              padding: "0.4rem 0.9rem",
              background: "rgba(59,130,246,0.2)",
              border: "1px solid rgba(59,130,246,0.4)",
              borderRadius: "6px",
              color: "#93c5fd",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            🔄 Обновить
          </button>
          <a
            href="/"
            style={{
              padding: "0.4rem 0.9rem",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              color: "#94a3b8",
              fontSize: "0.8rem",
              textDecoration: "none",
            }}
          >
            ← Главная
          </a>
        </div>
      </div>

      {statsError && (
        <div
          style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: "8px",
            padding: "1rem",
            color: "#f87171",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
          }}
        >
          {statsError}
        </div>
      )}

      {statsLoading && (
        <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
          Загрузка данных...
        </div>
      )}

      {stats && (
        <>
          {/* ── Service Status ── */}
          {healthData && (
            <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
              <h2 style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 1rem" }}>
                Статус сервисов
              </h2>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {Object.entries(healthData.services).map(([name, status]) => {
                  const ok = status === "ok";
                  const labels: Record<string, string> = {
                    database: "PostgreSQL",
                    googleDrive: "Google Drive",
                    yandexSpeechKit: "Yandex SpeechKit",
                  };
                  return (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        background: ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
                        border: `1px solid ${ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
                        borderRadius: "8px",
                        padding: "0.5rem 0.9rem",
                      }}
                    >
                      <span style={{ fontSize: "0.8rem" }}>{ok ? "✅" : "❌"}</span>
                      <span style={{ color: ok ? "#34d399" : "#f87171", fontSize: "0.85rem", fontWeight: 600 }}>
                        {labels[name] ?? name}
                      </span>
                      <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{status}</span>
                    </div>
                  );
                })}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: healthData.status === "healthy" ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
                    border: `1px solid ${healthData.status === "healthy" ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`,
                    borderRadius: "8px",
                    padding: "0.5rem 0.9rem",
                  }}
                >
                  <span style={{ fontSize: "0.8rem" }}>{healthData.status === "healthy" ? "🟢" : "🟡"}</span>
                  <span style={{ color: healthData.status === "healthy" ? "#34d399" : "#fbbf24", fontSize: "0.85rem", fontWeight: 600 }}>
                    Система: {healthData.status}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Stat Cards ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {[
              { label: "Всего загрузок", value: stats.totals.all, icon: "📦", color: "#93c5fd" },
              { label: "Успешно", value: stats.totals.success, icon: "✅", color: "#34d399" },
              { label: "Ошибки", value: stats.totals.error, icon: "❌", color: "#f87171" },
              { label: "Пользователи", value: stats.users, icon: "👤", color: "#a78bfa" },
              { label: "Сегодня", value: stats.timeSeries.today, icon: "📅", color: "#fbbf24" },
              { label: "За неделю", value: stats.timeSeries.week, icon: "📊", color: "#fb923c" },
              { label: "За месяц", value: stats.timeSeries.month, icon: "📈", color: "#e879f9" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>{icon}</div>
                <div style={{ color, fontSize: "1.6rem", fontWeight: 800, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.3rem" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* ── By Type + Top Tags ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* By Type */}
            <div style={cardStyle}>
              <h2 style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 1rem" }}>
                По типам файлов
              </h2>
              {["document", "photo", "voice", "text"].map((type) => {
                const count = stats.byType[type] ?? 0;
                const total = stats.totals.success || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={type} style={{ marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                      <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>
                        {typeIcon(type)} {type}
                      </span>
                      <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "rgba(255,255,255,0.08)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: "rgba(59,130,246,0.6)",
                          borderRadius: "3px",
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Top Tags */}
            <div style={cardStyle}>
              <h2 style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 1rem" }}>
                Топ тегов
              </h2>
              {stats.topTags.length === 0 ? (
                <p style={{ color: "#475569", fontSize: "0.85rem" }}>Нет данных</p>
              ) : (
                stats.topTags.map(({ tag, count }, i) => (
                  <div
                    key={tag}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.4rem 0",
                      borderBottom: i < stats.topTags.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <span style={{ color: "#e2e8f0", fontSize: "0.85rem" }}>
                      #{tag}
                    </span>
                    <span
                      style={{
                        background: "rgba(59,130,246,0.15)",
                        color: "#93c5fd",
                        borderRadius: "4px",
                        padding: "2px 8px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                      }}
                    >
                      {count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Uploads Table ── */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <h2 style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                История загрузок
                {uploads && (
                  <span style={{ color: "#475569", marginLeft: "0.5rem" }}>
                    ({uploads.pagination.total} записей)
                  </span>
                )}
              </h2>

              {/* Filters */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <select
                  value={filterType}
                  onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    padding: "0.35rem 0.6rem",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Все типы</option>
                  <option value="document">📄 Документы</option>
                  <option value="photo">🖼️ Фото</option>
                  <option value="voice">🎤 Голос</option>
                  <option value="text">📝 Текст</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    padding: "0.35rem 0.6rem",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Все статусы</option>
                  <option value="success">✅ Успешно</option>
                  <option value="error">❌ Ошибка</option>
                  <option value="pending">⏳ Ожидание</option>
                </select>

                {stats.topTags.length > 0 && (
                  <select
                    value={filterTag}
                    onChange={(e) => { setFilterTag(e.target.value); setPage(1); }}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      color: "#e2e8f0",
                      padding: "0.35rem 0.6rem",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Все теги</option>
                    {stats.topTags.map(({ tag }) => (
                      <option key={tag} value={tag}>#{tag}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr>
                    {["Тип", "Файл", "Тег", "Пользователь", "Размер", "Статус", "Дата", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          color: "#64748b",
                          fontWeight: 600,
                          textAlign: "left",
                          padding: "0.5rem 0.75rem",
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          whiteSpace: "nowrap",
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadsLoading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                        Загрузка...
                      </td>
                    </tr>
                  ) : uploads?.data.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                        Нет записей
                      </td>
                    </tr>
                  ) : (
                    uploads?.data.map((row) => (
                      <>
                        <tr
                          key={row.id}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                            <span title={row.contentType}>{typeIcon(row.contentType)}</span>
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", maxWidth: "200px" }}>
                            <div
                              style={{
                                color: "#e2e8f0",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={row.originalName ?? row.fileName}
                            >
                              {row.originalName ?? row.fileName}
                            </div>
                            {row.transcription && (
                              <button
                                onClick={() =>
                                  setExpandedTranscription(
                                    expandedTranscription === row.id ? null : row.id
                                  )
                                }
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#93c5fd",
                                  fontSize: "0.72rem",
                                  cursor: "pointer",
                                  padding: 0,
                                  marginTop: "2px",
                                }}
                              >
                                {expandedTranscription === row.id ? "▲ скрыть" : "▼ расшифровка"}
                              </button>
                            )}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                            <span style={{ color: "#93c5fd", fontSize: "0.78rem" }}>#{row.tag}</span>
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap", color: "#94a3b8" }}>
                            {row.username ? `@${row.username}` : row.firstName ?? "—"}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap", color: "#64748b" }}>
                            {formatSize(row.fileSize)}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                            {statusBadge(row.status)}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap", color: "#64748b" }}>
                            {formatDate(row.createdAt)}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                            {row.driveUrl && (
                              <a
                                href={row.driveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: "#34d399",
                                  fontSize: "0.78rem",
                                  textDecoration: "none",
                                }}
                              >
                                Drive ↗
                              </a>
                            )}
                          </td>
                        </tr>
                        {expandedTranscription === row.id && row.transcription && (
                          <tr key={`${row.id}-transcription`}>
                            <td
                              colSpan={8}
                              style={{
                                padding: "0.5rem 0.75rem 0.75rem 2.5rem",
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                              }}
                            >
                              <div
                                style={{
                                  background: "rgba(255,255,255,0.04)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  borderRadius: "6px",
                                  padding: "0.75rem",
                                  color: "#94a3b8",
                                  fontSize: "0.82rem",
                                  lineHeight: 1.6,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                🎤 {row.transcription}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {uploads && uploads.pagination.totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginTop: "1rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: "0.4rem 0.8rem",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    color: page === 1 ? "#475569" : "#e2e8f0",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    fontSize: "0.82rem",
                  }}
                >
                  ← Назад
                </button>
                <span style={{ color: "#64748b", fontSize: "0.82rem" }}>
                  Страница {uploads.pagination.page} из {uploads.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(uploads.pagination.totalPages, p + 1))}
                  disabled={page === uploads.pagination.totalPages}
                  style={{
                    padding: "0.4rem 0.8rem",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    color: page === uploads.pagination.totalPages ? "#475569" : "#e2e8f0",
                    cursor: page === uploads.pagination.totalPages ? "not-allowed" : "pointer",
                    fontSize: "0.82rem",
                  }}
                >
                  Вперёд →
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <p
            style={{
              color: "#1e3a5f",
              fontSize: "0.72rem",
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            Collector Bot Admin Dashboard · Railway PostgreSQL
          </p>
        </>
      )}
    </main>
  );
}
