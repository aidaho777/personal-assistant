/**
 * Debug script — simulates a Telegram webhook update and checks if bot replies
 */
import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const USER_ID = 279574665;

const bot = new Telegraf(BOT_TOKEN);

bot.command("start", async (ctx) => {
  console.log("[DEBUG] /start handler triggered for user:", ctx.from?.id);
  try {
    const result = await ctx.reply("Debug: /start received and reply sent!");
    console.log("[DEBUG] Reply sent, message_id:", result.message_id);
  } catch (err: unknown) {
    console.error("[DEBUG] Reply failed:", err instanceof Error ? err.message : err);
  }
});

const update = {
  update_id: 12345,
  message: {
    message_id: 12345,
    from: { id: USER_ID, is_bot: false, first_name: "Alexey", username: "arbatello" },
    chat: { id: USER_ID, type: "private" as const },
    date: Math.floor(Date.now() / 1000),
    text: "/start",
  },
};

console.log("[DEBUG] Sending update to bot.handleUpdate...");
bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0])
  .then(() => {
    console.log("[DEBUG] handleUpdate completed");
    setTimeout(() => process.exit(0), 3000);
  })
  .catch((err: unknown) => {
    console.error("[DEBUG] handleUpdate error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
