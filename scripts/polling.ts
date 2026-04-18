/**
 * Telegram Long Polling mode — alternative to webhook.
 * Run this as a separate process when TELEGRAM_USE_POLLING=true.
 * 
 * Usage: npx tsx scripts/polling.ts
 */
import "dotenv/config";
import { getBot } from "../src/services/bot";

const bot = getBot();

console.log("🤖 Collector Bot starting in LONG POLLING mode...");
console.log("   Bot will poll Telegram API every few seconds.");
console.log("   Press Ctrl+C to stop.\n");

// Graceful shutdown
process.once("SIGINT", () => {
  console.log("\n⏹  Stopping bot (SIGINT)...");
  bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
  console.log("\n⏹  Stopping bot (SIGTERM)...");
  bot.stop("SIGTERM");
});

bot.launch({ dropPendingUpdates: true })
  .then(() => {
    console.log("✅ Bot is running and polling for updates!");
  })
  .catch((err: unknown) => {
    console.error("❌ Failed to start bot:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
