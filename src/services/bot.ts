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
import type { User } from "../db/schema";

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

  // Text messages (notes)
  bot.on(message("text"), async (ctx) => {
    const user = (ctx as unknown as AuthContext).dbUser;
    const text = ctx.message.text;

    // Skip if it starts with / (handled by commands above)
    if (text.startsWith("/")) return;

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

      // Dedup check
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

    // Update DB record
    await updateUploadRecord(record.id, {
      driveFileId: result.fileId,
      driveFolderId: result.folderId,
      driveUrl: result.webViewLink,
      fileMd5: hash,
      status: "success",
    });

    // Reply with success
    const sizeStr = input.fileSize > 0 ? ` (${formatSize(input.fileSize)})` : "";
    await ctx.reply(
      `✅ Файл сохранён в папку \`${tag}\`${sizeStr}\n` +
      `📄 \`${fileName}\`\n` +
      `🔗 [Открыть в Drive](${result.webViewLink})`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    await updateUploadRecord(record.id, { status: "error", errorMessage: errMsg });
    await ctx.reply(`❌ Ошибка загрузки файла \`${input.originalName}\`. Пожалуйста, попробуйте позже.`, {
      parse_mode: "Markdown",
    });
    console.error("[Collector] File upload error:", err);
  }
}
