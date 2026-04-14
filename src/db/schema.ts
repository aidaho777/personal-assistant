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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("uploads_user_id_idx").on(table.userId),
    statusIdx: index("uploads_status_idx").on(table.status),
    tagIdx: index("uploads_tag_idx").on(table.tag),
    createdAtIdx: index("uploads_created_at_idx").on(table.createdAt),
  })
);

// ─── Type helpers ──────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
