export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0d1b4b 0%, #1a2d6b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        padding: "2rem",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "16px",
          padding: "3rem",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤖</div>
        <h1
          style={{
            color: "#fff",
            fontSize: "1.6rem",
            fontWeight: 800,
            margin: "0 0 0.5rem",
          }}
        >
          Collector Bot
        </h1>
        <p
          style={{
            color: "#93c5fd",
            fontSize: "0.95rem",
            margin: "0 0 2rem",
            lineHeight: 1.6,
          }}
        >
          Telegram-бот для сбора материалов и структурированной загрузки в Google Drive.
        </p>

        <div
          style={{
            background: "rgba(255,255,255,0.07)",
            borderRadius: "10px",
            padding: "1.2rem",
            marginBottom: "1.5rem",
            textAlign: "left",
          }}
        >
          <p style={{ color: "#94a3b8", fontSize: "0.8rem", margin: "0 0 0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Поддерживаемые форматы
          </p>
          {[
            ["📄", "Документы", "PDF, DOCX, XLSX, TXT, CSV"],
            ["🖼️", "Фото", "JPG, PNG и другие изображения"],
            ["🎤", "Голос", "Голосовые сообщения Telegram (OGG)"],
            ["📝", "Текст", "Заметки и идеи"],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.6rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1rem" }}>{icon}</span>
              <div>
                <span style={{ color: "#e2e8f0", fontSize: "0.85rem", fontWeight: 600 }}>{title}</span>
                <span style={{ color: "#64748b", fontSize: "0.8rem" }}> — {desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.07)",
            borderRadius: "10px",
            padding: "1.2rem",
            marginBottom: "1.5rem",
            textAlign: "left",
          }}
        >
          <p style={{ color: "#94a3b8", fontSize: "0.8rem", margin: "0 0 0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Команды бота
          </p>
          {[
            ["/start", "Приветствие и инструкция"],
            ["/help", "Справка по форматам и тегам"],
            ["/status", "Проверка БД и Google Drive"],
            ["/stats", "Статистика загрузок"],
            ["/list [тег]", "Последние 5 файлов"],
          ].map(([cmd, desc]) => (
            <div key={cmd} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <code style={{ color: "#34d399", fontSize: "0.8rem", minWidth: "120px", fontFamily: "monospace" }}>{cmd}</code>
              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>{desc}</span>
            </div>
          ))}
        </div>

        <a
          href="/api/health"
          style={{
            display: "inline-block",
            background: "rgba(59,130,246,0.2)",
            border: "1px solid rgba(59,130,246,0.4)",
            color: "#93c5fd",
            borderRadius: "8px",
            padding: "0.6rem 1.2rem",
            fontSize: "0.85rem",
            textDecoration: "none",
            marginBottom: "1.5rem",
          }}
        >
          🔍 Проверить статус сервиса
        </a>

        <p
          style={{
            color: "#475569",
            fontSize: "0.75rem",
            margin: 0,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: "1rem",
          }}
        >
          Этап 0 — AI Personal Assistant · Только надёжный сбор данных
        </p>
      </div>
    </main>
  );
}
