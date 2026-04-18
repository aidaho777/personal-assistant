import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const folderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  let saStatus = "missing";
  let saError = "";

  if (saJson) {
    try {
      const parsed = JSON.parse(saJson);
      saStatus = `ok — type: ${parsed.type}, project: ${parsed.project_id}, email: ${parsed.client_email}`;
    } catch (e: unknown) {
      saStatus = "invalid JSON";
      saError = e instanceof Error ? e.message : String(e);
      // Show first 200 chars to debug
      saError += ` | First 200 chars: ${saJson.substring(0, 200)}`;
    }
  }

  return NextResponse.json({
    TELEGRAM_BOT_TOKEN: botToken ? `set (${botToken.substring(0, 10)}...)` : "MISSING",
    GOOGLE_DRIVE_ROOT_FOLDER_ID: folderId || "MISSING",
    GOOGLE_SERVICE_ACCOUNT_JSON: saStatus,
    saError: saError || undefined,
  });
}
