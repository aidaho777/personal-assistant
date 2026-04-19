/**
 * Smart launcher — runs Next.js web server AND polling bot simultaneously.
 * 
 * When TELEGRAM_USE_POLLING=true:
 *   - Starts Next.js on PORT (for Railway healthcheck & health endpoint)
 *   - Also starts Telegram long-polling bot as a child process
 * 
 * When TELEGRAM_USE_POLLING is not set:
 *   - Starts only Next.js (webhook mode — bot receives updates via POST)
 */
const { spawn } = require("child_process");
const path = require("path");

const usePolling = process.env.TELEGRAM_USE_POLLING === "true";
const port = process.env.PORT || "3000";

console.log(`🚀 Starting Collector Bot...`);
console.log(`   Mode: ${usePolling ? "Long Polling + Web" : "Webhook (Web only)"}`);
console.log(`   Port: ${port}`);

// ─── Start Next.js web server (always) ─────────────────────────────────────
const nextServer = spawn(
  "node",
  [path.join(__dirname, "../.next/standalone/server.js")],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: "0.0.0.0",
    },
  }
);

nextServer.on("exit", (code) => {
  console.log(`Next.js exited with code ${code}`);
  process.exit(code || 0);
});

// ─── Start polling bot (only when TELEGRAM_USE_POLLING=true) ───────────────
if (usePolling) {
  // Use tsx to run TypeScript directly — no compiled JS needed, resolves @/ aliases natively
  const tsxBin = path.join(__dirname, "../node_modules/.bin/tsx");
  const pollingScript = path.join(__dirname, "polling.ts");

  function spawnPolling(label) {
    console.log(`🤖 ${label}`);
    const bot = spawn(tsxBin, [pollingScript], {
      stdio: "inherit",
      env: process.env,
    });

    bot.on("exit", (code) => {
      console.log(`Polling bot exited with code ${code}`);
      if (code !== 0) {
        console.log("🔄 Polling bot crashed. Restarting in 15s...");
        setTimeout(() => spawnPolling("Restarting Telegram polling bot..."), 15000);
      }
    });

    process.once("SIGTERM", () => bot.kill("SIGTERM"));
    process.once("SIGINT", () => bot.kill("SIGINT"));
    return bot;
  }

  // Wait a few seconds for Next.js to initialize before starting polling
  setTimeout(() => spawnPolling("Starting Telegram polling bot..."), 5000);
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────
process.once("SIGTERM", () => {
  console.log("Shutting down...");
  nextServer.kill("SIGTERM");
});
process.once("SIGINT", () => {
  console.log("Shutting down...");
  nextServer.kill("SIGINT");
});
