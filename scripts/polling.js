"use strict";
/**
 * Telegram Long Polling mode — production entry point.
 *
 * Uses absolute paths via __dirname to load service modules.
 * This bypasses all TypeScript @/ alias issues regardless of Railway cache.
 */

// ─── Register @/ alias BEFORE any other require ─────────────────────────────
const path = require("path");
const appRoot = path.resolve(__dirname, "..");

// Patch Module._resolveFilename to handle @/ aliases
const Module = require("module");
const originalResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(appRoot, "src", request.slice(2));
  }
  return originalResolve(request, parent, isMain, options);
};

// ─── Load dependencies ───────────────────────────────────────────────────────
require("dotenv/config");

// Load bot using absolute path to avoid any cached version issues
const botPath = path.join(appRoot, "src", "services", "bot.js");
const { getBot } = require(botPath);

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
