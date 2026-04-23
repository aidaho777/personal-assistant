"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Floating task card ──────────────────────────────────────────────────────
function TaskCard({
  title, tag, color, emoji, style
}: {
  title: string; tag: string; color: string; emoji: string;
  style?: React.CSSProperties;
}) {
  const colors: Record<string, { bg: string; border: string; tag: string }> = {
    purple: { bg: "bg-purple-50", border: "border-purple-200", tag: "bg-purple-100 text-purple-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", tag: "bg-blue-100 text-blue-700" },
    green: { bg: "bg-green-50", border: "border-green-200", tag: "bg-green-100 text-green-700" },
    orange: { bg: "bg-orange-50", border: "border-orange-200", tag: "bg-orange-100 text-orange-700" },
    pink: { bg: "bg-pink-50", border: "border-pink-200", tag: "bg-pink-100 text-pink-700" },
  };
  const c = colors[color] ?? colors.blue;
  return (
    <div
      className={`${c.bg} ${c.border} border rounded-2xl p-4 shadow-lg w-52`}
      style={style}
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-sm font-semibold text-slate-800 leading-tight mb-2">{title}</div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.tag}`}>{tag}</span>
    </div>
  );
}

// ─── Feature card ────────────────────────────────────────────────────────────
function FeatureCard({
  icon, title, desc, color
}: {
  icon: string; title: string; desc: string; color: string;
}) {
  const colors: Record<string, string> = {
    purple: "from-purple-500 to-purple-600",
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-emerald-600",
    orange: "from-orange-500 to-orange-600",
    pink: "from-pink-500 to-rose-600",
    cyan: "from-cyan-500 to-cyan-600",
  };
  return (
    <div className="group bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color] ?? colors.blue} flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Main landing page ───────────────────────────────────────────────────────
export default function Home() {
  const [formData, setFormData] = useState({ name: "", source: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              T
            </div>
            <span className="font-bold text-slate-900 text-lg">TaskFlow</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Возможности</a>
            <a href="#how" className="hover:text-slate-900 transition-colors">Как работает</a>
            <a href="#contact" className="hover:text-slate-900 transition-colors">Ранний доступ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium">
              Войти
            </Link>
            <Link
              href="/login"
              className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              Начать бесплатно
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-32 pb-20 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-white to-blue-50 pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-200 rounded-full blur-3xl opacity-20 pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-blue-200 rounded-full blur-3xl opacity-20 pointer-events-none" />

        <div className="relative max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <span>✨</span>
                <span>Голосовое управление задачами</span>
              </div>
              <h1 className="text-5xl lg:text-6xl font-black text-slate-900 leading-tight mb-6">
                Задачи,{" "}
                <span className="bg-gradient-to-r from-violet-600 to-blue-500 bg-clip-text text-transparent">
                  которые ты
                </span>{" "}
                реально делаешь
              </h1>
              <p className="text-xl text-slate-500 leading-relaxed mb-8 max-w-lg">
                Таск-трекер с интуитивным голосовым управлением и красивыми карточками.
                Просто скажи что нужно сделать — и готово.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-8 py-4 rounded-2xl text-base transition-all shadow-lg shadow-violet-200 hover:shadow-xl hover:-translate-y-0.5"
                >
                  Начать бесплатно →
                </Link>
                <a
                  href="#how"
                  className="bg-white hover:bg-slate-50 text-slate-700 font-semibold px-8 py-4 rounded-2xl text-base border border-slate-200 transition-all hover:-translate-y-0.5"
                >
                  Посмотреть как работает
                </a>
              </div>
              <div className="flex items-center gap-6 mt-8 text-sm text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Бесплатно навсегда</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Без кредитки</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Telegram-бот</span>
                </div>
              </div>
            </div>

            {/* Right: floating cards */}
            <div className="relative h-96 hidden lg:block">
              <TaskCard
                title="Подготовить презентацию для клиента"
                tag="Работа"
                color="purple"
                emoji="📊"
                style={{ position: "absolute", top: "0", left: "10%", transform: "rotate(-3deg)" }}
              />
              <TaskCard
                title="Купить продукты: молоко, хлеб, яйца"
                tag="Личное"
                color="green"
                emoji="🛒"
                style={{ position: "absolute", top: "30%", right: "0", transform: "rotate(2deg)" }}
              />
              <TaskCard
                title="Записаться на тренировку в пятницу"
                tag="Здоровье"
                color="orange"
                emoji="💪"
                style={{ position: "absolute", bottom: "5%", left: "5%", transform: "rotate(-1deg)" }}
              />
              <TaskCard
                title="Прочитать книгу по продуктовому дизайну"
                tag="Обучение"
                color="blue"
                emoji="📚"
                style={{ position: "absolute", top: "15%", left: "40%", transform: "rotate(4deg)" }}
              />
              <div
                className="absolute bottom-20 right-10 bg-white rounded-2xl shadow-xl p-4 border border-slate-100 flex items-center gap-3"
                style={{ transform: "rotate(-2deg)" }}
              >
                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-blue-500 rounded-xl flex items-center justify-center text-white text-lg">
                  🎤
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Голосовой ввод</div>
                  <div className="text-xs text-slate-400">Слушаю...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof bar ────────────────────────────────────────────── */}
      <section className="py-10 border-y border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-8 text-slate-400 text-sm font-medium">
            <span>Используют каждый день:</span>
            {["Дизайнеры", "Разработчики", "Менеджеры", "Фрилансеры", "Студенты"].map(role => (
              <div key={role} className="flex items-center gap-2">
                <div className="w-2 h-2 bg-violet-400 rounded-full" />
                <span>{role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <span>⚡</span>
              <span>Возможности</span>
            </div>
            <h2 className="text-4xl font-black text-slate-900 mb-4">
              Всё что нужно для{" "}
              <span className="bg-gradient-to-r from-violet-600 to-blue-500 bg-clip-text text-transparent">
                продуктивности
              </span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Никаких сложных настроек. Просто начни работать — интерфейс сам подстроится под тебя.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon="🎤"
              title="Голосовое управление"
              desc="Надиктуй задачу голосом прямо в Telegram — бот распознает речь и создаст карточку автоматически."
              color="purple"
            />
            <FeatureCard
              icon="🃏"
              title="Красивые карточки"
              desc="Задачи в виде карточек с тегами, приоритетами и цветами. Drag & drop для организации."
              color="blue"
            />
            <FeatureCard
              icon="📱"
              title="Telegram-бот"
              desc="Управляй задачами прямо из Telegram. Не нужно открывать отдельное приложение."
              color="green"
            />
            <FeatureCard
              icon="☁️"
              title="Google Drive синхронизация"
              desc="Все файлы и вложения автоматически сохраняются в твой Google Drive."
              color="orange"
            />
            <FeatureCard
              icon="🏷️"
              title="Умные теги"
              desc="Организуй задачи по проектам, контексту или приоритету. Фильтрация в один клик."
              color="pink"
            />
            <FeatureCard
              icon="📊"
              title="Аналитика продуктивности"
              desc="Смотри сколько задач ты выполняешь, в какие дни ты наиболее продуктивен."
              color="cyan"
            />
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="py-24 px-6 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <span>🚀</span>
              <span>Как работает</span>
            </div>
            <h2 className="text-4xl font-black text-white mb-4">
              Три шага до{" "}
              <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                продуктивности
              </span>
            </h2>
            <p className="text-lg text-slate-400 max-w-xl mx-auto">
              Начни за 2 минуты без настроек и инструкций
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: "📝",
                title: "Зарегистрируйся",
                desc: "Создай аккаунт за 30 секунд. Никаких лишних данных — только email и пароль.",
                color: "from-violet-500 to-purple-600",
              },
              {
                step: "02",
                icon: "🤖",
                title: "Подключи Telegram",
                desc: "Привяжи Telegram-бота и начни отправлять задачи голосом, фото или текстом.",
                color: "from-blue-500 to-cyan-600",
              },
              {
                step: "03",
                icon: "✅",
                title: "Работай и выполняй",
                desc: "Все задачи в красивом интерфейсе. Отмечай выполненные и следи за прогрессом.",
                color: "from-green-500 to-emerald-600",
              },
            ].map(({ step, icon, title, desc, color }) => (
              <div key={step} className="relative">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center text-2xl mb-5 shadow-lg`}>
                  {icon}
                </div>
                <div className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">{step}</div>
                <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
                <p className="text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-slate-900 mb-4">Что говорят пользователи</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Алина К.",
                role: "UX-дизайнер",
                text: "Наконец-то таск-трекер, который не выглядит как Excel из 2010-х. Голосовой ввод — это просто магия.",
                avatar: "👩‍🎨",
              },
              {
                name: "Дима Р.",
                role: "Фронтенд-разработчик",
                text: "Добавляю задачи прямо из Telegram не выходя из чата. Экономит кучу времени.",
                avatar: "👨‍💻",
              },
              {
                name: "Маша В.",
                role: "Продакт-менеджер",
                text: "Карточки такие красивые, что хочется добавлять больше задач просто чтобы смотреть на них.",
                avatar: "👩‍💼",
              },
            ].map(({ name, role, text, avatar }) => (
              <div key={name} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="text-3xl mb-4">{avatar}</div>
                <p className="text-slate-700 leading-relaxed mb-4 text-sm">"{text}"</p>
                <div>
                  <div className="font-bold text-slate-900 text-sm">{name}</div>
                  <div className="text-xs text-slate-400">{role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ─────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gradient-to-br from-violet-600 to-blue-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-5xl font-black text-white mb-6 leading-tight">
            Начни управлять задачами голосом
          </h2>
          <p className="text-xl text-violet-100 mb-10 leading-relaxed">
            Присоединяйся к тысячам пользователей, которые уже делают больше за меньшее время
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-white hover:bg-slate-50 text-violet-700 font-bold px-10 py-4 rounded-2xl text-lg transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
            >
              Зарегистрироваться бесплатно
            </Link>
            <Link
              href="/login"
              className="bg-white/10 hover:bg-white/20 text-white font-bold px-10 py-4 rounded-2xl text-lg border border-white/20 transition-all hover:-translate-y-1"
            >
              Войти в аккаунт
            </Link>
          </div>
        </div>
      </section>

      {/* ── Contact / Lead form ─────────────────────────────────────────── */}
      <section id="contact" className="py-24 px-6 bg-white">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
              <span>💌</span>
              <span>Ранний доступ</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3">
              Хочешь быть первым?
            </h2>
            <p className="text-slate-500">
              Оставь имя и расскажи откуда узнал — пришлём приглашение на закрытое бета-тестирование
            </p>
          </div>

          {submitted ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-xl font-bold text-green-800 mb-2">Отлично, {formData.name}!</h3>
              <p className="text-green-600">Мы записали тебя в список. Скоро пришлём приглашение!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-slate-50 rounded-2xl p-8 border border-slate-100 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Как тебя зовут? <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    placeholder="Введи своё имя"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Откуда узнал о нас?
                  </label>
                  <select
                    value={formData.source}
                    onChange={e => setFormData(p => ({ ...p, source: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm"
                  >
                    <option value="">Выбери вариант</option>
                    <option value="telegram">Telegram</option>
                    <option value="instagram">Instagram</option>
                    <option value="vk">ВКонтакте</option>
                    <option value="friend">Рассказал друг</option>
                    <option value="google">Google / поиск</option>
                    <option value="youtube">YouTube</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !formData.name.trim()}
                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all text-sm shadow-sm hover:shadow-md"
                >
                  {submitting ? "Отправляем..." : "Хочу ранний доступ ✨"}
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center mt-4">
                Никакого спама. Только важные обновления.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="py-12 px-6 border-t border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-600 to-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">
              T
            </div>
            <span className="font-bold text-slate-900">TaskFlow</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="/login" className="hover:text-slate-700 transition-colors">Войти</Link>
            <Link href="/login" className="hover:text-slate-700 transition-colors">Регистрация</Link>
            <Link href="/dashboard" className="hover:text-slate-700 transition-colors">Dashboard</Link>
            <a href="/api/health" className="hover:text-slate-700 transition-colors">API Status</a>
          </div>
          <div className="text-xs text-slate-400">
            © 2026 TaskFlow · Сделано с ❤️
          </div>
        </div>
      </footer>

    </div>
  );
}
