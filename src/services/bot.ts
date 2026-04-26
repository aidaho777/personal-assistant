import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { env } from "../lib/env";
import { getAuthorizedUser, checkDbConnection } from "./user-service";
import {
  createUploadRecord,
  updateUploadRecord,
  findDuplicateByMd5,
  getUserStats,
  getRecentUploads,
} from "./upload-service";
import {
  getOrCreateFolder,
  uploadFileToDrive,
  checkDriveConnection,
} from "./google-drive";
import {
  extractTag,
  buildFileName,
  md5,
  getMimeType,
  MAX_FILE_SIZE,
  formatSize,
} from "../lib/helpers";
import { recognizeSpeech } from "./yandex-speechkit";
import { extractTask } from "./task-extractor";
import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import type { User } from "../db/schema";

// ─── Task detection helpers ─────────────────────────────────────────────

const taskPatterns = [
  /(?:новая\s+)?задача\s*[-–:]\s*(.+)/i,
  /зафиксируй\s+задачу\s*[-–:]\s*(.+)/i,
  /добавь\s+задачу\s*[-–:]\s*(.+)/i,
  /создай\s+задачу\s*[-–:]\s*(.+)/i,
  /напомни\s+(?:мне\s+)?(?:что\s+)?(.+)/i,
  /нужно\s+(?:не\s+забыть\s+)?(.+)/i,
  /не\s+забудь\s+(.+)/i,
  /сделать\s*[-–:]\s*(.+)/i,
  /\btodo\s*[-–:]\s*(.+)/i,
  /\btask\s*[-–:]\s*(.+)/i,
];

const weekdays: Record<string, number> = {
  понедельник: 1, вторник: 2, среду: 3, среда: 3,
  четверг: 4, пятницу: 5, пятница: 5,
  субботу: 6, суббота: 6, воскресенье: 0,
};

function extractDateTime(text: string): { date: Date | null; cleanTitle: string } {
  let clean = text;
  let date: Date | null = null;
  const now = new Date();

  if (/\bпослезавтра\b/i.test(clean)) {
    date = new Date(now); date.setDate(date.getDate() + 2);
    clean = clean.replace(/\bпослезавтра\b/i, "");
  } else if (/\bзавтра\b/i.test(clean)) {
    date = new Date(now); date.setDate(date.getDate() + 1);
    clean = clean.replace(/\bзавтра\b/i, "");
  } else if (/\bсегодня\b/i.test(clean)) {
    date = new Date(now);
    clean = clean.replace(/\bсегодня\b/i, "");
  }

  const wdMatch = clean.match(/\b(?:в\s+)?(понедельник|вторник|среду?|четверг|пятницу?|субботу?|воскресенье)\b/i);
  if (wdMatch) {
    const target = weekdays[wdMatch[1].toLowerCase()];
    if (target !== undefined) {
      if (!date) date = new Date(now);
      const diff = ((target - date.getDay()) + 7) % 7 || 7;
      date.setDate(date.getDate() + diff);
    }
    clean = clean.replace(wdMatch[0], "");
  }

  const inMatch = clean.match(/\bчерез\s+(\d+)\s+(день|дня|дней|час|часа|часов)\b/i);
  if (inMatch) {
    const n = parseInt(inMatch[1]);
    if (!date) date = new Date(now);
    if (inMatch[2].startsWith("д")) date.setDate(date.getDate() + n);
    else date.setHours(date.getHours() + n);
    clean = clean.replace(inMatch[0], "");
  }

  const timeMatch = clean.match(/\bв\s+(\d{1,2})(?::(\d{2}))?\s*(?:час[аов]*|ч\.?)?\b/i);
  if (timeMatch) {
    if (!date) date = new Date(now);
    date.setHours(parseInt(timeMatch[1]), timeMatch[2] ? parseInt(timeMatch[2]) : 0, 0, 0);
    clean = clean.replace(timeMatch[0], "");
  }

  const cleanTitle = clean.replace(/\s{2,}/g, " ").replace(/^[-–,\s]+|[-–,\s]+$/g, "").trim();
  return { date, cleanTitle };
}

function matchTaskPattern(text: string): string | null {
  for (const pattern of taskPatterns) {
    const m = text.match(pattern);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

async function insertTask(userId: string, title: string, rawMessage: string, dueDate: Date | null): Promise<void> {
  await db.execute(drizzleSql`
    INSERT INTO tasks (user_id, title, raw_message, due_date, source, status, priority)
    VALUES (${userId}::uuid, ${title}, ${rawMessage}, ${dueDate ? dueDate.toISOString() : null}::timestamptz, 'telegram', 'todo', 'medium')
  `);
}

// ─── Bot singleton ──────────────────────────────────────────────────────

let bot: Telegraf | null = null;

export function getBot(): Telegraf {
  if (bot) return bot;

  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
  registerHandlers(bot);
  return bot;
}

// ─── Auth middleware ────────────────────────────────────────────────────

interface AuthContext extends Context {
  dbUser: User;
}

async function authMiddleware(ctx: Context, next: () => Promise<void>) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await getAuthorizedUser(BigInt(telegramId));
  if (!user) {
    await ctx.reply(
      `⛔ Доступ запрещен. Ваш ID: \`${telegramId}\`. Обратитесь к администратору.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  (ctx as AuthContext).dbUser = user;
  return next();
}

// ─── Register handlers ─────────────────────────────────────────────────

function registerHandlers(bot: Telegraf) {
  // Apply auth to all messages
  bot.use(authMiddleware);

  // ── Commands ──────────────────────────────────────────────────────

  bot.command("start", async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    await ctx.reply(
      `👋 Привет, ${user.firstName || user.username || "друг"}!\n\n` +
      `Я — *Collector Bot*. Отправь мне файл, фото, голосовое сообщение или текст, ` +
      `и я сохраню это в Google Drive.\n\n` +
      `📌 *Тегирование:* добавь хештег (например \`#ПроектА\`) в подпись или текст, ` +
      `чтобы файл попал в нужную папку. Без тега → папка \`Inbox\`.\n\n` +
      `Команды: /help /status /stats /list`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `📖 *Справка*\n\n` +
      `*Поддерживаемые форматы:*\n` +
      `• Документы: PDF, DOCX, XLSX, TXT, CSV\n` +
      `• Фото: сжатые и как документ\n` +
      `• Голосовые сообщения\n` +
      `• Текст: любые текстовые заметки\n\n` +
      `*Тегирование:*\n` +
      `Добавьте \`#ИмяТега\` в подпись к файлу или в текст.\n` +
      `Файл будет сохранён в папку с этим именем.\n` +
      `Без тега → папка \`Inbox\`.\n\n` +
      `*Ограничения:*\n` +
      `Макс. размер файла: 20 МБ.\n\n` +
      `*Команды:*\n` +
      `/stats — ваша статистика\n` +
      `/list — последние 5 файлов\n` +
      `/list ИмяТега — файлы по тегу\n` +
      `/status — проверка сервисов`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("status", async (ctx) => {
    const dbOk = await checkDbConnection();
    const driveOk = await checkDriveConnection();

    await ctx.reply(
      `🔍 *Статус сервисов*\n\n` +
      `• База данных: ${dbOk ? "✅ OK" : "❌ Недоступна"}\n` +
      `• Google Drive: ${driveOk ? "✅ OK" : "❌ Недоступен"}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("stats", async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const stats = await getUserStats(user.id);

    const tagsStr = stats.topTags.length > 0
      ? stats.topTags.map((t, i) => `  ${i + 1}. \`${t.tag}\` — ${t.count}`).join("\n")
      : "  Нет данных";

    await ctx.reply(
      `📊 *Ваша статистика*\n\n` +
      `Всего файлов: *${stats.total}*\n` +
      `За сегодня: *${stats.today}*\n\n` +
      `🏷 Топ-3 тега:\n${tagsStr}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("list", async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const args = ctx.message.text.split(" ").slice(1);
    const tag = args[0] || undefined;

    const items = await getRecentUploads(user.id, 5, tag);

    if (items.length === 0) {
      await ctx.reply("📭 Нет загруженных файлов" + (tag ? ` по тегу \`${tag}\`` : "") + ".", {
        parse_mode: "Markdown",
      });
      return;
    }

    const lines = items.map((item, i) => {
      const date = item.createdAt.toISOString().slice(0, 10);
      const link = item.driveUrl ? `[🔗 Drive](${item.driveUrl})` : "—";
      return `${i + 1}. \`${item.fileName}\`\n   📅 ${date} | 🏷 ${item.tag} | ${link}`;
    });

    await ctx.reply(
      `📂 *Последние загрузки*${tag ? ` (тег: ${tag})` : ""}:\n\n${lines.join("\n\n")}`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } }
    );
  });

  // /tasks command
  bot.command("tasks", async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    try {
      const rows = (await db.execute(drizzleSql`
        SELECT id, title, due_date
        FROM tasks
        WHERE user_id = ${user.id}::uuid AND status = 'todo'
        ORDER BY due_date ASC NULLS LAST
        LIMIT 10
      `)) as unknown as { id: string; title: string; due_date: string | null }[];

      if (rows.length === 0) {
        await ctx.reply("📋 У вас нет активных задач.");
        return;
      }

      const lines = rows.map((t, i) => {
        const due = t.due_date
          ? ` 📅 ${new Date(t.due_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`
          : "";
        return `${i + 1}. ${t.title}${due}`;
      });

      await ctx.reply(`📋 *Ваши задачи:*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("[Bot] /tasks error:", e);
      await ctx.reply("❌ Ошибка при получении задач.");
    }
  });

  // ── File handlers ─────────────────────────────────────────────────

  // Documents
  bot.on(message("document"), async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const doc = ctx.message.document;

    if (doc.file_size && doc.file_size > MAX_FILE_SIZE) {
      await ctx.reply(`❌ Файл слишком большой (${formatSize(doc.file_size)}). Максимальный размер: 20 МБ.`);
      return;
    }

    await processFile(ctx, user, {
      contentType: "document",
      fileId: doc.file_id,
      fileSize: doc.file_size ?? 0,
      originalName: doc.file_name ?? "unnamed",
      mimeType: doc.mime_type,
      caption: ctx.message.caption,
    });
  });

  // Photos
  bot.on(message("photo"), async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    // Take the largest photo size
    const photo = ctx.message.photo[ctx.message.photo.length - 1];

    await processFile(ctx, user, {
      contentType: "photo",
      fileId: photo.file_id,
      fileSize: photo.file_size ?? 0,
      originalName: `photo_${photo.file_unique_id}.jpg`,
      caption: ctx.message.caption,
    });
  });

  // Voice messages
  bot.on(message("voice"), async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const voice = ctx.message.voice;

    await processFile(ctx, user, {
      contentType: "voice",
      fileId: voice.file_id,
      fileSize: voice.file_size ?? 0,
      originalName: `voice_${Date.now()}.ogg`,
      caption: undefined, // voice messages don't have captions in Telegram
    });
  });

  // Text messages (notes or tasks)
  bot.on(message("text"), async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const text = ctx.message.text;

    if (text.startsWith("/")) return;

    // 1. Regex-based task detection (fast, no API call)
    const regexMatch = matchTaskPattern(text);
    if (regexMatch) {
      const { date, cleanTitle } = extractDateTime(regexMatch);
      const title = cleanTitle || regexMatch;
      try {
        await insertTask(user.id, title, text, date);
        const dateStr = date
          ? date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
          : "без даты";
        await ctx.reply(`✅ Задача добавлена: *${title}*\n📅 ${dateStr}`, { parse_mode: "Markdown" });
      } catch (e) {
        console.error("[Collector] Task insert error:", e);
        await ctx.reply("❌ Не удалось сохранить задачу.");
      }
      return;
    }

    // 2. LLM-based task detection (fallback for natural language)
    try {
      const taskResult = await extractTask(text);
      if (taskResult.isTask && taskResult.title) {
        const dueDate = taskResult.dueDate ? new Date(taskResult.dueDate) : null;
        await insertTask(user.id, taskResult.title, text, dueDate);
        const dateStr = dueDate
          ? dueDate.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
          : "без даты";
        await ctx.reply(`✅ Задача добавлена: *${taskResult.title}*\n📅 ${dateStr}`, { parse_mode: "Markdown" });
        return;
      }
    } catch (taskErr) {
      console.error("[Collector] Task extraction error:", taskErr);
    }

    // Not a task — save as note
    const tag = extractTag(text);
    const fileName = buildFileName("text", `note_${Date.now()}.txt`);
    const buffer = Buffer.from(text, "utf-8");

    const record = await createUploadRecord({
      userId: user.id,
      messageId: BigInt(ctx.message.message_id),
      contentType: "text",
      originalName: "text_note",
      fileName,
      fileSize: buffer.length,
      tag,
      status: "pending",
    });

    try {
      const folderId = await getOrCreateFolder(tag);
      const hash = md5(buffer);

      const dup = await findDuplicateByMd5(user.id, hash);
      if (dup) {
        await ctx.reply(
          `⚠️ Эта заметка уже была загружена ранее.\n🔗 [Открыть в Drive](${dup.driveUrl})`,
          { parse_mode: "Markdown", link_preview_options: { is_disabled: true } }
        );
        await updateUploadRecord(record.id, { status: "success", fileMd5: hash, driveFileId: dup.driveFileId, driveFolderId: dup.driveFolderId, driveUrl: dup.driveUrl });
        return;
      }

      const result = await uploadFileToDrive(buffer, fileName, "text/plain", folderId);

      await updateUploadRecord(record.id, {
        driveFileId: result.fileId,
        driveFolderId: result.folderId,
        driveUrl: result.webViewLink,
        fileMd5: hash,
        status: "success",
      });

      await ctx.reply(
        `✅ Заметка сохранена в папку \`${tag}\`\n🔗 [Открыть в Drive](${result.webViewLink})`,
        { parse_mode: "Markdown", link_preview_options: { is_disabled: true } }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      await updateUploadRecord(record.id, { status: "error", errorMessage: errMsg });
      await ctx.reply(`❌ Ошибка загрузки заметки. Пожалуйста, попробуйте позже.`);
      console.error("[Collector] Text upload error:", err);
    }
  });
}

// ─── Generic file processor ─────────────────────────────────────────────

interface FileInput {
  contentType: "document" | "photo" | "voice";
  fileId: string;
  fileSize: number;
  originalName: string;
  mimeType?: string;
  caption?: string;
}

async function processFile(ctx: Context, user: User, input: FileInput) {
  const tag = extractTag(input.caption);
  const fileName = buildFileName(input.contentType, input.originalName);
  const mimeType = input.mimeType ?? getMimeType(input.contentType, input.originalName);

  // Create pending upload record
  const record = await createUploadRecord({
    userId: user.id,
    messageId: BigInt(ctx.message!.message_id),
    contentType: input.contentType,
    originalName: input.originalName,
    fileName,
    fileSize: input.fileSize,
    tag,
    status: "pending",
  });

  try {
    // Download file from Telegram
    const fileLink = await ctx.telegram.getFileLink(input.fileId);
    const response = await fetch(fileLink.href);
    if (!response.ok) throw new Error(`Failed to download from Telegram: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    // MD5 dedup check
    const hash = md5(buffer);
    const dup = await findDuplicateByMd5(user.id, hash);
    if (dup) {
      await ctx.reply(
        `⚠️ Этот файл уже был загружен ранее: \`${dup.fileName}\`\n🔗 [Открыть в Drive](${dup.driveUrl})`,
        { parse_mode: "Markdown", link_preview_options: { is_disabled: true } }
      );
      await updateUploadRecord(record.id, { status: "success", fileMd5: hash, driveFileId: dup.driveFileId, driveFolderId: dup.driveFolderId, driveUrl: dup.driveUrl });
      return;
    }

    // Upload to Drive
    const folderId = await getOrCreateFolder(tag);
    const result = await uploadFileToDrive(buffer, fileName, mimeType, folderId);

    let transcriptionText = "";
    if (input.contentType === "voice") {
      try {
        transcriptionText = await recognizeSpeech(buffer);
      } catch (sttErr) {
        const sttErrMsg = sttErr instanceof Error ? sttErr.message : String(sttErr);
        console.error("[Collector] SpeechKit error:", sttErrMsg);
        transcriptionText = `⚠️ Ошибка распознавания речи: ${sttErrMsg}`;
      }

      // If we have a transcription, save it as a text file next to the audio
      if (transcriptionText && !transcriptionText.startsWith("⚠️")) {
        try {
          const txtName = fileName.replace(".ogg", ".txt");
          const txtBuffer = Buffer.from(transcriptionText, "utf-8");
          await uploadFileToDrive(txtBuffer, txtName, "text/plain", folderId);
        } catch (uploadErr) {
          console.error("[Collector] Error uploading transcription:", uploadErr);
        }

        // Regex check first, then LLM fallback
        let voiceTaskSaved = false;
        const voiceRegexMatch = matchTaskPattern(transcriptionText);
        if (voiceRegexMatch) {
          const { date, cleanTitle } = extractDateTime(voiceRegexMatch);
          const title = cleanTitle || voiceRegexMatch;
          try {
            await insertTask(user.id, title, transcriptionText, date);
            const dateStr = date
              ? date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
              : "без даты";
            await ctx.reply(`✅ Задача добавлена: *${title}*\n📅 ${dateStr}`, { parse_mode: "Markdown" });
            voiceTaskSaved = true;
          } catch (e) {
            console.error("[Collector] Voice task insert error:", e);
          }
        }
        if (!voiceTaskSaved) {
          try {
            const taskResult = await extractTask(transcriptionText);
            if (taskResult.isTask && taskResult.title) {
              const dueDate = taskResult.dueDate ? new Date(taskResult.dueDate) : null;
              await insertTask(user.id, taskResult.title, transcriptionText, dueDate);
              const dateStr = dueDate
                ? dueDate.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
                : "без даты";
              await ctx.reply(`✅ Задача добавлена: *${taskResult.title}*\n📅 ${dateStr}`, { parse_mode: "Markdown" });
            }
          } catch (taskErr) {
            console.error("[Collector] Voice task extraction error:", taskErr);
          }
        }
      }
    }

    // Update DB record
    await updateUploadRecord(record.id, {
      driveFileId: result.fileId,
      driveFolderId: result.folderId,
      driveUrl: result.webViewLink,
      fileMd5: hash,
      transcription: transcriptionText || undefined,
      status: "success",
    });

    // Reply with success
    const sizeStr = input.fileSize > 0 ? ` (${formatSize(input.fileSize)})` : "";
    let replyText = `✅ Файл сохранён в папку \`${tag}\`${sizeStr}\n📄 \`${fileName}\`\n🔗 [Открыть в Drive](${result.webViewLink})`;
    
    if (input.contentType === "voice" && transcriptionText) {
      replyText += `\n\n📝 *Распознанный текст:*\n_${transcriptionText}_`;
    }

    await ctx.reply(replyText, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    await updateUploadRecord(record.id, { status: "error", errorMessage: errMsg });
    await ctx.reply(`❌ Ошибка загрузки файла \`${input.originalName}\`. Пожалуйста, попробуйте позже.`, {
      parse_mode: "Markdown",
    });
    console.error("[Collector] File upload error:", err);
  }
}
