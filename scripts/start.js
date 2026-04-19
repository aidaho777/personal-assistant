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
  // Wait a few seconds for Next.js to initialize before starting polling
  setTimeout(() => {
    console.log("🤖 Starting Telegram polling bot...");
    const pollingScript = path.join(__dirname, "polling.ts");
    const pollingBot = spawn("npx", ["tsx", pollingScript], {
      stdio: "inherit",
      env: process.env,
    });

    pollingBot.on("exit", (code) => {
      console.log(`Polling bot exited with code ${code}`);
      // Auto-restart polling bot after 15s if it crashed
      if (code !== 0) {
        console.log("🔄 Polling bot crashed. Restarting in 15s...");
        setTimeout(() => {
          console.log("🤖 Restarting Telegram polling bot...");
          const newBot = spawn("npx", ["tsx", pollingScript], {
            stdio: "inherit",
            env: process.env,
          });
          newBot.on("exit", (c) => console.log(`Polling bot (restart) exited with code ${c}`));
        }, 15000);
      }
    });

    process.once("SIGTERM", () => pollingBot.kill("SIGTERM"));
    process.once("SIGINT", () => pollingBot.kill("SIGINT"));
  }, 5000);
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
