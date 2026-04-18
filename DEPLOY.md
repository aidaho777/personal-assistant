# 🚀 Руководство по деплою — Collector Bot (Этап 0)

## Предварительные требования

- Аккаунт [Vercel](https://vercel.com) (бесплатный Hobby-план достаточен)
- Аккаунт [Railway](https://railway.app) (pay-as-you-go)
- Telegram-бот, созданный через [@BotFather](https://t.me/BotFather)
- Google Cloud проект с настроенным Service Account

---

## Шаг 1 — Настройка Google Drive

### 1.1 Создание Service Account

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com)
2. Создайте новый проект (или используйте существующий)
3. Включите **Google Drive API**: APIs & Services → Library → поиск "Google Drive API" → Enable
4. Перейдите в IAM & Admin → Service Accounts → **Create Service Account**
5. Имя: `collector-bot`, нажмите Create
6. Роль не нужна — нажмите Continue → Done
7. Нажмите на созданный аккаунт → вкладка **Keys** → Add Key → Create new key → **JSON**
8. Скачайте JSON-файл — это ваш `GOOGLE_SERVICE_ACCOUNT_JSON`

### 1.2 Настройка папки на Google Drive

1. Откройте [Google Drive](https://drive.google.com)
2. Создайте папку, например `AI_Collector_Root`
3. Правой кнопкой → **Поделиться** → введите email Service Account (вида `collector-bot@your-project.iam.gserviceaccount.com`) → роль **Редактор**
4. Скопируйте ID папки из URL: `https://drive.google.com/drive/folders/**ВОТ_ЭТО_ID**`

---

## Шаг 2 — PostgreSQL на Railway

1. Зайдите на [railway.app](https://railway.app) → New Project → **Add PostgreSQL**
2. После создания: вкладка **Variables** → скопируйте `DATABASE_URL`
3. Формат: `postgresql://postgres:password@containers-us-west-1.railway.app:5432/railway`

---

## Шаг 3 — Telegram Bot

1. Напишите [@BotFather](https://t.me/BotFather) команду `/newbot`
2. Введите имя и username бота
3. Скопируйте **токен** — это `TELEGRAM_BOT_TOKEN`
4. Сгенерируйте webhook secret: `openssl rand -hex 32` → это `TELEGRAM_WEBHOOK_SECRET`

---

## Шаг 4 — Деплой на Vercel

### 4.1 Подключение репозитория

1. Зайдите на [vercel.com](https://vercel.com) → New Project
2. Импортируйте репозиторий `personal-assistant` с GitHub
3. Framework Preset: **Next.js** (определится автоматически)

### 4.2 Переменные окружения

В Vercel → Settings → Environment Variables добавьте:

| Переменная | Значение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен от BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Сгенерированный секрет |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Содержимое JSON-файла **в одну строку** |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID папки на Drive |
| `DATABASE_URL` | Connection string от Railway |
| `NEXT_PUBLIC_APP_URL` | URL вашего деплоя (напр. `https://collector.vercel.app`) |

> **Важно:** `GOOGLE_SERVICE_ACCOUNT_JSON` нужно вставить как одну строку без переносов.
> Преобразовать: `cat service-account.json | tr -d '\n'`

### 4.3 Деплой

Нажмите **Deploy**. После успешного деплоя скопируйте URL (напр. `https://collector-bot.vercel.app`).

---

## Шаг 5 — Инициализация базы данных

```bash
# Установите зависимости локально
npm install

# Создайте .env из примера
cp .env.example .env
# Заполните .env реальными значениями

# Применить схему к Railway PostgreSQL
npm run db:push

# Добавить себя в whitelist (замените ID на свой Telegram ID)
# Узнать свой ID: написать @userinfobot в Telegram
ADMIN_TELEGRAM_ID=123456789 ADMIN_USERNAME=your_username ADMIN_FIRST_NAME=YourName npx tsx scripts/seed.ts
```

---

## Шаг 6 — Регистрация Webhook

```bash
# Убедитесь, что NEXT_PUBLIC_APP_URL в .env указывает на ваш Vercel URL
npm run set-webhook
```

Ожидаемый вывод:
```
Setting webhook to: https://collector-bot.vercel.app/api/telegram/webhook
Response: { "ok": true, "result": true, "description": "Webhook was set" }
✅ Webhook set successfully!
```

---

## Шаг 7 — Проверка

1. Откройте `https://your-app.vercel.app/api/health` — должно вернуть:
   ```json
   { "status": "healthy", "services": { "database": "ok", "googleDrive": "ok" } }
   ```
2. Напишите боту `/start` — должно прийти приветствие
3. Отправьте файл с подписью `#Тест` — файл должен появиться в папке `Тест` на Google Drive
4. Выполните `/stats` — должна показаться статистика

---

## Критерии приёмки (из ТЗ)

- [ ] Бот развёрнут и доступен 24/7
- [ ] Неавторизованный пользователь получает сообщение с его ID
- [ ] PDF с подписью `#Договора` → папка `Договора` на Drive
- [ ] Голосовое сообщение → `.ogg` файл на Drive
- [ ] Текстовое сообщение → `.txt` файл на Drive
- [ ] Бот отвечает ссылкой на загруженный файл
- [ ] `/stats` показывает корректную статистику из PostgreSQL
- [ ] Код на TypeScript, структурирован для расширения

---

## Troubleshooting

| Проблема | Решение |
|---|---|
| Webhook не регистрируется | Проверьте `NEXT_PUBLIC_APP_URL` — должен быть HTTPS |
| `DATABASE_URL is not set` при деплое | Убедитесь, что переменная добавлена в Vercel, не только в `.env` |
| Drive: `Permission denied` | Убедитесь, что Service Account email добавлен как Editor в папку |
| Бот не отвечает | Проверьте `/api/health` и логи в Vercel → Functions |
| Файл > 20 MB | Telegram Bot API ограничивает скачивание 20 МБ — это ожидаемое поведение |
