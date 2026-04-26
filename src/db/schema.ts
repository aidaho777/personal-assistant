import {
  pgTable,
  uuid,
  bigint,
  varchar,
  boolean,
  timestamp,
  integer,
  text,
  index,
  jsonb,
  vector,
} from "drizzle-orm/pg-core";

// ─── users table (whitelist) ───────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  username: varchar("username", { length: 64 }),
  firstName: varchar("first_name", { length: 128 }),
  role: varchar("role", { length: 16 }).notNull().default("user"), // 'admin' | 'user'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── uploads table (upload journal) ────────────────────────────────────
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    messageId: bigint("message_id", { mode: "bigint" }).notNull(),
    contentType: varchar("content_type", { length: 16 }).notNull(), // 'document' | 'photo' | 'voice' | 'text'
    originalName: varchar("original_name", { length: 255 }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: integer("file_size"), // bytes
    tag: varchar("tag", { length: 64 }).notNull().default("Inbox"),
    driveFolderId: varchar("drive_folder_id", { length: 128 }),
    driveFileId: varchar("drive_file_id", { length: 128 }),
    driveUrl: text("drive_url"),
    fileMd5: varchar("file_md5", { length: 32 }), // for deduplication
    status: varchar("status", { length: 16 }).notNull().default("pending"), // 'success' | 'error' | 'pending'
    errorMessage: text("error_message"),
    transcription: text("transcription"), // For voice messages
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("uploads_user_id_idx").on(table.userId),
    statusIdx: index("uploads_status_idx").on(table.status),
    tagIdx: index("uploads_tag_idx").on(table.tag),
    createdAtIdx: index("uploads_created_at_idx").on(table.createdAt),
  })
);

// ─── web_users table (web dashboard auth) ─────────────────────────────
export const webUsers = pgTable("web_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 128 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  avatarUrl: text("avatar_url"),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  telegramUserId: uuid("telegram_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// ─── document_chunks table (RAG vector store) ─────────────────────────
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    metadata: jsonb("metadata").$type<{
      fileName?: string;
      tag?: string;
      page?: number;
      position?: number;
      [key: string]: unknown;
    }>(),
    chunkIndex: integer("chunk_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uploadIdIdx: index("document_chunks_upload_id_idx").on(table.uploadId),
    userIdIdx: index("document_chunks_user_id_idx").on(table.userId),
    embeddingIdx: index("document_chunks_embedding_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops")),
  })
);

// ─── Type helpers ──────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
export type WebUser = typeof webUsers.$inferSelect;
export type NewWebUser = typeof webUsers.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;

// ─── tasks table (task manager) ──────────────────────────────────────
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    webUserId: uuid("web_user_id").references(() => webUsers.id),
    title: text("title").notNull(),
    rawMessage: text("raw_message"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    isCompleted: boolean("is_completed").notNull().default(false),
    source: varchar("source", { length: 16 }).notNull().default("telegram"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("tasks_user_id_idx").on(table.userId),
    webUserIdIdx: index("tasks_web_user_id_idx").on(table.webUserId),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
  })
);
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ─── linked_accounts table (OAuth providers) ─────────────────────────
export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => webUsers.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: integer("expires_at"),
    email: varchar("email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userProviderIdx: index("linked_accounts_user_provider_idx").on(table.userId, table.provider),
  })
);
