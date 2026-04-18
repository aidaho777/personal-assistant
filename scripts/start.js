/**
 * Smart launcher — checks TELEGRAM_USE_POLLING env var.
 * If true: starts bot in long-polling mode (no webhook needed).
 * If false/unset: starts Next.js web server (webhook mode).
 */
const { execSync, spawn } = require("child_process");
const path = require("path");

const usePolling = process.env.TELEGRAM_USE_POLLING === "true";

if (usePolling) {
  console.log("🔄 TELEGRAM_USE_POLLING=true — starting in Long Polling mode");
  console.log("   Next.js web server will NOT be started.");
  console.log("   Bot will poll Telegram API directly.\n");

  const pollingScript = path.join(__dirname, "polling.ts");
  const child = spawn("npx", ["tsx", pollingScript], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    console.log(`Polling process exited with code ${code}`);
    process.exit(code || 0);
  });

  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
} else {
  console.log("🌐 TELEGRAM_USE_POLLING not set — starting Next.js web server (webhook mode)");

  const child = spawn("node", [".next/standalone/server.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: process.env.PORT || "3000",
      HOSTNAME: "0.0.0.0",
    },
  });

  child.on("exit", (code) => {
    console.log(`Next.js process exited with code ${code}`);
    process.exit(code || 0);
  });

  process.once("SIGINT", () => child.kill("SIGINT"));
  process.once("SIGTERM", () => child.kill("SIGTERM"));
}
