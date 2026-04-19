"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Telegram Long Polling mode — alternative to webhook.
 * Run this as a separate process when TELEGRAM_USE_POLLING=true.
 *
 * Handles 409 Conflict (another instance still running) by waiting and retrying.
 * Usage: npx tsx scripts/polling.ts
 */
require("dotenv/config");
const bot_1 = require("../src/services/bot");
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000; // 10 seconds between retries
async function startPolling(attempt = 1) {
    const bot = (0, bot_1.getBot)();
    console.log(`🤖 Collector Bot starting in LONG POLLING mode... (attempt ${attempt}/${MAX_RETRIES})`);
    console.log("   Bot will poll Telegram API every few seconds.");
    console.log("   Press Ctrl+C to stop.\n");
    // Graceful shutdown
    process.once("SIGINT", () => {
        console.log("\n⏹  Stopping bot (SIGINT)...");
        bot.stop("SIGINT");
        process.exit(0);
    });
    process.once("SIGTERM", () => {
        console.log("\n⏹  Stopping bot (SIGTERM)...");
        bot.stop("SIGTERM");
        process.exit(0);
    });
    try {
        await bot.launch({ dropPendingUpdates: true });
        console.log("✅ Bot is running and polling for updates!");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 409 Conflict — another instance is still running, wait and retry
        if (message.includes("409") || message.includes("Conflict")) {
            if (attempt >= MAX_RETRIES) {
                console.error(`❌ Max retries (${MAX_RETRIES}) reached. Giving up.`);
                process.exit(1);
            }
            console.warn(`⚠️  409 Conflict: another bot instance is running. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            return startPolling(attempt + 1);
        }
        // Any other error — fatal
        console.error("❌ Failed to start bot:", message);
        process.exit(1);
    }
}
startPolling();
