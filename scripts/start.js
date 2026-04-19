const { spawn } = require("child_process");
const path = require("path");

console.log("🤖 Starting Collector Bot (polling only)...");

const tsxBin = path.join(__dirname, "../node_modules/.bin/tsx");
const pollingScript = path.join(__dirname, "polling.ts");

function spawnPolling(label) {
  console.log("🤖 " + label);
  const bot = spawn(tsxBin, [pollingScript], {
    stdio: "inherit",
    env: process.env,
  });

  bot.on("exit", function (code) {
    console.log("Polling bot exited with code " + code);
    if (code !== 0) {
      console.log("Restarting in 15s...");
      setTimeout(function () {
        spawnPolling("Restarting...");
      }, 15000);
    }
  });

  process.once("SIGTERM", function () { bot.kill("SIGTERM"); });
  process.once("SIGINT", function () { bot.kill("SIGINT"); });
}

spawnPolling("Starting Telegram polling bot...");
