/**
 * Script to register the Telegram webhook.
 * Run with: npx tsx scripts/set-webhook.ts
 */
import "dotenv/config";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!BOT_TOKEN || !APP_URL || !SECRET) {
  console.error("Missing env vars: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL, TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}

const webhookUrl = `${APP_URL}/api/telegram/webhook`;

async function main() {
  console.log(`Setting webhook to: ${webhookUrl}`);

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: SECRET,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    }
  );

  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.ok) {
    console.log("✅ Webhook set successfully!");
  } else {
    console.error("❌ Failed to set webhook");
    process.exit(1);
  }
}

main();
