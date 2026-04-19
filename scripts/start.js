const { spawn } = require("child_process");
const path = require("path");

const usePolling = process.env.TELEGRAM_USE_POLLING === "true";
const port = process.env.PORT || "3000";

console.log("🚀 Starting Collector Bot...");
console.log("   Mode: " + (usePolling ? "Long Polling + Web" : "Webhook (Web only)"));
console.log("   Port: " + port);

// ─── Start Next.js web server using `next start` ──────────────────────────
const nextServer = spawn(
  "npx",
  ["next", "start", "-p", port, "-H", "0.0.0.0"],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  }
);

nextServer.on("exit", function (code) {
  console.log("Next.js exited with code " + code);
  process.exit(code || 0);
});

// ─── Start polling bot (only when TELEGRAM_USE_POLLING=true) ───────────────
if (usePolling) {
  var tsxBin = path.join(__dirname, "../node_modules/.bin/tsx");
  var pollingScript = path.join(__dirname, "polling.ts");

  function spawnPolling(label) {
    console.log("🤖 " + label);
    var bot = spawn(tsxBin, [pollingScript], {
      stdio: "inherit",
      env: process.env,
    });

    bot.on("exit", function (code) {
      console.log("Polling bot exited with code " + code);
      if (code !== 0) {
        console.log("🔄 Polling bot crashed. Restarting in 15s...");
        setTimeout(function () {
          spawnPolling("Restarting Telegram polling bot...");
        }, 15000);
      }
    });

    process.once("SIGTERM", function () { bot.kill("SIGTERM"); });
    process.once("SIGINT", function () { bot.kill("SIGINT"); });
    return bot;
  }

  setTimeout(function () {
    spawnPolling("Starting Telegram polling bot...");
  }, 5000);
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────
process.once("SIGTERM", function () {
  console.log("Shutting down...");
  nextServer.kill("SIGTERM");
});
process.once("SIGINT", function () {
  console.log("Shutting down...");
  nextServer.kill("SIGINT");
});
