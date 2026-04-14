export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>🤖 Collector Bot</h1>
      <p>Telegram-бот для сбора материалов в Google Drive.</p>
      <p>
        <strong>Статус:</strong>{" "}
        <a href="/api/health">Проверить здоровье сервиса</a>
      </p>
      <hr />
      <p style={{ color: "#888", fontSize: "0.9rem" }}>
        Этап 0 — AI Personal Assistant · Только надёжный сбор данных
      </p>
    </main>
  );
}
