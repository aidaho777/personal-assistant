"use strict";
/**
 * Telegram Long Polling mode — production entry point.
 * Registers @/ path alias so compiled JS files work without tsx.
 */

// ─── Register @/ → src/ alias BEFORE any other require ─────────────────────
const path = require("path");
const moduleAlias = require("module-alias");
// Must use absolute path for module-alias to work correctly
moduleAlias.addAlias("@", path.resolve(__dirname, "../src"));

// ─── Now safe to load bot (uses @/lib/env etc.) ─────────────────────────────
require("dotenv/config");
const { getBot } = require("../src/services/bot");

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;

async function startPolling(attempt = 1) {
  const bot = getBot();
  console.log(`🤖 Collector Bot starting in LONG POLLING mode... (attempt ${attempt}/${MAX_RETRIES})`);
  console.log("   Bot will poll Telegram API every few seconds.");
  console.log("   Press Ctrl+C to stop.\n");

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("409") || message.includes("Conflict")) {
      if (attempt >= MAX_RETRIES) {
        console.error(`❌ Max retries (${MAX_RETRIES}) reached. Giving up.`);
        process.exit(1);
      }
      console.warn(`⚠️  409 Conflict: another bot instance is running. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return startPolling(attempt + 1);
    }
    console.error("❌ Failed to start bot:", message);
    process.exit(1);
  }
}

startPolling();
