"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthorizedUser = getAuthorizedUser;
exports.checkDbConnection = checkDbConnection;
const db_1 = require("../../../src/db");
const drizzle_orm_1 = require("drizzle-orm");
const { users } = db_1.schema;
/**
 * Look up an authorized user by their Telegram ID.
 * Returns null if user is not in the whitelist or is deactivated.
 */
async function getAuthorizedUser(telegramId) {
    const [user] = await db_1.db
        .select()
        .from(users)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users.telegramId, telegramId), (0, drizzle_orm_1.eq)(users.isActive, true)))
        .limit(1);
    return user !== null && user !== void 0 ? user : null;
}
/**
 * Check if the database is reachable.
 */
async function checkDbConnection() {
    try {
        await db_1.db.select({ id: users.id }).from(users).limit(1);
        return true;
    }
    catch (_a) {
        return false;
    }
}
