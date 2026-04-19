"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUploadRecord = createUploadRecord;
exports.updateUploadRecord = updateUploadRecord;
exports.findDuplicateByMd5 = findDuplicateByMd5;
exports.getUserStats = getUserStats;
exports.getRecentUploads = getRecentUploads;
const db_1 = require("../../../src/db");
const drizzle_orm_1 = require("drizzle-orm");
const { uploads } = db_1.schema;
/**
 * Insert a new upload record.
 */
async function createUploadRecord(data) {
    const [record] = await db_1.db.insert(uploads).values(data).returning();
    return record;
}
/**
 * Update an existing upload record (e.g. after Drive upload completes).
 */
async function updateUploadRecord(id, data) {
    const [record] = await db_1.db
        .update(uploads)
        .set(data)
        .where((0, drizzle_orm_1.eq)(uploads.id, id))
        .returning();
    return record;
}
/**
 * Check if a file with the same MD5 hash was already uploaded by this user.
 */
async function findDuplicateByMd5(userId, md5) {
    const [dup] = await db_1.db
        .select()
        .from(uploads)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(uploads.userId, userId), (0, drizzle_orm_1.eq)(uploads.fileMd5, md5), (0, drizzle_orm_1.eq)(uploads.status, "success")))
        .limit(1);
    return dup !== null && dup !== void 0 ? dup : null;
}
/**
 * Get user stats: total files, files today, top-3 tags.
 */
async function getUserStats(userId) {
    var _a, _b;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totalResult] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(uploads)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(uploads.userId, userId), (0, drizzle_orm_1.eq)(uploads.status, "success")));
    const [todayResult] = await db_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(uploads)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(uploads.userId, userId), (0, drizzle_orm_1.eq)(uploads.status, "success"), (0, drizzle_orm_1.gte)(uploads.createdAt, today)));
    const topTags = await db_1.db
        .select({
        tag: uploads.tag,
        count: (0, drizzle_orm_1.sql) `count(*)::int`,
    })
        .from(uploads)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(uploads.userId, userId), (0, drizzle_orm_1.eq)(uploads.status, "success")))
        .groupBy(uploads.tag)
        .orderBy((0, drizzle_orm_1.sql) `count(*) desc`)
        .limit(3);
    return {
        total: (_a = totalResult === null || totalResult === void 0 ? void 0 : totalResult.count) !== null && _a !== void 0 ? _a : 0,
        today: (_b = todayResult === null || todayResult === void 0 ? void 0 : todayResult.count) !== null && _b !== void 0 ? _b : 0,
        topTags,
    };
}
/**
 * Get the last N uploads, optionally filtered by tag.
 */
async function getRecentUploads(userId, limit = 5, tag) {
    const conditions = [(0, drizzle_orm_1.eq)(uploads.userId, userId), (0, drizzle_orm_1.eq)(uploads.status, "success")];
    if (tag) {
        conditions.push((0, drizzle_orm_1.eq)(uploads.tag, tag));
    }
    return db_1.db
        .select()
        .from(uploads)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(uploads.createdAt))
        .limit(limit);
}
