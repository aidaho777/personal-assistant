"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webUsers = exports.uploads = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
// ─── users table (whitelist) ───────────────────────────────────────────
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    telegramId: (0, pg_core_1.bigint)("telegram_id", { mode: "bigint" }).notNull().unique(),
    username: (0, pg_core_1.varchar)("username", { length: 64 }),
    firstName: (0, pg_core_1.varchar)("first_name", { length: 128 }),
    role: (0, pg_core_1.varchar)("role", { length: 16 }).notNull().default("user"), // 'admin' | 'user'
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
});
// ─── uploads table (upload journal) ────────────────────────────────────
exports.uploads = (0, pg_core_1.pgTable)("uploads", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id),
    messageId: (0, pg_core_1.bigint)("message_id", { mode: "bigint" }).notNull(),
    contentType: (0, pg_core_1.varchar)("content_type", { length: 16 }).notNull(), // 'document' | 'photo' | 'voice' | 'text'
    originalName: (0, pg_core_1.varchar)("original_name", { length: 255 }),
    fileName: (0, pg_core_1.varchar)("file_name", { length: 255 }).notNull(),
    fileSize: (0, pg_core_1.integer)("file_size"), // bytes
    tag: (0, pg_core_1.varchar)("tag", { length: 64 }).notNull().default("Inbox"),
    driveFolderId: (0, pg_core_1.varchar)("drive_folder_id", { length: 128 }),
    driveFileId: (0, pg_core_1.varchar)("drive_file_id", { length: 128 }),
    driveUrl: (0, pg_core_1.text)("drive_url"),
    fileMd5: (0, pg_core_1.varchar)("file_md5", { length: 32 }), // for deduplication
    status: (0, pg_core_1.varchar)("status", { length: 16 }).notNull().default("pending"), // 'success' | 'error' | 'pending'
    errorMessage: (0, pg_core_1.text)("error_message"),
    transcription: (0, pg_core_1.text)("transcription"), // For voice messages
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    userIdIdx: (0, pg_core_1.index)("uploads_user_id_idx").on(table.userId),
    statusIdx: (0, pg_core_1.index)("uploads_status_idx").on(table.status),
    tagIdx: (0, pg_core_1.index)("uploads_tag_idx").on(table.tag),
    createdAtIdx: (0, pg_core_1.index)("uploads_created_at_idx").on(table.createdAt),
}));
// ─── web_users table (web dashboard auth) ─────────────────────────────
exports.webUsers = (0, pg_core_1.pgTable)("web_users", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull().unique(),
    name: (0, pg_core_1.varchar)("name", { length: 128 }),
    passwordHash: (0, pg_core_1.varchar)("password_hash", { length: 255 }),
    avatarUrl: (0, pg_core_1.text)("avatar_url"),
    role: (0, pg_core_1.varchar)("role", { length: 16 }).notNull().default("user"),
    telegramUserId: (0, pg_core_1.uuid)("telegram_user_id").references(() => exports.users.id),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: (0, pg_core_1.timestamp)("last_login_at", { withTimezone: true }),
});
