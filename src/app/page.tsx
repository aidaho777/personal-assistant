import Link from "next/link";
import { db, schema } from "@/db";
import { sql, eq } from "drizzle-orm";

export const revalidate = 60;

const { uploads, users } = schema;

async function getStats() {
  try {
    const [filesRow, usersRow, tagsRow] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(uploads).where(eq(uploads.status, "success")),
      db.select({ c: sql<number>`count(*)::int` }).from(users),
      db.select({ c: sql<number>`count(distinct tag)::int` }).from(uploads).where(eq(uploads.status, "success")),
    ]);
    return {
      files: filesRow[0]?.c ?? 0,
      users: usersRow[0]?.c ?? 0,
      tags: tagsRow[0]?.c ?? 0,
    };
  } catch {
    return { files: 0, users: 0, tags: 0 };
  }
}

export default async function HomePage() {
  const stats = await getStats();

  const steps = [
    { icon: "📤", title: "Отправь файл в Telegram", desc: "Документ, фото, голосовое или текст — просто перешли боту." },
    { icon: "🏷️", title: "Бот организует по тегам", desc: "Добавь #тег в подписи — бот распределит файлы по папкам." },
    { icon: "☁️", title: "Файлы в Google Drive", desc: "Всё автоматически загружается в структурированные папки." },
  ];

  const features = [
    { icon: "📄", title: "Документы", desc: "PDF, DOCX, XLSX, TXT, CSV и другие форматы" },
    { icon: "🖼️", title: "Фото", desc: "JPG, PNG — с автоматической классификацией" },
    { icon: "🎤", title: "Голосовые", desc: "Yandex SpeechKit распознаёт речь в текст" },
    { icon: "📝", title: "Текст", desc: "Заметки и идеи сохраняются как файлы" },
    { icon: "#️⃣", title: "Теги", desc: "Структура папок по тегам в подписи" },
    { icon: "📊", title: "Статистика", desc: "Дашборд с графиками и аналитикой" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      {/* Header */}
      <header className="container mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <span className="text-lg font-bold">Personal Assistant</span>
        </div>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
          >
            Регистрация
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 py-16 sm:py-24 text-center">
        <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">
          🚀 AI-powered Telegram bot
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">
          Personal Assistant
        </h1>
        <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
          AI-powered Telegram бот для сбора и организации материалов в Google Drive.
          Отправляй файлы — бот автоматически структурирует их по тегам.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://t.me/proamdancebot"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold transition-colors flex items-center gap-2"
          >
            <span>✈️</span> Открыть бота
          </a>
          <Link
            href="/login"
            className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 font-semibold transition-colors"
          >
            Войти в дашборд
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-6 py-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Как это работает</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm hover:bg-white/10 transition-colors"
            >
              <div className="text-4xl mb-4">{step.icon}</div>
              <div className="text-xs text-blue-400 font-bold mb-2">ШАГ {i + 1}</div>
              <h3 className="text-xl font-bold mb-2">{step.title}</h3>
              <p className="text-slate-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Возможности</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-blue-500/30 transition-colors"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="container mx-auto px-6 py-16">
        <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/10 border border-blue-500/20 rounded-3xl p-10 sm:p-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Статистика</h2>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-4xl sm:text-5xl font-extrabold text-blue-400 mb-2">{stats.files}</div>
              <div className="text-sm sm:text-base text-slate-400">Загруженных файлов</div>
            </div>
            <div>
              <div className="text-4xl sm:text-5xl font-extrabold text-green-400 mb-2">{stats.users}</div>
              <div className="text-sm sm:text-base text-slate-400">Пользователей</div>
            </div>
            <div>
              <div className="text-4xl sm:text-5xl font-extrabold text-purple-400 mb-2">{stats.tags}</div>
              <div className="text-sm sm:text-base text-slate-400">Уникальных тегов</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Начни прямо сейчас</h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">
          Открой бота в Telegram и отправь первый файл. Регистрация в дашборде — опционально.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://t.me/proamdancebot"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold transition-colors flex items-center gap-2"
          >
            <span>✈️</span> Открыть бота
          </a>
          <Link
            href="/login"
            className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 font-semibold transition-colors"
          >
            Войти в дашборд
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16">
        <div className="container mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Personal Assistant</p>
          <div className="flex items-center gap-4">
            <Link href="/api/health" className="hover:text-slate-300 transition-colors">Статус</Link>
            <a href="https://t.me/proamdancebot" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Telegram</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
