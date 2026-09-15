# 🤖 Personal Assistant

Telegram-бот — единственная точка захвата. Задачи уходят в **Todoist**, всё остальное (файлы, фото, голосовые, заметки) — в **Google Drive** и в RAG-индекс. Дважды в день бот сам присылает сводку с кнопками.

**Стек:** TypeScript · Next.js 14 (App Router) · Telegraf · OpenAI · Todoist API v1 · Google Drive API v3 · Yandex SpeechKit · Drizzle ORM · PostgreSQL (Railway) · pgvector

---

## 🧭 Как это работает

```
                  ┌─────────────────────────────────────────┐
   Telegram ──────▶  LLM-роутер (gpt-4o-mini, tool-calling)  │
  текст/голос      └───────────────┬─────────────┬───────────┘
                                   │             │
                          create_tasks       save_note
                                   │             │
                                   ▼             ▼
                              Todoist      Google Drive
                           (+напоминания)   + pgvector RAG
                                   │
                    09:00 / 21:00 сводки с кнопками
                          ✅ · 📅 завтра · 🕐 +2ч
```

- **Текст и голос идут одним путём.** Голосовое сначала распознаётся SpeechKit, дальше расшифровка обрабатывается ровно как текст. `.ogg` и `.txt` всё равно ложатся в Drive, расшифровка — в `uploads.transcription`.
- **Даты не парсятся в коде.** Роутер отдаёт срок сырой русской фразой («завтра в 10», «каждый понедельник»), Todoist разбирает её сам (`due_string` + `due_lang: "ru"`).
- **Одно сообщение — несколько задач.** «Купить молоко, и ещё в пятницу отправить отчёт» → две отдельные задачи.
- **Не задача — заметка.** Мысль без действия уходит в Drive и в RAG-индекс, задача не создаётся.
- **Хештег = проект.** `#Ремонт` → задача в проект «Ремонт», если имя совпало точно; иначе Inbox.

Веб-часть (Vercel) осталась только для auth, RAG-чата и загрузки документов. Канбана задач больше нет — интерфейс задач это Todoist.

---

## 📁 Структура

```
├── src/
│   ├── app/
│   │   ├── api/            # auth, chat, rag, telegram/webhook, health, user
│   │   └── dashboard/      # Dashboard · AI Chat · Settings
│   ├── db/
│   │   ├── schema.ts       # users · uploads · web_users · document_chunks · linked_accounts
│   │   └── index.ts        # DB singleton (ленивый)
│   ├── lib/                # env, helpers, fetch-with-retry
│   └── services/
│       ├── bot.ts              # Telegraf: команды, хендлеры, callback-кнопки
│       ├── message-router.ts   # LLM-роутер: create_tasks | save_note
│       ├── todoist.ts          # Todoist API v1
│       ├── summaries.ts        # Утренняя и вечерняя сводки
│       ├── yandex-speechkit.ts # Распознавание речи
│       ├── google-drive.ts     # Папки, загрузка, health
│       ├── document-indexer.ts # Чанки + эмбеддинги (RAG)
│       └── upload-service.ts   # Журнал загрузок + статистика
├── scripts/
│   ├── polling.ts                  # Рантайм бота (Railway) + cron сводок
│   ├── todoist-smoke.ts            # Проверка связи с Todoist
│   ├── migrate-tasks-to-todoist.ts # Одноразовый перенос старых задач
│   └── set-webhook.ts
└── drizzle/                # Миграции
```

**Два рантайма:** бот живёт на Railway (`scripts/polling.ts`, long polling), веб — на Vercel. Роутер, сводки и cron работают только в polling-процессе.

---

## 🚀 Быстрый старт

```bash
npm install
cp .env.example .env    # заполнить
npm run db:migrate
ADMIN_TELEGRAM_ID=123456789 ADMIN_USERNAME=your_username npx tsx scripts/seed.ts
```

### Переменные окружения

| Переменная | Описание |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Строка для верификации вебхуков |
| `TODOIST_API_TOKEN` | Todoist → Settings → Integrations → Developer |
| `TIMEZONE` | Часовой пояс сводок, по умолчанию `Europe/Oslo` |
| `OPENAI_API_KEY` | Роутер (gpt-4o-mini) и эмбеддинги |
| `YANDEX_CLOUD_API_KEY` / `YANDEX_CLOUD_FOLDER_ID` | SpeechKit. Без них голос просто ляжет файлом |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON-ключ Service Account (в одну строку) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID корневой папки на Drive |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Веб-авторизация |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google-вход в дашборд |

### Google Drive

1. Проект в [Google Cloud Console](https://console.cloud.google.com) → включить **Google Drive API**
2. **Service Account** → скачать JSON-ключ
3. Создать корневую папку на Drive, расшарить на email Service Account с правами **Editor**
4. ID папки из URL → `GOOGLE_DRIVE_ROOT_FOLDER_ID`

### Todoist

Токен: Todoist → Settings → Integrations → Developer → API token. Проверка связи:

```bash
npx tsx scripts/todoist-smoke.ts   # создаёт задачу и сразу закрывает её
```

---

## 🚢 Деплой

- **Railway** — бот и PostgreSQL. `npm start` поднимает polling-процесс.
- **Vercel** — веб-часть. Переменные из `.env` в Settings → Environment Variables.

```bash
npm run db:migrate   # применить миграции
```

---

## 📋 Команды бота

| Команда | Описание |
|---|---|
| `/start` | Приветствие и инструкция |
| `/help` | Справка по форматам и тегам |
| `/tasks` | Задачи на сегодня + просроченные (Todoist) |
| `/upcoming` | Задачи на ближайшие 2 дня (Todoist) |
| `/status` | Проверка БД и Google Drive |
| `/stats` | Статистика: всего, сегодня, топ теги |
| `/list [тег]` | Последние 5 файлов (+ фильтр по тегу) |

### Сводки

| Когда | Что | Кнопки |
|---|---|---|
| 09:00 | Задачи на сегодня + просроченные, число вчерашних записей | ✅ · 📅 завтра · 🕐 +2ч |
| 21:00 | Закрытое за день + открытое с дедлайном сегодня | 📅 завтра · 📅 понедельник · ❌ снять |

Утренняя приходит всегда, даже когда задач нет. Время — по `TIMEZONE`.

---

## 🏷 Тегирование

- `#ИмяТега` в подписи файла или тексте → подпапка `ИмяТега` на Drive
- Если имя тега точно совпадает с проектом Todoist, задача уедет в этот проект
- Без тега → `Inbox`. Несколько тегов → берётся первый

---

## 🔒 Безопасность

- Бот приватный: только пользователи из таблицы `users` (whitelist)
- Вебхук защищён `secret_token` (заголовок `X-Telegram-Bot-Api-Secret-Token`)
- Все ключи — в переменных окружения, не в коде
- MD5-дедупликация файлов

---

## 🧪 NPM-скрипты

```bash
npm run dev            # Локальный Next.js
npm run build          # Production build (web + polling)
npm run start:polling  # Бот локально
npm run db:generate    # Сгенерировать миграцию из схемы
npm run db:migrate     # Применить миграции
npm run db:studio      # Drizzle Studio
npm run set-webhook    # Зарегистрировать Telegram webhook
```
