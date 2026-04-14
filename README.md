# 🤖 Collector Bot — Этап 0

Telegram-бот для сбора материалов (файлы, фото, голосовые, текст) и структурированной загрузки в Google Drive.

**Стек:** TypeScript · Next.js 14 (App Router) · Telegraf · Google Drive API v3 · Drizzle ORM · PostgreSQL (Railway)

---

## 📁 Структура проекта

```
collector/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── telegram/webhook/route.ts   # Telegram webhook endpoint
│   │   │   └── health/route.ts             # Health check API
│   │   ├── layout.tsx
│   │   └── page.tsx                        # Placeholder для дашборда
│   ├── db/
│   │   ├── schema.ts                       # Drizzle schema (users + uploads)
│   │   └── index.ts                        # DB connection singleton
│   ├── lib/
│   │   ├── env.ts                          # Env validation
│   │   └── helpers.ts                      # Tags, naming, hashing, MIME
│   └── services/
│       ├── bot.ts                          # Telegraf bot: commands + handlers
│       ├── google-drive.ts                 # Drive: folders, upload, health
│       ├── upload-service.ts               # Upload journal CRUD + stats
│       └── user-service.ts                 # Auth / whitelist
├── scripts/
│   ├── set-webhook.ts                      # Register Telegram webhook
│   └── seed.ts                             # Add admin user to whitelist
├── drizzle.config.ts
├── next.config.js
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Скопируйте `.env.example` → `.env` и заполните:

```bash
cp .env.example .env
```

| Переменная | Описание |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Произвольная строка для верификации вебхуков |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON-ключ Service Account (целиком, в одну строку) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID корневой папки на Drive |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | URL деплоя (например `https://collector.vercel.app`) |

### 3. Настройка Google Drive

1. Создайте проект в [Google Cloud Console](https://console.cloud.google.com)
2. Включите **Google Drive API**
3. Создайте **Service Account** → скачайте JSON-ключ
4. Создайте корневую папку на Google Drive (напр. `AI_Collector_Root`)
5. Расшарьте папку на email Service Account с правами **Editor**
6. Скопируйте ID папки из URL → в `GOOGLE_DRIVE_ROOT_FOLDER_ID`

### 4. Инициализация базы данных

```bash
# Создать/обновить таблицы
npm run db:push

# Добавить админа в whitelist
ADMIN_TELEGRAM_ID=123456789 ADMIN_USERNAME=your_username npx tsx scripts/seed.ts
```

### 5. Запуск локально

```bash
npm run dev
```

Для локальной разработки используйте [ngrok](https://ngrok.com) для туннеля:

```bash
ngrok http 3000
# Скопируйте HTTPS URL → NEXT_PUBLIC_APP_URL
```

### 6. Регистрация вебхука

```bash
npm run set-webhook
```

---

## 🚢 Деплой

### Vercel (Next.js)

1. Подключите репозиторий к Vercel
2. Добавьте все переменные из `.env` в Settings → Environment Variables
3. Деплой произойдёт автоматически

### Railway (PostgreSQL)

1. Создайте проект → Add PostgreSQL
2. Скопируйте `DATABASE_URL` из Variables

### После деплоя

```bash
# Применить миграции к Railway DB
npm run db:push

# Зарегистрировать вебхук на Vercel URL
npm run set-webhook
```

---

## 📋 Команды бота

| Команда | Описание |
|---|---|
| `/start` | Приветствие и инструкция |
| `/help` | Справка по форматам и тегам |
| `/status` | Проверка БД и Google Drive |
| `/stats` | Статистика: всего, сегодня, топ теги |
| `/list [тег]` | Последние 5 файлов (+ фильтр по тегу) |

---

## 🏷 Тегирование

- Добавьте `#ИмяТега` в подпись файла или текст сообщения
- Файл сохранится в подпапку `ИмяТега` на Drive
- Без тега → папка `Inbox`
- Несколько тегов → используется первый

---

## 🔒 Безопасность

- Бот приватный: только пользователи из таблицы `users` (whitelist)
- Вебхук защищён `secret_token` (заголовок `X-Telegram-Bot-Api-Secret-Token`)
- Все ключи — в переменных окружения, не в коде
- MD5-дедупликация файлов

---

## 🧪 NPM-скрипты

```bash
npm run dev          # Локальный сервер Next.js
npm run build        # Production build
npm run db:push      # Применить схему к БД
npm run db:studio    # Drizzle Studio (GUI для БД)
npm run set-webhook  # Зарегистрировать Telegram webhook
```
