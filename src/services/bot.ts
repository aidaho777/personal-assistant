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
import type { User } from "../db/schema";
import postgres from "postgres";

// ─── Task helpers ───────────────────────────────────────────────────────

function getTaskDb() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (!url) throw new Error("No DATABASE_URL or DATABASE_PUBLIC_URL");
  return postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10 });
}

const TASK_KEYWORDS_REGEX = /задач[уа]|напомни|запланируй|нужно|не забыть|todo|поставь.*задач|запиши.*задач|зафиксируй|добавь.*задач/i;

/**
 * If `text` looks like a task command, parse it and INSERT into tasks table.
 * Returns { created, title, dueDate } so the caller can format the reply.
 *
 * Handles cases like "Добрый день прошу поставить на завтра задачу приготовить завтрак":
 * date is parsed from the full text first, then everything up to the task
 * keyword is stripped to get the title.
 */
async function tryCreateTaskFromText(text: string, userId: string): Promise<{ created: boolean; title?: string; dueDate?: string | null }> {
  if (!TASK_KEYWORDS_REGEX.test(text)) return { created: false };

  // 1. Parse date from the full text (so we don't lose it when stripping the prefix)
  let workingText = text;
  let dueDate: string | null = null;

  if (/послезавтра/i.test(workingText)) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(9, 0, 0, 0);
    dueDate = d.toISOString();
    workingText = workingText.replace(/послезавтра\s*/i, "");
  } else if (/на завтра|завтра/i.test(workingText)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    dueDate = d.toISOString();
    workingText = workingText.replace(/(?:на\s+)?завтра\s*/i, "");
  } else if (/сегодня/i.test(workingText)) {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    dueDate = d.toISOString();
    workingText = workingText.replace(/сегодня\s*/i, "");
  }

  const dayMatch = workingText.match(/(?:в |во )(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/i);
  if (!dueDate && dayMatch) {
    const days: Record<string, number> = { "воскресенье": 0, "понедельник": 1, "вторник": 2, "среду": 3, "четверг": 4, "пятницу": 5, "субботу": 6 };
    const target = days[dayMatch[1].toLowerCase()];
    if (target !== undefined) {
      const d = new Date();
      let diff = target - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      dueDate = d.toISOString();
    }
    workingText = workingText.replace(dayMatch[0], "");
  }

  const timeMatch = workingText.match(/в\s*(\d{1,2})[:\-](\d{2})/);
  if (timeMatch) {
    const d = dueDate ? new Date(dueDate) : new Date();
    if (!dueDate) d.setDate(d.getDate() + 1);
    d.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    dueDate = d.toISOString();
    workingText = workingText.replace(timeMatch[0], "");
  }

  // 2. Strip everything up to and including the task keyword (lazy match)
  let taskTitle = workingText
    .replace(/^.*?задач[уа]\s*[-–:,\s]*/i, "")
    .replace(/^.*?напомни(?:те)?\s*[-–:,\s]*/i, "")
    .replace(/^.*?запланируй(?:те)?\s*[-–:,\s]*/i, "")
    .replace(/^.*?не\s+забыть\s*[-–:,\s]*/i, "")
    .replace(/^.*?нужно\s*[-–:,\s]*/i, "")
    .replace(/^.*?todo\s*[-–:,\s]*/i, "")
    .replace(/^.*?зафиксируй\s*(?:задачу\s*)?[-–:,\s]*/i, "")
    .trim();

  // Final cleanup
  taskTitle = taskTitle.replace(/^\s*[-–:,]\s*/, "").replace(/\s*[-–:,]\s*$/, "").trim();
  if (!taskTitle) taskTitle = text;

  console.log("[Bot] Creating task:", taskTitle, "due:", dueDate);

  const sql = getTaskDb();
  try {
    await sql`
      INSERT INTO tasks (id, user_id, title, status, priority, source, due_date, created_at, updated_at)
      VALUES (gen_random_uuid(), ${userId}, ${taskTitle}, 'todo', 'medium', 'telegram', ${dueDate}, NOW(), NOW())
    `;
  } finally {
    await sql.end().catch(() => {});
  }

  return { created: true, title: taskTitle, dueDate };
}

function formatTaskReply(title: string, dueDate: string | null | undefined, prefix?: string): string {
  let reply = prefix ? `${prefix}\n` : "";
  reply += `✅ Задача создана: "${title}"`;
  if (dueDate) {
    const d = new Date(dueDate);
    reply += `\n📅 ${d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`;
  }
  reply += `\n📋 Список задач: /tasks`;
  return reply;
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
      `/tasks — активные задачи\n` +
      `/upcoming — задачи на ближайшие 2 дня\n` +
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
    const sql = getTaskDb();
    try {
      const rows = await sql`
        SELECT id, title, due_date
        FROM tasks
        WHERE user_id = ${user.id}::uuid AND status = 'todo'
        ORDER BY due_date ASC NULLS LAST
        LIMIT 10
      `;
      await sql.end();

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
      await sql.end().catch(() => {});
      console.error("[Bot] /tasks error:", e);
      await ctx.reply("❌ Ошибка при получении задач.");
    }
  });

  // /upcoming command — tasks for the next 48 hours
  bot.command("upcoming", async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const sql = getTaskDb();
    try {
      const rows = await sql`
        SELECT title, due_date, status FROM tasks
        WHERE user_id = ${user.id}::uuid
          AND status IN ('todo', 'in_progress')
          AND due_date IS NOT NULL
          AND due_date < NOW() + INTERVAL '48 hours'
        ORDER BY due_date ASC
        LIMIT 10
      `;
      await sql.end();

      if (rows.length === 0) {
        await ctx.reply("📋 Нет задач на ближайшие 2 дня.");
        return;
      }

      const now = new Date();
      const todayStr = now.toDateString();
      const lines = rows.map((t) => {
        const d = new Date(t.due_date as string);
        const isPast = d < now;
        const isToday = d.toDateString() === todayStr;
        const prefix = isPast ? "🔴 Просрочено" : isToday ? "🟠 Сегодня" : "🟡 Завтра";
        const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        return `${prefix} ${time} — ${t.title}`;
      });

      await ctx.reply(`📅 *Ближайшие задачи:*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
    } catch (e) {
      await sql.end().catch(() => {});
      console.error("[Bot] /upcoming error:", e);
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

    console.log("[Bot] TEXT received:", text.substring(0, 50));

    if (text.startsWith("/")) return;

    // ── Check if message is a task ──
    try {
      const result = await tryCreateTaskFromText(text, user.id);
      if (result.created && result.title) {
        await ctx.reply(formatTaskReply(result.title, result.dueDate));
        return; // EXIT — do not save as note
      }
    } catch (e) {
      console.error("[Bot] Task creation error:", e);
    }
    // ── End task check ──

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

        // Task detection from transcription (regex-based, same as text)
        try {
          const taskResult = await tryCreateTaskFromText(transcriptionText, user.id);
          if (taskResult.created && taskResult.title) {
            await updateUploadRecord(record.id, {
              driveFileId: result.fileId,
              driveFolderId: result.folderId,
              driveUrl: result.webViewLink,
              fileMd5: hash,
              transcription: transcriptionText,
              status: "success",
            });
            const preview = transcriptionText.length > 200 ? transcriptionText.substring(0, 200) + "..." : transcriptionText;
            await ctx.reply(formatTaskReply(taskResult.title, taskResult.dueDate, `🎤 Распознано: "${preview}"`));
            return; // EXIT — task created, don't send the file-saved reply
          }
        } catch (taskErr) {
          console.error("[Collector] Voice task creation error:", taskErr);
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
