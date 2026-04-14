import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/services/bot";
import { env } from "@/lib/env";
import { createHash } from "crypto";

/**
 * Telegram sends POST requests to this endpoint when the webhook is set.
 * We verify the secret_token header, then pass the update to Telegraf.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret (Telegram sends it in X-Telegram-Bot-Api-Secret-Token)
    const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn("[Webhook] Invalid secret token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const bot = getBot();

    // Process the update via Telegraf
    await bot.handleUpdate(body);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook] Error processing update:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET endpoint — health check / info.
 */
export async function GET() {
  return NextResponse.json({
    status: "Collector Bot webhook is active",
    timestamp: new Date().toISOString(),
  });
}
