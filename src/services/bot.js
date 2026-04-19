"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBot = getBot;
const telegraf_1 = require("telegraf");
const filters_1 = require("telegraf/filters");
const env_1 = require("../lib/env");
const user_service_1 = require("./user-service");
const upload_service_1 = require("./upload-service");
const google_drive_1 = require("./google-drive");
const helpers_1 = require("../lib/helpers");
const yandex_speechkit_1 = require("./yandex-speechkit");
// ─── Bot singleton ──────────────────────────────────────────────────────
let bot = null;
function getBot() {
    if (bot)
        return bot;
    bot = new telegraf_1.Telegraf(env_1.env.TELEGRAM_BOT_TOKEN);
    registerHandlers(bot);
    return bot;
}
async function authMiddleware(ctx, next) {
    var _a;
    const telegramId = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.id;
    if (!telegramId)
        return;
    const user = await (0, user_service_1.getAuthorizedUser)(BigInt(telegramId));
    if (!user) {
        await ctx.reply(`⛔ Доступ запрещен. Ваш ID: \`${telegramId}\`. Обратитесь к администратору.`, { parse_mode: "Markdown" });
        return;
    }
    ctx.dbUser = user;
    return next();
}
// ─── Register handlers ─────────────────────────────────────────────────
function registerHandlers(bot) {
    // Apply auth to all messages
    bot.use(authMiddleware);
    // ── Commands ──────────────────────────────────────────────────────
    bot.command("start", async (ctx) => {
        const user = ctx.dbUser;
        await ctx.reply(`👋 Привет, ${user.firstName || user.username || "друг"}!\n\n` +
            `Я — *Collector Bot*. Отправь мне файл, фото, голосовое сообщение или текст, ` +
            `и я сохраню это в Google Drive.\n\n` +
            `📌 *Тегирование:* добавь хештег (например \`#ПроектА\`) в подпись или текст, ` +
            `чтобы файл попал в нужную папку. Без тега → папка \`Inbox\`.\n\n` +
            `Команды: /help /status /stats /list`, { parse_mode: "Markdown" });
    });
    bot.command("help", async (ctx) => {
        await ctx.reply(`📖 *Справка*\n\n` +
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
            `/status — проверка сервисов`, { parse_mode: "Markdown" });
    });
    bot.command("status", async (ctx) => {
        const dbOk = await (0, user_service_1.checkDbConnection)();
        const driveOk = await (0, google_drive_1.checkDriveConnection)();
        await ctx.reply(`🔍 *Статус сервисов*\n\n` +
            `• База данных: ${dbOk ? "✅ OK" : "❌ Недоступна"}\n` +
            `• Google Drive: ${driveOk ? "✅ OK" : "❌ Недоступен"}`, { parse_mode: "Markdown" });
    });
    bot.command("stats", async (ctx) => {
        const user = ctx.dbUser;
        const stats = await (0, upload_service_1.getUserStats)(user.id);
        const tagsStr = stats.topTags.length > 0
            ? stats.topTags.map((t, i) => `  ${i + 1}. \`${t.tag}\` — ${t.count}`).join("\n")
            : "  Нет данных";
        await ctx.reply(`📊 *Ваша статистика*\n\n` +
            `Всего файлов: *${stats.total}*\n` +
            `За сегодня: *${stats.today}*\n\n` +
            `🏷 Топ-3 тега:\n${tagsStr}`, { parse_mode: "Markdown" });
    });
    bot.command("list", async (ctx) => {
        const user = ctx.dbUser;
        const args = ctx.message.text.split(" ").slice(1);
        const tag = args[0] || undefined;
        const items = await (0, upload_service_1.getRecentUploads)(user.id, 5, tag);
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
        await ctx.reply(`📂 *Последние загрузки*${tag ? ` (тег: ${tag})` : ""}:\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
    });
    // ── File handlers ─────────────────────────────────────────────────
    // Documents
    bot.on((0, filters_1.message)("document"), async (ctx) => {
        var _a, _b;
        const user = ctx.dbUser;
        const doc = ctx.message.document;
        if (doc.file_size && doc.file_size > helpers_1.MAX_FILE_SIZE) {
            await ctx.reply(`❌ Файл слишком большой (${(0, helpers_1.formatSize)(doc.file_size)}). Максимальный размер: 20 МБ.`);
            return;
        }
        await processFile(ctx, user, {
            contentType: "document",
            fileId: doc.file_id,
            fileSize: (_a = doc.file_size) !== null && _a !== void 0 ? _a : 0,
            originalName: (_b = doc.file_name) !== null && _b !== void 0 ? _b : "unnamed",
            mimeType: doc.mime_type,
            caption: ctx.message.caption,
        });
    });
    // Photos
    bot.on((0, filters_1.message)("photo"), async (ctx) => {
        var _a;
        const user = ctx.dbUser;
        // Take the largest photo size
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        await processFile(ctx, user, {
            contentType: "photo",
            fileId: photo.file_id,
            fileSize: (_a = photo.file_size) !== null && _a !== void 0 ? _a : 0,
            originalName: `photo_${photo.file_unique_id}.jpg`,
            caption: ctx.message.caption,
        });
    });
    // Voice messages
    bot.on((0, filters_1.message)("voice"), async (ctx) => {
        var _a;
        const user = ctx.dbUser;
        const voice = ctx.message.voice;
        await processFile(ctx, user, {
            contentType: "voice",
            fileId: voice.file_id,
            fileSize: (_a = voice.file_size) !== null && _a !== void 0 ? _a : 0,
            originalName: `voice_${Date.now()}.ogg`,
            caption: undefined, // voice messages don't have captions in Telegram
        });
    });
    // Text messages (notes)
    bot.on((0, filters_1.message)("text"), async (ctx) => {
        const user = ctx.dbUser;
        const text = ctx.message.text;
        // Skip if it starts with / (handled by commands above)
        if (text.startsWith("/"))
            return;
        const tag = (0, helpers_1.extractTag)(text);
        const fileName = (0, helpers_1.buildFileName)("text", `note_${Date.now()}.txt`);
        const buffer = Buffer.from(text, "utf-8");
        const record = await (0, upload_service_1.createUploadRecord)({
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
            const folderId = await (0, google_drive_1.getOrCreateFolder)(tag);
            const hash = (0, helpers_1.md5)(buffer);
            // Dedup check
            const dup = await (0, upload_service_1.findDuplicateByMd5)(user.id, hash);
            if (dup) {
                await ctx.reply(`⚠️ Эта заметка уже была загружена ранее.\n🔗 [Открыть в Drive](${dup.driveUrl})`, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
                await (0, upload_service_1.updateUploadRecord)(record.id, { status: "success", fileMd5: hash, driveFileId: dup.driveFileId, driveFolderId: dup.driveFolderId, driveUrl: dup.driveUrl });
                return;
            }
            const result = await (0, google_drive_1.uploadFileToDrive)(buffer, fileName, "text/plain", folderId);
            await (0, upload_service_1.updateUploadRecord)(record.id, {
                driveFileId: result.fileId,
                driveFolderId: result.folderId,
                driveUrl: result.webViewLink,
                fileMd5: hash,
                status: "success",
            });
            await ctx.reply(`✅ Заметка сохранена в папку \`${tag}\`\n🔗 [Открыть в Drive](${result.webViewLink})`, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            await (0, upload_service_1.updateUploadRecord)(record.id, { status: "error", errorMessage: errMsg });
            await ctx.reply(`❌ Ошибка загрузки заметки. Пожалуйста, попробуйте позже.`);
            console.error("[Collector] Text upload error:", err);
        }
    });
}
async function processFile(ctx, user, input) {
    var _a;
    const tag = (0, helpers_1.extractTag)(input.caption);
    const fileName = (0, helpers_1.buildFileName)(input.contentType, input.originalName);
    const mimeType = (_a = input.mimeType) !== null && _a !== void 0 ? _a : (0, helpers_1.getMimeType)(input.contentType, input.originalName);
    // Create pending upload record
    const record = await (0, upload_service_1.createUploadRecord)({
        userId: user.id,
        messageId: BigInt(ctx.message.message_id),
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
        if (!response.ok)
            throw new Error(`Failed to download from Telegram: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        // MD5 dedup check
        const hash = (0, helpers_1.md5)(buffer);
        const dup = await (0, upload_service_1.findDuplicateByMd5)(user.id, hash);
        if (dup) {
            await ctx.reply(`⚠️ Этот файл уже был загружен ранее: \`${dup.fileName}\`\n🔗 [Открыть в Drive](${dup.driveUrl})`, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
            await (0, upload_service_1.updateUploadRecord)(record.id, { status: "success", fileMd5: hash, driveFileId: dup.driveFileId, driveFolderId: dup.driveFolderId, driveUrl: dup.driveUrl });
            return;
        }
        // Upload to Drive
        const folderId = await (0, google_drive_1.getOrCreateFolder)(tag);
        const result = await (0, google_drive_1.uploadFileToDrive)(buffer, fileName, mimeType, folderId);
        let transcriptionText = "";
        if (input.contentType === "voice") {
            try {
                transcriptionText = await (0, yandex_speechkit_1.recognizeSpeech)(buffer);
            }
            catch (sttErr) {
                console.error("[Collector] SpeechKit error:", sttErr);
                transcriptionText = "⚠️ Ошибка распознавания речи";
            }
            // If we have a transcription, save it as a text file next to the audio
            if (transcriptionText && !transcriptionText.startsWith("⚠️")) {
                try {
                    const txtName = fileName.replace(".ogg", ".txt");
                    const txtBuffer = Buffer.from(transcriptionText, "utf-8");
                    await (0, google_drive_1.uploadFileToDrive)(txtBuffer, txtName, "text/plain", folderId);
                }
                catch (uploadErr) {
                    console.error("[Collector] Error uploading transcription:", uploadErr);
                }
            }
        }
        // Update DB record
        await (0, upload_service_1.updateUploadRecord)(record.id, {
            driveFileId: result.fileId,
            driveFolderId: result.folderId,
            driveUrl: result.webViewLink,
            fileMd5: hash,
            transcription: transcriptionText || undefined,
            status: "success",
        });
        // Reply with success
        const sizeStr = input.fileSize > 0 ? ` (${(0, helpers_1.formatSize)(input.fileSize)})` : "";
        let replyText = `✅ Файл сохранён в папку \`${tag}\`${sizeStr}\n📄 \`${fileName}\`\n🔗 [Открыть в Drive](${result.webViewLink})`;
        if (input.contentType === "voice" && transcriptionText) {
            replyText += `\n\n📝 *Распознанный текст:*\n_${transcriptionText}_`;
        }
        await ctx.reply(replyText, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        await (0, upload_service_1.updateUploadRecord)(record.id, { status: "error", errorMessage: errMsg });
        await ctx.reply(`❌ Ошибка загрузки файла \`${input.originalName}\`. Пожалуйста, попробуйте позже.`, {
            parse_mode: "Markdown",
        });
        console.error("[Collector] File upload error:", err);
    }
}
